import { BASE_GAMEPLAY, POWERUP_CONFIG } from '../../config/gameplayConfig';
import { hasWallOcclusion, worldToGridCell, wrapAngleRad } from '../../skills/geometry';
import type { MysteryCrateState } from '../../skills/types';
import type { GridCell, PlayerInputState } from '../../types/gameTypes';
import { getAccessibleNeighbors, type SeededRng } from '../MazeSystem';
import { simulateBallisticEndpoint, wallClearanceInDirection } from './aiBallistics';
import { evaluateDangerVector } from './aiDangerSensor';
import {
  computeMazeDistanceField,
  driveTankTowardVector,
  resolveWaypointFromField,
} from './aiNavigation';
import {
  AI_DIFFICULTY_PROFILES,
  type AISlotMemory,
  type AIWorldContext,
  type MazeDistanceField,
} from './aiTypes';
import { evaluateAIWeaponTactics } from './aiWeaponTactics';

/**
 * Prioritized 6-branch tactical AI Behavior Tree producing standard `PlayerInputState` commands:
 * 1. Unified Grid BFS Sensor (true corridor distances across large 22×13 & 24×14 mazes)
 * 2. Emergency Survival Reflex (Aegis Shield vs Bullets/Laser/Reaper + Warp Recall + Urgent Evasion)
 * 3. Maze-Path Target & Crate Objective Selector
 * 4. Dedicated 15-Skill Weapon Mastery & Opportunistic TNT Trap Detonation
 * 5. Doorway-Guided Short Unstuck Recovery
 * 6. 100% Nose-First Corridor Navigation & Tactic Spacing (`balanced`, `rusher`, `sniper`, `camper`)
 */
