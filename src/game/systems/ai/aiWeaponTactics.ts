import { BASE_GAMEPLAY, POWERUP_CONFIG } from '../../config/gameplayConfig';
import { hasWallOcclusion, worldToGridCell, wrapAngleRad } from '../../skills/geometry';
import { computeScatterAngles } from '../../skills/items/scatterSkill';
import type { GridCell, TankKinematics } from '../../types/gameTypes';
import type { TntBarrelState } from '../BattleModeSim';
import { getAccessibleNeighbors, type SeededRng } from '../MazeSystem';
import {
  countWallIntersections,
  isOuterBoundaryWallHit,
  simulateBallisticEndpoint,
  traceBallisticShot,
} from './aiBallistics';
import { computeMazeDistanceField } from './aiNavigation';
import type {
  AIDifficultyProfile,
  AISlotMemory,
  AIWorldContext,
  DangerAssessment,
  MazeDistanceField,
} from './aiTypes';

export interface AIWeaponTacticsParams {
  ctx: AIWorldContext;
  mem: AISlotMemory;
  rng: SeededRng;
  profile: AIDifficultyProfile;
  selfCell: GridCell;
  enemies: readonly TankKinematics[];
  primaryEnemy: TankKinematics;
  primaryEnemySteps: number;
  distToEnemy: number;
  firstDoorway: { x: number; y: number } | null;
  danger: DangerAssessment;
  barrels: readonly TntBarrelState[];
  getRawField: () => MazeDistanceField;
}

