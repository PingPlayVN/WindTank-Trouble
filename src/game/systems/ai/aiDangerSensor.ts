import { POWERUP_CONFIG } from '../../config/gameplayConfig';
import { doorwayWorldPoint, hasWallOcclusion, worldToGridCell } from '../../skills/geometry';
import type { GroundSpikeZone, ProximityMineState } from '../../skills/types';
import type {
  AIDifficulty,
  BuiltArenaLayout,
  PlayerIndex,
  ProjectileKinematics,
  TankKinematics,
} from '../../types/gameTypes';
import type { TntBarrelState } from '../BattleModeSim';
import { sweepCircleAgainstWall } from '../CollisionSystem';
import { getAccessibleNeighbors } from '../MazeSystem';
import {
  rayCircleFirstHitDist,
  simulateBallisticEndpoint,
  wallClearanceInDirection,
} from './aiBallistics';
import { computeMazeDistanceField } from './aiNavigation';
import { AI_DIFFICULTY_PROFILES, type DangerAssessment } from './aiTypes';

export function evaluateDangerVector(
  self: TankKinematics,
  projectiles: readonly ProjectileKinematics[],
  spikeZones: readonly GroundSpikeZone[],
  mines: readonly ProximityMineState[],
  tanks: readonly TankKinematics[],
  reaperIndices: ReadonlySet<PlayerIndex>,
  arena: BuiltArenaLayout,
  difficulty: AIDifficulty,
  barrels: readonly TntBarrelState[] = [],
): DangerAssessment {
  const profile = AI_DIFFICULTY_PROFILES[difficulty];
  if (profile.dodgeWeight <= 0) {
    return {
      threatLevel: 0,
      dodgeX: 0,
      dodgeY: 0,
      imminentBulletTimeSec: Infinity,
      bulletInFrontCone: false,
    };
  }

  let dodgeX = 0;
  let dodgeY = 0;
  let threatLevel = 0;
  let imminentBulletTimeSec = Infinity;
  let bulletInFrontCone = false;

  const scale = arena.scaleRatio;
  const dangerCorridor = self.radius + 22 * scale;
  const lookaheadSec = difficulty === 'super_hard' ? 1.15 : difficulty === 'hard' ? 0.85 : 0.6;
  const selfFwdX = Math.cos(self.angle);
  const selfFwdY = Math.sin(self.angle);

  const considerProjectileSegment = (
    px: number,
    py: number,
    vx: number,
    vy: number,
    pRadius: number,
    weightScale: number,
  ) => {
    const speed = Math.hypot(vx, vy);
    if (speed < 10) return;
    const ux = vx / speed;
    const uy = vy / speed;

    const toSelfX = self.x - px;
    const toSelfY = self.y - py;
    const along = toSelfX * ux + toSelfY * uy;

    const toBulletDist = Math.hypot(px - self.x, py - self.y) || 1;
    if (along > 0 && toBulletDist < 168 * scale) {
      const dotFront =
        ((px - self.x) / toBulletDist) * selfFwdX + ((py - self.y) / toBulletDist) * selfFwdY;
      if (
        dotFront > 0.72 &&
        !hasWallOcclusion(self.x, self.y, px, py, pRadius * 0.8, arena.walls)
      ) {
        bulletInFrontCone = true;
      }
    }

    if (along < -self.radius || along > speed * lookaheadSec) return;

    const tti = Math.max(0.02, along / speed);
    const closestX = px + ux * Math.max(0, along);
    const closestY = py + uy * Math.max(0, along);
    const perpX = self.x - closestX;
    const perpY = self.y - closestY;
    const perpDist = Math.hypot(perpX, perpY);
    const safeDist = dangerCorridor + pRadius;

    if (perpDist > safeDist) return;

    if (along > 4 && hasWallOcclusion(px, py, closestX, closestY, pRadius * 0.8, arena.walls)) {
      return;
    }

    if (tti < imminentBulletTimeSec && perpDist <= self.radius + pRadius + 10 * scale) {
      imminentBulletTimeSec = tti;
    }

    const n1x = -uy;
    const n1y = ux;
    const n2x = uy;
    const n2y = -ux;

    const clear1 = wallClearanceInDirection(
      self.x,
      self.y,
      n1x,
      n1y,
      self.radius * 0.9,
      54 * scale,
      arena.walls,
    );
    const clear2 = wallClearanceInDirection(
      self.x,
      self.y,
      n2x,
      n2y,
      self.radius * 0.9,
      54 * scale,
      arena.walls,
    );
    const sideBias1 = perpX * n1x + perpY * n1y;
    const score1 = clear1 + sideBias1 * 1.6;
    const score2 = clear2 - sideBias1 * 1.6;

    const sx = score1 >= score2 ? n1x : n2x;
    const sy = score1 >= score2 ? n1y : n2y;

    const urgency = ((safeDist - perpDist) / safeDist + 0.45) * (1 / (0.18 + tti)) * weightScale;
    dodgeX += sx * urgency;
    dodgeY += sy * urgency;
    threatLevel = Math.max(threatLevel, urgency);
  };

  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (!p.active) continue;
    if (p.ownerIndex === self.index && p.bounces === 0 && p.age < 0.22) continue;

    considerProjectileSegment(p.x, p.y, p.vx, p.vy, p.radius, 1.0);

    if (profile.predictBounceThreats && p.variant !== 'flame') {
      const speed = Math.hypot(p.vx, p.vy);
      if (speed > 20) {
        const probeDist = speed * 0.65;
        const dx = (p.vx / speed) * probeDist;
        const dy = (p.vy / speed) * probeDist;
        let hitWall: { t: number; nx: number; ny: number } | null = null;
        for (let w = 0; w < arena.walls.length; w++) {
          const wh = sweepCircleAgainstWall(p.x, p.y, dx, dy, p.radius, arena.walls[w]);
          if (wh && (!hitWall || wh.t < hitWall.t)) hitWall = wh;
        }
        if (hitWall) {
          const bx = p.x + dx * hitWall.t;
          const by = p.y + dy * hitWall.t;
          const dot = p.vx * hitWall.nx + p.vy * hitWall.ny;
          const rvx = p.vx - 2 * dot * hitWall.nx;
          const rvy = p.vy - 2 * dot * hitWall.ny;
          considerProjectileSegment(bx, by, rvx, rvy, p.radius, 0.7);
        }
      }
    }

    if (p.variant === 'homing_missile') {
      const remBallistic = Math.max(0, POWERUP_CONFIG.homingBallisticSec - p.age);
      const lockPt =
        remBallistic > 0.03
          ? simulateBallisticEndpoint(
              p.x,
              p.y,
              Math.atan2(p.vy, p.vx),
              Math.max(10, Math.hypot(p.vx, p.vy)),
              remBallistic,
              p.radius,
              arena.walls,
              8,
            )
          : { x: p.x, y: p.y, bounces: 0 };

      const mCell = worldToGridCell(lockPt.x, lockPt.y, arena);
      const mField = computeMazeDistanceField(mCell, [], [], arena, [], false);
      const selfCellNow = worldToGridCell(self.x, self.y, arena);
      const selfIdxNow = selfCellNow.row * mField.cols + selfCellNow.col;
      const selfStepsFromM = mField.dist[selfIdxNow];

      let minOtherStepsFromM = 99;
      for (const t of tanks) {
        if (!t.alive || t.index === self.index) continue;
        const tc = worldToGridCell(t.x, t.y, arena);
        const d = mField.dist[tc.row * mField.cols + tc.col];
        if (d >= 0 && d < minOtherStepsFromM) minOtherStepsFromM = d;
      }

      if (
        selfStepsFromM >= 0 &&
        (selfStepsFromM <= 3 || selfStepsFromM <= minOtherStepsFromM + 1)
      ) {
        let bestEscapeDoor: { x: number; y: number } | null = null;
        let bestEscapeScore = selfStepsFromM * arena.cellSize;
        for (const nb of getAccessibleNeighbors(arena.grid, selfCellNow)) {
          const nbSteps = mField.dist[nb.row * mField.cols + nb.col];
          if (nbSteps < 0) continue;
          const door = doorwayWorldPoint(selfCellNow, nb, arena);
          const score =
            nbSteps * arena.cellSize + Math.hypot(door.x - lockPt.x, door.y - lockPt.y) * 0.25;
          if (score > bestEscapeScore) {
            bestEscapeScore = score;
            bestEscapeDoor = door;
          }
        }
        if (bestEscapeDoor) {
          const edx = bestEscapeDoor.x - self.x;
          const edy = bestEscapeDoor.y - self.y;
          const edLen = Math.hypot(edx, edy) || 1;
          const urgency = p.age >= POWERUP_CONFIG.homingBallisticSec ? 2.6 : 1.7;
          dodgeX += (edx / edLen) * urgency;
          dodgeY += (edy / edLen) * urgency;
          threatLevel = Math.max(threatLevel, urgency * 0.45);
        } else {
          const hmDx = self.x - lockPt.x;
          const hmDy = self.y - lockPt.y;
          const hmDist = Math.hypot(hmDx, hmDy) || 1;
          dodgeX += (hmDx / hmDist) * 2.0;
          dodgeY += (hmDy / hmDist) * 2.0;
          threatLevel = Math.max(threatLevel, 0.9);
        }
      }
    }
  }

  for (const z of spikeZones) {
    if (z.age >= z.duration) continue;
    const dx = self.x - z.x;
    const dy = self.y - z.y;
    const dist = Math.hypot(dx, dy) || 1;
    const avoidR = POWERUP_CONFIG.spikeGroundRadius * scale + self.radius + 18 * scale;
    if (dist < avoidR) {
      const push = ((avoidR - dist) / avoidR) * 2.4;
      dodgeX += (dx / dist) * push;
      dodgeY += (dy / dist) * push;
      threatLevel = Math.max(threatLevel, push);
    }
  }

  for (const m of mines) {
    if (m.age >= m.duration) continue;
    const detectable =
      m.age < m.armingSec || m.ownerIndex === self.index || difficulty === 'super_hard';
    if (!detectable) continue;
    const dx = self.x - m.x;
    const dy = self.y - m.y;
    const dist = Math.hypot(dx, dy) || 1;
    const avoidR = m.triggerRadius + self.radius + 20 * scale;
    if (dist < avoidR) {
      const push = ((avoidR - dist) / avoidR) * 2.6;
      dodgeX += (dx / dist) * push;
      dodgeY += (dy / dist) * push;
      threatLevel = Math.max(threatLevel, push);
    }
  }

  for (const br of barrels) {
    if (!br.active) continue;
    const dx = self.x - br.x;
    const dy = self.y - br.y;
    const dist = Math.hypot(dx, dy) || 1;
    const avoidR = br.blastRadius + self.radius * 1.3;
    if (dist >= avoidR) continue;

    let incomingShellTowardBarrel = false;
    if (br.fuseRemainingSec === null) {
      for (let i = 0; i < projectiles.length; i++) {
        const p = projectiles[i];
        if (!p.active) continue;
        const spd = Math.hypot(p.vx, p.vy);
        if (spd < 10) continue;
        const hitS = rayCircleFirstHitDist(
          p.x,
          p.y,
          p.vx / spd,
          p.vy / spd,
          spd * 0.65,
          br.x,
          br.y,
          br.radius + p.radius + 4,
          0,
        );
        if (hitS !== null) {
          incomingShellTowardBarrel = true;
          break;
        }
      }
    }

    if (br.fuseRemainingSec !== null || incomingShellTowardBarrel) {
      const push = ((avoidR - dist) / avoidR) * 3.2;
      dodgeX += (dx / dist) * push;
      dodgeY += (dy / dist) * push;
      threatLevel = Math.max(threatLevel, push);
      if (br.fuseRemainingSec !== null) {
        imminentBulletTimeSec = Math.min(
          imminentBulletTimeSec,
          Math.max(0.05, br.fuseRemainingSec),
        );
      }
    }
  }

  const reaperDangerR = arena.cellSize * (POWERUP_CONFIG.reaperBladeCellsLength + 0.45);
  for (const t of tanks) {
    if (!t.alive || t.index === self.index || !reaperIndices.has(t.index)) continue;
    const dx = self.x - t.x;
    const dy = self.y - t.y;
    const dist = Math.hypot(dx, dy) || 1;
    if (dist < reaperDangerR) {
      const push = ((reaperDangerR - dist) / reaperDangerR) * 3.0;
      dodgeX += (dx / dist) * push;
      dodgeY += (dy / dist) * push;
      threatLevel = Math.max(threatLevel, push);
    }
  }

  return {
    threatLevel: threatLevel * profile.dodgeWeight,
    dodgeX: dodgeX * profile.dodgeWeight,
    dodgeY: dodgeY * profile.dodgeWeight,
    imminentBulletTimeSec,
    bulletInFrontCone,
  };
}