export function computeBotDecision(
  ctx: AIWorldContext,
  mem: AISlotMemory,
  rng: SeededRng,
): PlayerInputState {
  const { self, arena, difficulty, dt } = ctx;
  const barrels = ctx.barrels ?? [];
  const idle: PlayerInputState = {
    forward: false,
    backward: false,
    left: false,
    right: false,
    firePressed: false,
    fireHeld: false,
    fireBufferedUntil: 0,
  };

  if (!self.alive || ctx.selfChargingLaser) {
    return idle;
  }

  mem.clock += dt;
  if (mem.fireCooldownTimer > 0) {
    mem.fireCooldownTimer = Math.max(0, mem.fireCooldownTimer - dt);
  }
  if (mem.aimHoldTimer > 0) {
    mem.aimHoldTimer = Math.max(0, mem.aimHoldTimer - dt);
    if (mem.aimHoldTimer <= 0) mem.cachedAimAngle = null;
  }
  if (mem.gatlingSuppressTimer > 0) {
    mem.gatlingSuppressTimer = Math.max(0, mem.gatlingSuppressTimer - dt);
  }
  if (mem.mineClearTimer > 0) {
    mem.mineClearTimer = Math.max(0, mem.mineClearTimer - dt);
  }
  if (mem.homingRetreatTimer > 0) {
    mem.homingRetreatTimer = Math.max(0, mem.homingRetreatTimer - dt);
  }

  const profile = AI_DIFFICULTY_PROFILES[difficulty];
  const scale = arena.scaleRatio;
  const bulletRadius = BASE_GAMEPLAY.projectileRadius * scale;

  const enemies = ctx.tanks.filter((t) => t.alive && t.index !== self.index);
  if (enemies.length === 0) {
    return idle;
  }

  // Branch 1: Unified Maze Distance Field + Hazard/Projectile Danger Evaluation
  const selfCell = worldToGridCell(self.x, self.y, arena);
  const safeField = computeMazeDistanceField(
    selfCell,
    ctx.spikeZones,
    ctx.mines,
    arena,
    barrels,
    true,
  );
  let rawField: MazeDistanceField | null = null;
  const getRawField = () => {
    if (!rawField) {
      rawField = computeMazeDistanceField(
        selfCell,
        ctx.spikeZones,
        ctx.mines,
        arena,
        barrels,
        false,
      );
    }
    return rawField;
  };

  const cellStepDistanceTo = (wx: number, wy: number): number => {
    const gc = worldToGridCell(wx, wy, arena);
    const idx = gc.row * safeField.cols + gc.col;
    if (safeField.dist[idx] >= 0) return safeField.dist[idx];
    const fb = getRawField();
    return fb.dist[idx] >= 0 ? fb.dist[idx] + 4 : 99;
  };

  const danger = evaluateDangerVector(
    self,
    ctx.projectiles,
    ctx.spikeZones,
    ctx.mines,
    ctx.tanks,
    ctx.reaperTankIndices,
    arena,
    difficulty,
    barrels,
  );

  // Branch 2: Defensive Aegis Shield / Cryo Escape / Warp Recall Reflexes!
  if (difficulty !== 'easy') {
    for (const cz of ctx.cryoZones ?? []) {
      if (cz.age >= cz.duration) continue;
      const dx = self.x - cz.x;
      const dy = self.y - cz.y;
      const d = Math.hypot(dx, dy) || 1;
      const avoidR = cz.radius + self.radius + 14 * scale;
      if (d < avoidR) {
        const insideMul = d <= cz.radius + self.radius * 0.45 ? 2.6 : 1.5;
        const push = ((avoidR - d) / avoidR) * insideMul;
        danger.dodgeX += (dx / d) * push;
        danger.dodgeY += (dy / d) * push;
      }
    }
  }

  if (ctx.selfSkill === 'warp' && ctx.selfWarpBeaconPlaced && ctx.canFire) {
    const myBeacon = (ctx.warpBeacons ?? []).find((b) => b.ownerIndex === self.index);
    const departureKillReady = enemies.some(
      (e) =>
        !ctx.shieldedTankIndices.has(e.index) &&
        Math.hypot(e.x - self.x, e.y - self.y) <= POWERUP_CONFIG.warpBlastRadius * scale * 0.96,
    );
    const arrivalKillReady = Boolean(
      myBeacon &&
        enemies.some(
          (e) =>
            !ctx.shieldedTankIndices.has(e.index) &&
            Math.hypot(e.x - myBeacon.x, e.y - myBeacon.y) <=
              POWERUP_CONFIG.warpBlastRadius * scale * 0.96,
        ),
    );
    const emergencyEscape = danger.imminentBulletTimeSec < 0.52 || danger.threatLevel >= 0.92;
    if (departureKillReady || arrivalKillReady || emergencyEscape) {
      return {
        ...idle,
        firePressed: true,
        fireHeld: false,
        fireBufferedUntil: mem.clock + 0.12,
      };
    }
  }

  if (ctx.selfSkill === 'shield' && ctx.canFire) {
    let closeUnoccludedEnemy = false;
    let enemySuperThreat = false;
    const proxThreshold = arena.cellSize * (difficulty === 'easy' ? 1.25 : 1.75);
    const reaperThreatR = arena.cellSize * (POWERUP_CONFIG.reaperBladeCellsLength + 0.55);

    for (const e of enemies) {
      const d = Math.hypot(e.x - self.x, e.y - self.y);
      if (
        d < proxThreshold &&
        !hasWallOcclusion(self.x, self.y, e.x, e.y, bulletRadius, arena.walls)
      ) {
        closeUnoccludedEnemy = true;
      }
      if (difficulty !== 'easy') {
        if (ctx.reaperTankIndices.has(e.index) && d < reaperThreatR) {
          enemySuperThreat = true;
        }
        if (ctx.laserChargingTankIndices?.has(e.index)) {
          const beamAng = Math.atan2(self.y - e.y, self.x - e.x);
          const coneRad = ((POWERUP_CONFIG.laserAutoAimConeDeg + 5) * Math.PI) / 180;
          if (Math.abs(wrapAngleRad(beamAng - e.angle)) <= coneRad) {
            enemySuperThreat = true;
          }
        }
      }
    }

    if (danger.imminentBulletTimeSec < 0.52 || closeUnoccludedEnemy || enemySuperThreat) {
      return {
        ...idle,
        firePressed: true,
        fireHeld: true,
        fireBufferedUntil: mem.clock + 0.12,
      };
    }
  }

  // Branch 3: Maze-Path Aware Target Selection
  let primaryEnemy = enemies[0];
  let primaryEnemySteps = 99;
  let bestEnemyScore = Infinity;
  for (const e of enemies) {
    const euclid = Math.hypot(e.x - self.x, e.y - self.y);
    const steps = cellStepDistanceTo(e.x, e.y);
    const pathMetric =
      ctx.selfSkill === 'laser' || ctx.selfSkill === 'reaper'
        ? euclid
        : ctx.selfSkill === 'drill' && euclid < arena.cellSize * 5.5
          ? euclid * 0.65 + steps * arena.cellSize * 0.35
          : steps * arena.cellSize * 0.78 + euclid * 0.22;
    const shieldPenalty = ctx.shieldedTankIndices.has(e.index) ? arena.cellSize * 5 : 0;
    const score = pathMetric + shieldPenalty;
    if (score < bestEnemyScore) {
      bestEnemyScore = score;
      primaryEnemy = e;
      primaryEnemySteps = steps;
    }
  }
  const distToEnemy = Math.hypot(primaryEnemy.x - self.x, primaryEnemy.y - self.y);
  const primaryNavPreview = resolveWaypointFromField(
    self,
    primaryEnemy.x,
    primaryEnemy.y,
    safeField,
    rawField,
    arena,
  );

  // Branch 4: Specialized 15-Skill Weapon Mastery & Opportunistic TNT Detonation
  const { wantFirePressed, wantFireHeld, desiredAimAngle } = evaluateAIWeaponTactics({
    ctx,
    mem,
    rng,
    profile,
    selfCell,
    enemies,
    primaryEnemy,
    primaryEnemySteps,
    distToEnemy,
    firstDoorway: primaryNavPreview.firstDoorway,
    danger,
    barrels,
    getRawField,
  });

  // Urgent Evasion Override
  if (
    danger.threatLevel >= 0.68 &&
    (!ctx.selfShielded || danger.imminentBulletTimeSec === Infinity)
  ) {
    const allowEmergencyReverse =
      mem.mineClearTimer <= 0 && danger.imminentBulletTimeSec < 0.72;
    const move = driveTankTowardVector(
      self,
      danger.dodgeX,
      danger.dodgeY,
      profile.turnDeadbandRad,
      allowEmergencyReverse,
      arena,
    );
    return {
      ...move,
      firePressed: wantFirePressed,
      fireHeld: wantFireHeld,
      fireBufferedUntil: wantFirePressed ? mem.clock + 0.12 : 0,
    };
  }

  // Branch 5: Brief, Doorway-Guided Unstuck Recovery
  if (mem.unstuckTimer > 0) {
    mem.unstuckTimer = Math.max(0, mem.unstuckTimer - dt);
    const targetAng =
      mem.unstuckTargetAngle ??
      (primaryNavPreview.firstDoorway
        ? Math.atan2(
            primaryNavPreview.firstDoorway.y - self.y,
            primaryNavPreview.firstDoorway.x - self.x,
          )
        : self.angle + Math.PI * 0.5);
    const diff = wrapAngleRad(targetAng - self.angle);
    return {
      forward: mem.unstuckUseForward,
      backward: !mem.unstuckUseForward,
      left: diff < -0.04,
      right: diff > 0.04,
      firePressed: wantFirePressed,
      fireHeld: wantFireHeld,
      fireBufferedUntil: wantFirePressed ? mem.clock + 0.12 : 0,
    };
  }

  // Branch 6: Maze-Path Crate vs Enemy vs Post-Homing-Disengage Navigation (100% Nose-First!)
  let navGoalX = primaryEnemy.x;
  let navGoalY = primaryEnemy.y;
  let escapingHomingMissile = false;

  if (difficulty !== 'easy') {
    for (let i = 0; i < ctx.projectiles.length; i++) {
      const p = ctx.projectiles[i];
      if (!p.active || p.variant !== 'homing_missile') continue;
      const remB = Math.max(0, POWERUP_CONFIG.homingBallisticSec - p.age);
      const lockPt =
        remB > 0.03
          ? simulateBallisticEndpoint(
              p.x,
              p.y,
              Math.atan2(p.vy, p.vx),
              Math.max(10, Math.hypot(p.vx, p.vy)),
              remB,
              p.radius,
              arena.walls,
              10,
            )
          : { x: p.x, y: p.y, bounces: 0 };

      const mCell = worldToGridCell(lockPt.x, lockPt.y, arena);
      const mField = computeMazeDistanceField(
        mCell,
        ctx.spikeZones,
        ctx.mines,
        arena,
        barrels,
        false,
      );
      const selfStepsFromM = mField.dist[selfCell.row * mField.cols + selfCell.col];

      let minEnemyStepsFromM = 99;
      for (const e of enemies) {
        const ec = worldToGridCell(e.x, e.y, arena);
        const d = mField.dist[ec.row * mField.cols + ec.col];
        if (d >= 0 && d < minEnemyStepsFromM) minEnemyStepsFromM = d;
      }

      const mustPeelOff =
        mem.homingRetreatTimer > 0 ||
        remB > 0.05 ||
        (selfStepsFromM >= 0 && selfStepsFromM <= minEnemyStepsFromM + 2);

      if (mustPeelOff && selfStepsFromM >= 0 && selfStepsFromM <= 6) {
        let bestSafeCell: GridCell | null = null;
        let bestSafeScore = -Infinity;
        for (let r = 0; r < arena.grid.rows; r++) {
          for (let c = 0; c < arena.grid.cols; c++) {
            const idx = r * arena.grid.cols + c;
            const stepsFromSelf = safeField.dist[idx];
            const stepsFromMissile = mField.dist[idx];
            if (stepsFromSelf <= 0 || stepsFromSelf > 5 || stepsFromMissile < 0) continue;
            const exits = getAccessibleNeighbors(arena.grid, { col: c, row: r }).length;
            const deadEndPenalty = exits <= 1 ? 2.5 : 0;
            const score = stepsFromMissile * 1.6 - stepsFromSelf * 0.45 - deadEndPenalty;
            if (score > bestSafeScore) {
              bestSafeScore = score;
              bestSafeCell = { col: c, row: r };
            }
          }
        }
        if (bestSafeCell) {
          navGoalX = arena.originX + (bestSafeCell.col + 0.5) * arena.cellSize;
          navGoalY = arena.originY + (bestSafeCell.row + 0.5) * arena.cellSize;
          escapingHomingMissile = true;
          break;
        }
      }
    }
  }

  const lowOnEquippedSkill =
    (ctx.selfSkill === 'gatling' && ctx.selfSkillAmmo <= 4) ||
    (ctx.selfSkill === 'flame' && ctx.selfSkillAmmo <= 14) ||
    (ctx.selfSkill === 'mine' && ctx.selfSkillAmmo <= 1);

  if (
    !escapingHomingMissile &&
    (!ctx.selfSkill || lowOnEquippedSkill) &&
    ctx.crates.length > 0 &&
    profile.cratePriority > 0
  ) {
    let bestCrate: MysteryCrateState | null = null;
    let bestCratePathDist = Infinity;
    let bestCrateSteps = 99;
    for (const c of ctx.crates) {
      const cSteps = cellStepDistanceTo(c.x, c.y);
      const cMetric = cSteps * arena.cellSize * 0.8 + Math.hypot(c.x - self.x, c.y - self.y) * 0.2;
      if (cMetric < bestCratePathDist) {
        bestCratePathDist = cMetric;
        bestCrate = c;
        bestCrateSteps = cSteps;
      }
    }
    const enemyPathDist = primaryEnemySteps * arena.cellSize * 0.8 + distToEnemy * 0.2;
    const shouldTakeCrate = !ctx.selfSkill
      ? bestCratePathDist * (1 / profile.cratePriority) < enemyPathDist * 1.3
      : bestCrateSteps <= 2;
    if (bestCrate && shouldTakeCrate) {
      navGoalX = bestCrate.x;
      navGoalY = bestCrate.y;
    }
  }

  if (desiredAimAngle !== null && danger.threatLevel < 0.28 && mem.mineClearTimer <= 0) {
    const aimDiff = wrapAngleRad(desiredAimAngle - self.angle);
    const snapWindow =
      ctx.selfSkill === 'laser' || ctx.selfSkill === 'drill' ? Math.PI : 0.72;
    if (Math.abs(aimDiff) > profile.turnDeadbandRad * 0.75 && Math.abs(aimDiff) <= snapWindow) {
      return {
        forward: false,
        backward: false,
        left: aimDiff < 0,
        right: aimDiff > 0,
        firePressed: wantFirePressed,
        fireHeld: wantFireHeld,
        fireBufferedUntil: wantFirePressed ? mem.clock + 0.12 : 0,
      };
    }
  }

  const navWp = ctx.selfPhantom
    ? { x: navGoalX, y: navGoalY, cellSteps: distToEnemy > arena.cellSize ? 1 : 0 }
    : resolveWaypointFromField(self, navGoalX, navGoalY, safeField, rawField, arena);

  let moveVecX = navWp.x - self.x + danger.dodgeX * 42;
  let moveVecY = navWp.y - self.y + danger.dodgeY * 42;

  const tactic = ctx.tactic ?? 'balanced';
  const chasingCrate =
    !escapingHomingMissile && (navGoalX !== primaryEnemy.x || navGoalY !== primaryEnemy.y);
  const rushingClose =
    escapingHomingMissile ||
    (mem.homingRetreatTimer <= 0 &&
      (tactic === 'rusher' ||
        ctx.selfShielded ||
        Boolean(ctx.selfPhantom) ||
        Boolean(ctx.selfWarpBeaconPlaced) ||
        ctx.selfSkill === 'reaper' ||
        ctx.selfSkill === 'flame' ||
        ctx.selfSkill === 'scatter' ||
        (ctx.selfSkill === 'homing' && primaryEnemySteps > 10) ||
        chasingCrate));

  const preferredStandoff =
    mem.homingRetreatTimer > 0
      ? arena.cellSize * 3.4
      : tactic === 'sniper'
        ? arena.cellSize * 2.75
        : tactic === 'camper'
          ? arena.cellSize * 2.15
          : arena.cellSize * 1.15;

  if (
    !rushingClose &&
    mem.mineClearTimer <= 0 &&
    navWp.cellSteps <= (tactic === 'sniper' ? 1 : 0) &&
    distToEnemy < preferredStandoff
  ) {
    const awayX = self.x - primaryEnemy.x;
    const awayY = self.y - primaryEnemy.y;
    const kiteStrafe = tactic === 'sniper' ? 0.55 : 0.85;
    moveVecX = awayX - awayY * kiteStrafe + danger.dodgeX * 42;
    moveVecY = awayY + awayX * kiteStrafe + danger.dodgeY * 42;
  } else if (
    tactic === 'camper' &&
    !rushingClose &&
    mem.mineClearTimer <= 0 &&
    primaryEnemySteps <= 4 &&
    distToEnemy < arena.cellSize * 3.6 &&
    danger.threatLevel < 0.2
  ) {
    const aimTargetX = navWp.cellSteps > 0 ? navWp.x : primaryEnemy.x;
    const aimTargetY = navWp.cellSteps > 0 ? navWp.y : primaryEnemy.y;
    const aimDiff = wrapAngleRad(
      Math.atan2(aimTargetY - self.y, aimTargetX - self.x) - self.angle,
    );
    return {
      forward: false,
      backward: false,
      left: aimDiff < -profile.turnDeadbandRad,
      right: aimDiff > profile.turnDeadbandRad,
      firePressed: wantFirePressed,
      fireHeld: wantFireHeld,
      fireBufferedUntil: wantFirePressed ? mem.clock + 0.12 : 0,
    };
  }

  const move = driveTankTowardVector(
    self,
    moveVecX,
    moveVecY,
    profile.turnDeadbandRad,
    false,
    ctx.selfPhantom ? undefined : arena,
  );

  if (profile.throttleDutyCycle < 1 && Math.sin(mem.clock * 5.2 + self.index) > 0.65) {
    move.forward = false;
  }

  if (move.forward || move.backward) {
    const moved = Math.hypot(self.x - mem.lastProgressX, self.y - mem.lastProgressY);
    if (moved > 3.5 * scale) {
      mem.lastProgressX = self.x;
      mem.lastProgressY = self.y;
      mem.stuckTimer = 0;
    } else {
      mem.stuckTimer += dt;
      if (mem.stuckTimer >= 0.58) {
        mem.stuckTimer = 0;
        mem.unstuckTimer = 0.22;
        const fwdClear = wallClearanceInDirection(
          self.x,
          self.y,
          Math.cos(self.angle),
          Math.sin(self.angle),
          self.radius * 0.85,
          arena.cellSize * 0.8,
          arena.walls,
        );
        const rearClear = wallClearanceInDirection(
          self.x,
          self.y,
          -Math.cos(self.angle),
          -Math.sin(self.angle),
          self.radius * 0.85,
          arena.cellSize * 0.8,
          arena.walls,
        );
        mem.unstuckUseForward = fwdClear > rearClear + 6 * scale;
        mem.unstuckTargetAngle = Math.atan2(navWp.y - self.y, navWp.x - self.x);
      }
    }
  } else {
    mem.lastProgressX = self.x;
    mem.lastProgressY = self.y;
    mem.stuckTimer = 0;
  }

  return {
    ...move,
    firePressed: wantFirePressed,
    fireHeld: wantFireHeld,
    fireBufferedUntil: wantFirePressed ? mem.clock + 0.12 : 0,
  };
}