export function evaluateAIWeaponTactics(params: AIWeaponTacticsParams): {
  wantFirePressed: boolean;
  wantFireHeld: boolean;
  desiredAimAngle: number | null;
} {
  const {
    ctx,
    mem,
    rng,
    profile,
    selfCell,
    enemies,
    primaryEnemy,
    primaryEnemySteps,
    distToEnemy,
    firstDoorway,
    danger,
    barrels,
    getRawField,
  } = params;
  const { self, arena, difficulty } = ctx;
  const scale = arena.scaleRatio;
  const barrelLen = BASE_GAMEPLAY.tankBarrelLength * scale;
  const muzzleX = self.x + Math.cos(self.angle) * barrelLen;
  const muzzleY = self.y + Math.sin(self.angle) * barrelLen;
  const bulletRadius = BASE_GAMEPLAY.projectileRadius * scale;
  const bulletSpeed = BASE_GAMEPLAY.projectileSpeed * scale;
  const enemyShielded = ctx.shieldedTankIndices.has(primaryEnemy.index);

  let wantFirePressed = false;
  let wantFireHeld = false;
  let desiredAimAngle: number | null = null;

  if (ctx.selfSkill === 'laser') {
    if (!enemyShielded) {
      const angleToEnemy = Math.atan2(primaryEnemy.y - muzzleY, primaryEnemy.x - muzzleX);
      const wallsBetween = countWallIntersections(
        muzzleX,
        muzzleY,
        primaryEnemy.x,
        primaryEnemy.y,
        bulletRadius,
        arena.walls,
      );
      const safeToFreeze =
        danger.imminentBulletTimeSec > 1.15 &&
        (wallsBetween >= 1 || distToEnemy > arena.cellSize * 2.2 || difficulty === 'easy');

      if (safeToFreeze && danger.threatLevel < 0.4) {
        desiredAimAngle = angleToEnemy;
        const coneLimit = ((POWERUP_CONFIG.laserAutoAimConeDeg - 2.5) * Math.PI) / 180;
        const diff = Math.abs(wrapAngleRad(angleToEnemy - self.angle));
        if (ctx.canFire && diff <= coneLimit) {
          wantFirePressed = true;
        }
      }
    }
  } else if (ctx.selfSkill === 'reaper') {
    const wallsBetween = countWallIntersections(
      self.x,
      self.y,
      primaryEnemy.x,
      primaryEnemy.y,
      bulletRadius,
      arena.walls,
    );
    const maxSafeTriggerCells =
      wallsBetween >= 1
        ? POWERUP_CONFIG.reaperBladeCellsLength * 0.78
        : POWERUP_CONFIG.reaperBladeCellsLength * 0.66;
    const safeWindup =
      wallsBetween >= 1 || danger.imminentBulletTimeSec > 1.05 || ctx.selfShielded;
    if (
      ctx.canFire &&
      !enemyShielded &&
      safeWindup &&
      distToEnemy <= arena.cellSize * maxSafeTriggerCells
    ) {
      wantFirePressed = true;
    }
  } else if (ctx.selfSkill === 'mine') {
    const neighbors = getAccessibleNeighbors(arena.grid, selfCell);
    const isNotDeadEnd = neighbors.length >= 2;
    const alreadyMinedHere = ctx.mines.some(
      (m) => m.age < m.duration && Math.hypot(m.x - self.x, m.y - self.y) < arena.cellSize * 1.2,
    );
    const tacticalSpot =
      primaryEnemySteps <= 4 ||
      (neighbors.length >= 3 && primaryEnemySteps <= 7) ||
      (neighbors.length === 2 && primaryEnemySteps <= 5 && rng.nextFloat() < 0.18);

    if (
      ctx.canFire &&
      isNotDeadEnd &&
      !alreadyMinedHere &&
      mem.fireCooldownTimer <= 0 &&
      tacticalSpot
    ) {
      wantFirePressed = true;
      mem.fireCooldownTimer = 1.05;
      mem.mineClearTimer = 0.65;
    }
  } else if (ctx.selfSkill === 'flame') {
    const flameRange = arena.cellSize * 4.85;
    const angleToEnemy = Math.atan2(primaryEnemy.y - self.y, primaryEnemy.x - self.x);
    const diffEnemy = Math.abs(wrapAngleRad(angleToEnemy - self.angle));
    const clearSight = !hasWallOcclusion(
      self.x,
      self.y,
      primaryEnemy.x,
      primaryEnemy.y,
      bulletRadius,
      arena.walls,
    );

    let cornerSlideReady = false;
    if (
      !clearSight &&
      difficulty !== 'easy' &&
      !enemyShielded &&
      primaryEnemySteps <= 2 &&
      distToEnemy <= arena.cellSize * 2.45 &&
      firstDoorway
    ) {
      const doorAng = Math.atan2(firstDoorway.y - self.y, firstDoorway.x - self.x);
      if (danger.threatLevel < 0.35) {
        desiredAimAngle = doorAng;
      }
      if (Math.abs(wrapAngleRad(doorAng - self.angle)) < 0.36) {
        cornerSlideReady = true;
      }
    } else if (
      clearSight &&
      distToEnemy <= flameRange &&
      !enemyShielded &&
      danger.threatLevel < 0.35
    ) {
      desiredAimAngle = angleToEnemy;
    }

    const selfNearBarrelInCone = barrels.some(
      (br) =>
        br.active &&
        Math.hypot(br.x - self.x, br.y - self.y) < br.blastRadius + self.radius * 1.25 &&
        Math.abs(wrapAngleRad(Math.atan2(br.y - self.y, br.x - self.x) - self.angle)) < 0.55,
    );

    if (
      ctx.canFire &&
      !selfNearBarrelInCone &&
      ((distToEnemy <= flameRange && diffEnemy < 0.46 && clearSight && !enemyShielded) ||
        cornerSlideReady ||
        (difficulty !== 'easy' && danger.bulletInFrontCone))
    ) {
      wantFirePressed = true;
      wantFireHeld = true;
    }
  } else if (ctx.selfSkill === 'drill') {
    const drillSpeed = BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.drillSpeedMultiplier * scale;
    let targetX = primaryEnemy.x;
    let targetY = primaryEnemy.y;
    if (profile.predictiveLead) {
      const leadT = Math.min(0.38, distToEnemy / drillSpeed);
      targetX += primaryEnemy.vx * leadT;
      targetY += primaryEnemy.vy * leadT;
    }
    const angleToEnemy = Math.atan2(targetY - self.y, targetX - self.x);
    const wallsBetween = countWallIntersections(
      muzzleX,
      muzzleY,
      targetX,
      targetY,
      bulletRadius,
      arena.walls,
    );
    const hitsOuterBorder = isOuterBoundaryWallHit(
      muzzleX,
      muzzleY,
      angleToEnemy,
      arena.cellSize * 1.5,
      bulletRadius,
      arena,
    );

    const canDrillSnipe =
      !enemyShielded &&
      !hitsOuterBorder &&
      wallsBetween <= POWERUP_CONFIG.drillWallsPerShot &&
      distToEnemy < arena.cellSize * 7.2;

    const canCarveShortcut =
      difficulty !== 'easy' &&
      ctx.selfSkillAmmo >= 2 &&
      !hitsOuterBorder &&
      primaryEnemySteps >= 8 &&
      distToEnemy <= arena.cellSize * 4.6 &&
      wallsBetween >= 1 &&
      wallsBetween <= POWERUP_CONFIG.drillWallsPerShot;

    if (canDrillSnipe || canCarveShortcut) {
      desiredAimAngle = angleToEnemy;
      const diff = Math.abs(wrapAngleRad(angleToEnemy - self.angle));
      if (ctx.canFire && mem.fireCooldownTimer <= 0 && diff < 0.13) {
        wantFirePressed = true;
        mem.fireCooldownTimer = Math.max(POWERUP_CONFIG.drillCooldownSec, profile.fireIntervalSec);
      }
    }
  } else if (ctx.selfSkill === 'scatter') {
    const scatterSpeed =
      BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.scatterSpeedMultiplier * scale;
    const scatterR =
      BASE_GAMEPLAY.projectileRadius * POWERUP_CONFIG.scatterRadiusMultiplier * scale;
    const scatterBounces = Math.min(3, profile.maxBounces + (difficulty === 'easy' ? 0 : 1));
    const scatterMaxDist = arena.cellSize * (4.5 + scatterBounces * 2.2);

    const evaluateScatterVolley = (centerAng: number) => {
      const fan = computeScatterAngles(centerAng);
      let hits = 0;
      let minDist = Infinity;
      for (let i = 0; i < fan.length; i++) {
        const a = fan[i];
        const mx = self.x + Math.cos(a) * barrelLen;
        const my = self.y + Math.sin(a) * barrelLen;
        const tr = traceBallisticShot(
          mx,
          my,
          a,
          self.index,
          ctx.tanks,
          ctx.shieldedTankIndices,
          arena.walls,
          scatterBounces,
          scatterMaxDist,
          scatterR,
          profile.predictiveLead ? scatterSpeed : 0,
          barrels,
          profile.detonateTntTraps,
        );
        if (tr.selfHitRisk && tr.travelDist < arena.cellSize * 3.2) {
          return { hits: 0, safe: false, minDist: Infinity };
        }
        if (tr.hitsEnemy && !tr.selfHitRisk) {
          hits++;
          if (tr.travelDist < minDist) minDist = tr.travelDist;
        }
      }
      return { hits, safe: true, minDist };
    };

    const curVolley = evaluateScatterVolley(self.angle);
    if (curVolley.safe && curVolley.hits >= 1) {
      if (ctx.canFire && mem.fireCooldownTimer <= 0) {
        wantFirePressed = true;
        mem.fireCooldownTimer = Math.max(
          POWERUP_CONFIG.scatterCooldownSec,
          profile.fireIntervalSec,
        );
      }
    } else if (profile.rayScanAngles > 0) {
      const scanCount = Math.min(28, profile.rayScanAngles);
      let bestVolley: { angle: number; score: number } | null = null;
      for (let k = -1; k < scanCount; k++) {
        const ang =
          k < 0
            ? Math.atan2(primaryEnemy.y - self.y, primaryEnemy.x - self.x)
            : (k / scanCount) * Math.PI * 2 - Math.PI;
        const res = evaluateScatterVolley(ang);
        if (res.safe && res.hits >= 1) {
          const score = res.minDist - res.hits * 48 + Math.abs(wrapAngleRad(ang - self.angle)) * 55;
          if (!bestVolley || score < bestVolley.score) {
            bestVolley = { angle: ang, score };
          }
        }
      }
      if (bestVolley) {
        mem.cachedAimAngle = bestVolley.angle;
        mem.aimHoldTimer = 0.18;
        desiredAimAngle = bestVolley.angle;
      }
    }
  } else if (ctx.selfSkill === 'homing') {
    const hmSpeed =
      BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.homingBallisticSpeedMultiplier * scale;
    const hmR = BASE_GAMEPLAY.projectileRadius * POWERUP_CONFIG.homingRadiusMultiplier * scale;
    const ballisticReach = hmSpeed * POWERUP_CONFIG.homingBallisticSec;

    const directCheck = traceBallisticShot(
      muzzleX,
      muzzleY,
      self.angle,
      self.index,
      ctx.tanks,
      ctx.shieldedTankIndices,
      arena.walls,
      Math.min(2, profile.maxBounces),
      ballisticReach,
      hmR,
      profile.predictiveLead ? hmSpeed : 0,
      barrels,
      profile.detonateTntTraps,
    );

    if (
      directCheck.hitsEnemy &&
      !directCheck.selfHitRisk &&
      ctx.canFire &&
      mem.fireCooldownTimer <= 0
    ) {
      wantFirePressed = true;
      mem.fireCooldownTimer = profile.fireIntervalSec;
      mem.homingRetreatTimer = POWERUP_CONFIG.homingBallisticSec + 1.8;
    } else if (ctx.canFire && mem.fireCooldownTimer <= 0 && primaryEnemySteps <= 10) {
      const selfRaw = getRawField();
      const targetEnemies = enemies.filter((e) => !ctx.shieldedTankIndices.has(e.index));
      const candidatePool = targetEnemies.length > 0 ? targetEnemies : enemies;
      const enemyFields = candidatePool.map((e) => {
        const ec = worldToGridCell(e.x, e.y, arena);
        const ef = computeMazeDistanceField(ec, [], [], arena, [], false);
        const curStepsFromSelf = ef.dist[selfCell.row * arena.grid.cols + selfCell.col];
        return {
          enemy: e,
          field: ef,
          curStepsFromSelf: curStepsFromSelf >= 0 ? curStepsFromSelf : 99,
        };
      });

      const candidateAngles: number[] = [self.angle];
      if (firstDoorway) {
        const doorAng = Math.atan2(firstDoorway.y - self.y, firstDoorway.x - self.x);
        candidateAngles.push(doorAng, doorAng - 0.2, doorAng + 0.2, doorAng - 0.4, doorAng + 0.4);
      }
      candidateAngles.push(Math.atan2(primaryEnemy.y - self.y, primaryEnemy.x - self.x));

      const radialProbes = difficulty === 'easy' ? 14 : difficulty === 'normal' ? 28 : 40;
      for (let k = 0; k < radialProbes; k++) {
        candidateAngles.push((k / radialProbes) * Math.PI * 2 - Math.PI);
      }

      let bestLaunchAng: number | null = null;
      let bestLaunchScore = -Infinity;

      for (let i = 0; i < candidateAngles.length; i++) {
        const ang = candidateAngles[i];
        const mx = self.x + Math.cos(ang) * barrelLen;
        const my = self.y + Math.sin(ang) * barrelLen;

        const safetyTrace = traceBallisticShot(
          mx,
          my,
          ang,
          self.index,
          ctx.tanks,
          ctx.shieldedTankIndices,
          arena.walls,
          2,
          Math.min(ballisticReach, arena.cellSize * 3.4),
          hmR,
          0,
          barrels,
          false,
        );
        if (safetyTrace.selfHitRisk) continue;

        if (safetyTrace.hitsEnemy) {
          const directScore =
            2600 - safetyTrace.travelDist - Math.abs(wrapAngleRad(ang - self.angle)) * 45;
          if (directScore > bestLaunchScore) {
            bestLaunchScore = directScore;
            bestLaunchAng = ang;
          }
          continue;
        }

        const lockPt = simulateBallisticEndpoint(
          mx,
          my,
          ang,
          hmSpeed,
          POWERUP_CONFIG.homingBallisticSec,
          hmR,
          arena.walls,
          12,
        );
        const lockCell = worldToGridCell(lockPt.x, lockPt.y, arena);
        const lockIdx = lockCell.row * arena.grid.cols + lockCell.col;

        const selfSteps = selfRaw.dist[lockIdx];
        if (selfSteps < 1) continue;
        if (
          selfSteps === 1 &&
          Math.hypot(lockPt.x - self.x, lockPt.y - self.y) < arena.cellSize * 1.15
        ) {
          continue;
        }

        const selfTrueMazeDist =
          selfSteps * arena.cellSize + Math.hypot(lockPt.x - self.x, lockPt.y - self.y) * 0.18;

        let nearestEnemyMazeDist = Infinity;
        let advancesTowardEnemy = false;
        for (const ef of enemyFields) {
          const eSteps = ef.field.dist[lockIdx];
          if (eSteps < 0) continue;
          if (eSteps < ef.curStepsFromSelf) {
            advancesTowardEnemy = true;
          }
          const eDist =
            eSteps === 0
              ? Math.hypot(lockPt.x - ef.enemy.x, lockPt.y - ef.enemy.y)
              : eSteps * arena.cellSize +
                Math.hypot(lockPt.x - ef.enemy.x, lockPt.y - ef.enemy.y) * 0.18;
          if (eDist < nearestEnemyMazeDist) {
            nearestEnemyMazeDist = eDist;
          }
        }

        if (!advancesTowardEnemy) continue;

        const retreatBonus = difficulty === 'easy' ? 0 : arena.cellSize * 0.9;
        const mazeAdvantage = selfTrueMazeDist + retreatBonus - nearestEnemyMazeDist;
        const minRequiredAdvantage =
          difficulty === 'easy' ? arena.cellSize * 0.25 : arena.cellSize * 0.85;
        if (mazeAdvantage < minRequiredAdvantage) continue;

        const turnPenalty = Math.abs(wrapAngleRad(ang - self.angle)) * 30;
        const score = mazeAdvantage * 1.35 - nearestEnemyMazeDist * 0.95 - turnPenalty;
        if (score > bestLaunchScore) {
          bestLaunchScore = score;
          bestLaunchAng = ang;
        }
      }

      if (bestLaunchAng !== null) {
        if (Math.abs(wrapAngleRad(bestLaunchAng - self.angle)) <= 0.14) {
          wantFirePressed = true;
          mem.fireCooldownTimer = profile.fireIntervalSec;
          mem.homingRetreatTimer = POWERUP_CONFIG.homingBallisticSec + 1.8;
        } else {
          mem.cachedAimAngle = bestLaunchAng;
          mem.aimHoldTimer = 0.24;
          desiredAimAngle = bestLaunchAng;
        }
      }
    }
  } else if (ctx.selfSkill === 'phantom') {
    const wallsBetween = countWallIntersections(
      self.x,
      self.y,
      primaryEnemy.x,
      primaryEnemy.y,
      bulletRadius,
      arena.walls,
    );
    if (
      ctx.canFire &&
      ((wallsBetween >= 1 && distToEnemy <= arena.cellSize * 5.8) ||
        danger.imminentBulletTimeSec < 0.65)
    ) {
      wantFirePressed = true;
    }
  } else if (ctx.selfSkill === 'warp' && !ctx.selfWarpBeaconPlaced) {
    const exits = getAccessibleNeighbors(arena.grid, selfCell).length;
    if (
      ctx.canFire &&
      mem.fireCooldownTimer <= 0 &&
      danger.threatLevel < 0.35 &&
      exits >= 2 &&
      primaryEnemySteps <= 7 &&
      distToEnemy >= arena.cellSize * 1.4
    ) {
      wantFirePressed = true;
      mem.fireCooldownTimer = 0.45;
    }
  } else if (ctx.selfSkill === 'barrier') {
    const angleToEnemy = Math.atan2(primaryEnemy.y - self.y, primaryEnemy.x - self.x);
    const facingEnemy = Math.abs(wrapAngleRad(angleToEnemy - self.angle)) < 0.65;
    const blockThreat = danger.imminentBulletTimeSec < 0.62;
    const trapCorridor =
      facingEnemy &&
      primaryEnemySteps >= 1 &&
      primaryEnemySteps <= 3 &&
      distToEnemy <= arena.cellSize * 2.8;
    if (ctx.canFire && mem.fireCooldownTimer <= 0 && (blockThreat || trapCorridor)) {
      wantFirePressed = true;
      mem.fireCooldownTimer = 0.85;
    }
  } else if (ctx.selfSkill === 'emp') {
    const zapR = arena.cellSize * POWERUP_CONFIG.empZapCellsRadius * 0.96;
    const blastR = arena.cellSize * POWERUP_CONFIG.empBlastCellsRadius * 0.92;

    const bulletParryUrgent = danger.imminentBulletTimeSec < 0.56;
    const lethalZapReady = enemies.some(
      (e) =>
        !ctx.shieldedTankIndices.has(e.index) &&
        Math.hypot(e.x - self.x, e.y - self.y) <= zapR &&
        !hasWallOcclusion(self.x, self.y, e.x, e.y, 3.2, arena.walls),
    );
    const highValueDisrupt = enemies.some(
      (e) =>
        Math.hypot(e.x - self.x, e.y - self.y) <= blastR &&
        (ctx.shieldedTankIndices.has(e.index) ||
          ctx.reaperTankIndices.has(e.index) ||
          Boolean(ctx.laserChargingTankIndices?.has(e.index)) ||
          Math.hypot(e.x - self.x, e.y - self.y) <= arena.cellSize * 2.05),
    );

    if (
      ctx.canFire &&
      mem.fireCooldownTimer <= 0 &&
      (bulletParryUrgent || lethalZapReady || highValueDisrupt)
    ) {
      wantFirePressed = true;
      mem.fireCooldownTimer = POWERUP_CONFIG.empCooldownSec;
    }
  } else if (!ctx.selfReaperSweeping) {
    const isGatling = ctx.selfSkill === 'gatling';
    const isSpike = ctx.selfSkill === 'spike';
    const isCryo = ctx.selfSkill === 'cryo';
    const hasAmmo = ctx.selfSkill ? ctx.selfSkillAmmo > 0 : ctx.selfAmmo > 0;

    const projSpeed = isGatling
      ? bulletSpeed * POWERUP_CONFIG.gatlingSpeedMultiplier
      : isSpike
        ? bulletSpeed * POWERUP_CONFIG.spikeSpeedMultiplier
        : isCryo
          ? bulletSpeed * POWERUP_CONFIG.cryoOrbSpeedMultiplier
          : bulletSpeed;
    const projRadius = isGatling
      ? bulletRadius * POWERUP_CONFIG.gatlingRadiusMultiplier
      : isSpike
        ? bulletRadius * POWERUP_CONFIG.spikeRadiusMultiplier
        : isCryo
          ? bulletRadius * POWERUP_CONFIG.cryoOrbRadiusMultiplier
          : bulletRadius;
    const maxRayDist = isSpike
      ? projSpeed * POWERUP_CONFIG.spikeFlightDetonateSec
      : isCryo
        ? projSpeed * 2.8
        : Math.hypot(arena.width, arena.height) * (1 + profile.maxBounces * 0.55);

    if (hasAmmo) {
      const currentCheck = traceBallisticShot(
        muzzleX,
        muzzleY,
        self.angle,
        self.index,
        ctx.tanks,
        ctx.shieldedTankIndices,
        arena.walls,
        profile.maxBounces,
        maxRayDist,
        projRadius,
        profile.predictiveLead ? projSpeed : 0,
        barrels,
        profile.detonateTntTraps,
      );

      if (currentCheck.hitsEnemy && !currentCheck.selfHitRisk) {
        if (ctx.canFire && mem.fireCooldownTimer <= 0) {
          if (difficulty !== 'easy' || rng.nextFloat() < 0.72) {
            wantFirePressed = true;
            wantFireHeld = isGatling;
            if (isGatling && difficulty !== 'easy') {
              mem.gatlingSuppressTimer = 0.24;
            }
            mem.fireCooldownTimer = isGatling
              ? POWERUP_CONFIG.gatlingCooldownSec * (difficulty === 'easy' ? 2.1 : 1.02)
              : profile.fireIntervalSec;
          }
        }
      } else if (
        isGatling &&
        mem.gatlingSuppressTimer > 0 &&
        !currentCheck.selfHitRisk &&
        ctx.canFire
      ) {
        wantFirePressed = true;
        wantFireHeld = true;
      } else {
        const candidates: number[] = [];
        for (const e of enemies) {
          let tx = e.x;
          let ty = e.y;
          if (profile.predictiveLead) {
            const leadT = Math.min(0.4, Math.hypot(e.x - self.x, e.y - self.y) / projSpeed);
            tx += e.vx * leadT;
            ty += e.vy * leadT;
          }
          candidates.push(Math.atan2(ty - self.y, tx - self.x));
        }

        if (profile.detonateTntTraps) {
          for (const br of barrels) {
            if (!br.active) continue;
            const trapsEnemy = enemies.some(
              (e) =>
                !ctx.shieldedTankIndices.has(e.index) &&
                Math.hypot(e.x - br.x, e.y - br.y) <= br.blastRadius * 0.92 + e.radius,
            );
            if (trapsEnemy) {
              candidates.push(Math.atan2(br.y - self.y, br.x - self.x));
            }
          }
        }

        if (profile.rayScanAngles > 0) {
          for (let k = 0; k < profile.rayScanAngles; k++) {
            candidates.push((k / profile.rayScanAngles) * Math.PI * 2 - Math.PI);
          }
        }

        let bestShot: { angle: number; score: number } | null = null;
        for (let c = 0; c < candidates.length; c++) {
          const ang = candidates[c];
          const mx = self.x + Math.cos(ang) * barrelLen;
          const my = self.y + Math.sin(ang) * barrelLen;
          const tr = traceBallisticShot(
            mx,
            my,
            ang,
            self.index,
            ctx.tanks,
            ctx.shieldedTankIndices,
            arena.walls,
            profile.maxBounces,
            maxRayDist,
            projRadius,
            profile.predictiveLead ? projSpeed : 0,
            barrels,
            profile.detonateTntTraps,
          );
          if (tr.hitsEnemy && !tr.selfHitRisk) {
            const turnCost = Math.abs(wrapAngleRad(ang - self.angle)) * 65;
            const bounceCost = tr.bouncesUsed * 55;
            const totalCost = tr.travelDist + turnCost + bounceCost;
            if (!bestShot || totalCost < bestShot.score) {
              bestShot = { angle: ang, score: totalCost };
            }
          }
        }

        if (bestShot) {
          const jitter =
            profile.aimJitterRad > 0 ? (rng.nextFloat() - 0.5) * profile.aimJitterRad : 0;
          mem.cachedAimAngle = wrapAngleRad(bestShot.angle + jitter);
          mem.aimHoldTimer = 0.2;
          desiredAimAngle = mem.cachedAimAngle;
        } else if (
          isSpike &&
          difficulty !== 'easy' &&
          ctx.canFire &&
          mem.fireCooldownTimer <= 0
        ) {
          let bestBurstAng: number | null = null;
          let bestBurstDist = arena.cellSize * 1.65;
          const burstProbes = 20;
          for (let k = 0; k < burstProbes; k++) {
            const ang = (k / burstProbes) * Math.PI * 2 - Math.PI;
            const mx = self.x + Math.cos(ang) * barrelLen;
            const my = self.y + Math.sin(ang) * barrelLen;
            const safeTr = traceBallisticShot(
              mx,
              my,
              ang,
              self.index,
              ctx.tanks,
              ctx.shieldedTankIndices,
              arena.walls,
              3,
              projSpeed * 2.0,
              projRadius,
            );
            if (safeTr.selfHitRisk) continue;
            const detPt = simulateBallisticEndpoint(
              mx,
              my,
              ang,
              projSpeed,
              POWERUP_CONFIG.spikeFlightDetonateSec,
              projRadius,
              arena.walls,
              12,
            );
            const selfDistToDet = Math.hypot(detPt.x - self.x, detPt.y - self.y);
            if (selfDistToDet < arena.cellSize * 2.3) continue;
            const enemyDistToDet = Math.hypot(detPt.x - primaryEnemy.x, detPt.y - primaryEnemy.y);
            if (enemyDistToDet < bestBurstDist) {
              bestBurstDist = enemyDistToDet;
              bestBurstAng = ang;
            }
          }
          if (bestBurstAng !== null) {
            if (Math.abs(wrapAngleRad(bestBurstAng - self.angle)) <= 0.14) {
              wantFirePressed = true;
              mem.fireCooldownTimer = profile.fireIntervalSec;
            } else {
              desiredAimAngle = bestBurstAng;
            }
          }
        } else if (mem.cachedAimAngle !== null) {
          desiredAimAngle = mem.cachedAimAngle;
        }
      }
    }
  }

  return { wantFirePressed, wantFireHeld, desiredAimAngle };
}
