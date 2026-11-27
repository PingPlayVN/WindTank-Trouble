import { BASE_GAMEPLAY, POWERUP_CONFIG } from '../config/constants';
import type { TntBarrelState } from './BattleModeSim';
import { sweepCircleAgainstWall } from './CollisionSystem';
import { getAccessibleNeighbors, type SeededRng } from './MazeSystem';
import {
  wrapAngleRad,
  type GroundSpikeZone,
  type MysteryCrateState,
  type ProximityMineState,
} from './PowerUpSim';
import type {
  AIDifficulty,
  AITacticId,
  BuiltArenaLayout,
  GridCell,
  PlayerIndex,
  PlayerInputState,
  ProjectileKinematics,
  SkillId,
  TankKinematics,
  WallRect,
} from '../types/gameTypes';

export interface AIDifficultyProfile {
  maxBounces: number;
  rayScanAngles: number;
  aimJitterRad: number;
  fireIntervalSec: number;
  dodgeWeight: number;
  cratePriority: number;
  turnDeadbandRad: number;
  throttleDutyCycle: number;
  predictiveLead: boolean;
  predictBounceThreats: boolean;
  detonateTntTraps: boolean;
}

export const AI_DIFFICULTY_PROFILES: Record<AIDifficulty, AIDifficultyProfile> = {
  easy: {
    maxBounces: 0,
    rayScanAngles: 0,
    aimJitterRad: 0.16,
    fireIntervalSec: 0.92,
    dodgeWeight: 0,
    cratePriority: 0.25,
    turnDeadbandRad: 0.14,
    throttleDutyCycle: 0.72,
    predictiveLead: false,
    predictBounceThreats: false,
    detonateTntTraps: false,
  },
  normal: {
    maxBounces: 1,
    rayScanAngles: 22,
    aimJitterRad: 0.055,
    fireIntervalSec: 0.44,
    dodgeWeight: 0.85,
    cratePriority: 0.85,
    turnDeadbandRad: 0.075,
    throttleDutyCycle: 1.0,
    predictiveLead: false,
    predictBounceThreats: false,
    detonateTntTraps: false,
  },
  hard: {
    maxBounces: 2,
    rayScanAngles: 38,
    aimJitterRad: 0.015,
    fireIntervalSec: 0.22,
    dodgeWeight: 1.35,
    cratePriority: 1.25,
    turnDeadbandRad: 0.042,
    throttleDutyCycle: 1.0,
    predictiveLead: false,
    predictBounceThreats: true,
    detonateTntTraps: true,
  },
  super_hard: {
    maxBounces: 3,
    rayScanAngles: 64,
    aimJitterRad: 0,
    fireIntervalSec: 0.12,
    dodgeWeight: 1.9,
    cratePriority: 1.55,
    turnDeadbandRad: 0.024,
    throttleDutyCycle: 1.0,
    predictiveLead: true,
    predictBounceThreats: true,
    detonateTntTraps: true,
  },
};

export interface AISlotMemory {
  playerIndex: PlayerIndex;
  clock: number;
  fireCooldownTimer: number;
  cachedAimAngle: number | null;
  aimHoldTimer: number;
  stuckTimer: number;
  unstuckTimer: number;
  unstuckTurnSign: 1 | -1;
  lastProgressX: number;
  lastProgressY: number;
  wanderCell: GridCell | null;
}

export function createAISlotMemory(playerIndex: PlayerIndex): AISlotMemory {
  return {
    playerIndex,
    clock: 0,
    fireCooldownTimer: 0,
    cachedAimAngle: null,
    aimHoldTimer: 0,
    stuckTimer: 0,
    unstuckTimer: 0,
    unstuckTurnSign: playerIndex % 2 === 0 ? 1 : -1,
    lastProgressX: 0,
    lastProgressY: 0,
    wanderCell: null,
  };
}

export interface BallisticTraceResult {
  hitsEnemy: boolean;
  selfHitRisk: boolean;
  targetIndex: PlayerIndex | null;
  bouncesUsed: number;
  travelDist: number;
}

function rayCircleFirstHitDist(
  x0: number,
  y0: number,
  ux: number,
  uy: number,
  segLen: number,
  cx: number,
  cy: number,
  hitRadius: number,
  minS = 0,
): number | null {
  const fx = x0 - cx;
  const fy = y0 - cy;
  const b = fx * ux + fy * uy;
  const c = fx * fx + fy * fy - hitRadius * hitRadius;

  if (c <= 0) {
    return minS <= 0 ? 0 : minS <= segLen ? minS : null;
  }
  const disc = b * b - c;
  if (disc < 0) return null;
  const s = -b - Math.sqrt(disc);
  if (s >= minS && s <= segLen) {
    return s;
  }
  return null;
}

/**
 * Sweeps a physical shell ray across up to `maxBounces` maze wall reflections:
 * - Flags `selfHitRisk: true` if the shell bounces back into `shooterIndex`, hits a shielded tank,
 *   or detonates a nearby TNT barrel whose blast wave would hit `shooterIndex`!
 * - Returns `hitsEnemy: true` when an unshielded enemy tank (or a TNT barrel trapping an enemy) is struck first.
 */
export function traceBallisticShot(
  muzzleX: number,
  muzzleY: number,
  angle: number,
  shooterIndex: PlayerIndex,
  tanks: readonly TankKinematics[],
  shieldedIndices: ReadonlySet<PlayerIndex>,
  walls: readonly WallRect[],
  maxBounces: number,
  maxDist: number,
  bulletRadius: number,
  predictiveSpeedPxPerSec = 0,
  barrels: readonly TntBarrelState[] = [],
  allowBarrelTrapDetonation = false,
): BallisticTraceResult {
  let curX = muzzleX;
  let curY = muzzleY;
  let ux = Math.cos(angle);
  let uy = Math.sin(angle);
  let remainingDist = maxDist;
  let traveled = 0;

  const shooterTank = tanks.find((t) => t.index === shooterIndex) ?? null;

  for (let w = 0; w < walls.length; w++) {
    const wall = walls[w];
    if (
      curX >= wall.minX - bulletRadius &&
      curX <= wall.maxX + bulletRadius &&
      curY >= wall.minY - bulletRadius &&
      curY <= wall.maxY + bulletRadius
    ) {
      return {
        hitsEnemy: false,
        selfHitRisk: true,
        targetIndex: null,
        bouncesUsed: 0,
        travelDist: 0,
      };
    }
  }

  for (let b = 0; b <= maxBounces && remainingDist > 1; b++) {
    let earliestWall: { t: number; nx: number; ny: number } | null = null;
    const dx = ux * remainingDist;
    const dy = uy * remainingDist;

    for (let w = 0; w < walls.length; w++) {
      const hit = sweepCircleAgainstWall(curX, curY, dx, dy, bulletRadius, walls[w]);
      if (hit && (!earliestWall || hit.t < earliestWall.t)) {
        earliestWall = hit;
      }
    }

    const segLen = earliestWall ? earliestWall.t * remainingDist : remainingDist;

    let bestTankHit: { s: number; tank: TankKinematics; isShielded: boolean } | null = null;

    for (let i = 0; i < tanks.length; i++) {
      const t = tanks[i];
      if (!t.alive) continue;

      const isSelf = t.index === shooterIndex;
      if (isSelf && b === 0 && traveled < t.radius * 2) {
        continue;
      }

      const isShielded = shieldedIndices.has(t.index);
      const hitR = isShielded
        ? t.radius * POWERUP_CONFIG.shieldRadiusFactor + bulletRadius
        : isSelf
          ? t.radius * 1.18 + bulletRadius
          : t.radius * 0.88 + bulletRadius;

      let tx = t.x;
      let ty = t.y;
      if (!isSelf && b === 0 && predictiveSpeedPxPerSec > 10 && (t.vx !== 0 || t.vy !== 0)) {
        const approxDist = Math.hypot(t.x - curX, t.y - curY);
        const leadSec = Math.min(0.45, approxDist / predictiveSpeedPxPerSec);
        tx += t.vx * leadSec;
        ty += t.vy * leadSec;
      }

      const sHit = rayCircleFirstHitDist(
        curX,
        curY,
        ux,
        uy,
        segLen,
        tx,
        ty,
        hitR,
        isSelf && b === 0 ? t.radius * 1.5 : 0,
      );
      if (sHit !== null && (!bestTankHit || sHit < bestTankHit.s)) {
        bestTankHit = { s: sHit, tank: t, isShielded };
      }
    }

    // Check TNT barrel hits along this segment before any tank/wall hit
    let bestBarrelHit: { s: number; barrel: TntBarrelState } | null = null;
    for (let k = 0; k < barrels.length; k++) {
      const br = barrels[k];
      if (!br.active) continue;
      const sBr = rayCircleFirstHitDist(
        curX,
        curY,
        ux,
        uy,
        segLen,
        br.x,
        br.y,
        br.radius + bulletRadius,
        0,
      );
      if (sBr !== null && (!bestBarrelHit || sBr < bestBarrelHit.s)) {
        bestBarrelHit = { s: sBr, barrel: br };
      }
    }

    if (bestBarrelHit && (!bestTankHit || bestBarrelHit.s <= bestTankHit.s)) {
      const br = bestBarrelHit.barrel;
      const selfInBlast =
        shooterTank !== null &&
        Math.hypot(shooterTank.x - br.x, shooterTank.y - br.y) <=
          br.blastRadius + shooterTank.radius * 1.35;
      if (selfInBlast) {
        return {
          hitsEnemy: false,
          selfHitRisk: true,
          targetIndex: null,
          bouncesUsed: b,
          travelDist: traveled + bestBarrelHit.s,
        };
      }

      if (allowBarrelTrapDetonation) {
        for (let i = 0; i < tanks.length; i++) {
          const t = tanks[i];
          if (!t.alive || t.index === shooterIndex || shieldedIndices.has(t.index)) continue;
          if (Math.hypot(t.x - br.x, t.y - br.y) <= br.blastRadius * 0.92 + t.radius) {
            return {
              hitsEnemy: true,
              selfHitRisk: false,
              targetIndex: t.index,
              bouncesUsed: b,
              travelDist: traveled + bestBarrelHit.s,
            };
          }
        }
      }

      // Shell terminates on barrel without hitting an enemy
      return {
        hitsEnemy: false,
        selfHitRisk: false,
        targetIndex: null,
        bouncesUsed: b,
        travelDist: traveled + bestBarrelHit.s,
      };
    }

    if (bestTankHit) {
      if (bestTankHit.tank.index === shooterIndex || bestTankHit.isShielded) {
        return {
          hitsEnemy: false,
          selfHitRisk: true,
          targetIndex: null,
          bouncesUsed: b,
          travelDist: traveled + bestTankHit.s,
        };
      }
      return {
        hitsEnemy: true,
        selfHitRisk: false,
        targetIndex: bestTankHit.tank.index,
        bouncesUsed: b,
        travelDist: traveled + bestTankHit.s,
      };
    }

    if (!earliestWall || b >= maxBounces) {
      break;
    }

    curX += ux * segLen + earliestWall.nx * 0.35;
    curY += uy * segLen + earliestWall.ny * 0.35;
    const dot = ux * earliestWall.nx + uy * earliestWall.ny;
    ux -= 2 * dot * earliestWall.nx;
    uy -= 2 * dot * earliestWall.ny;
    const norm = Math.hypot(ux, uy) || 1;
    ux /= norm;
    uy /= norm;

    traveled += segLen;
    remainingDist -= segLen;
  }

  return {
    hitsEnemy: false,
    selfHitRisk: false,
    targetIndex: null,
    bouncesUsed: maxBounces,
    travelDist: maxDist,
  };
}

function hasWallOcclusion(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  clearanceRadius: number,
  walls: readonly WallRect[],
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (let i = 0; i < walls.length; i++) {
    const hit = sweepCircleAgainstWall(x0, y0, dx, dy, clearanceRadius, walls[i]);
    if (hit && hit.t < 0.995) {
      return true;
    }
  }
  return false;
}

function countWallIntersections(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
  walls: readonly WallRect[],
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let count = 0;
  for (let i = 0; i < walls.length; i++) {
    const hit = sweepCircleAgainstWall(x0, y0, dx, dy, radius, walls[i]);
    if (hit && hit.t < 0.995) {
      count++;
    }
  }
  return count;
}

function wallClearanceInDirection(
  x: number,
  y: number,
  ux: number,
  uy: number,
  radius: number,
  maxProbeDist: number,
  walls: readonly WallRect[],
): number {
  let minT = 1;
  const dx = ux * maxProbeDist;
  const dy = uy * maxProbeDist;
  for (let i = 0; i < walls.length; i++) {
    const hit = sweepCircleAgainstWall(x, y, dx, dy, radius, walls[i]);
    if (hit && hit.t < minT) {
      minT = hit.t;
    }
  }
  return minT * maxProbeDist;
}

export interface DangerAssessment {
  threatLevel: number;
  dodgeX: number;
  dodgeY: number;
  imminentBulletTimeSec: number;
  bulletInFrontCone: boolean;
}

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

    if (tti < imminentBulletTimeSec && perpDist <= self.radius + pRadius + 8 * scale) {
      imminentBulletTimeSec = tti;
      const toBulletDist = Math.hypot(px - self.x, py - self.y) || 1;
      const dotFront =
        ((px - self.x) / toBulletDist) * selfFwdX + ((py - self.y) / toBulletDist) * selfFwdY;
      if (dotFront > 0.75 && toBulletDist < 120 * scale) {
        bulletInFrontCone = true;
      }
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
  }

  // Ground Spike Zones repulsion
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

  // Proximity Mines repulsion
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

  // Fusing or Bullet-Threatened TNT Barrels repulsion!
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
        imminentBulletTimeSec = Math.min(imminentBulletTimeSec, Math.max(0.05, br.fuseRemainingSec));
      }
    }
  }

  // Enemy Reaper 180° Scythe repulsion
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

function worldToGridCell(x: number, y: number, arena: BuiltArenaLayout): GridCell {
  const col = Math.max(
    0,
    Math.min(arena.grid.cols - 1, Math.floor((x - arena.originX) / arena.cellSize)),
  );
  const row = Math.max(
    0,
    Math.min(arena.grid.rows - 1, Math.floor((y - arena.originY) / arena.cellSize)),
  );
  return { col, row };
}

function doorwayWorldPoint(
  a: GridCell,
  b: GridCell,
  arena: BuiltArenaLayout,
): { x: number; y: number } {
  return {
    x: arena.originX + ((a.col + b.col) * 0.5 + 0.5) * arena.cellSize,
    y: arena.originY + ((a.row + b.row) * 0.5 + 0.5) * arena.cellSize,
  };
}

export interface MazeDistanceField {
  cols: number;
  rows: number;
  startIdx: number;
  dist: Int16Array;
  parent: Int16Array;
}

/**
 * Fast flat-array BFS from `startCell` across the entire maze (including 24×14 = 336 cells).
 * Computes exact corridor step distance & shortest path tree to ALL enemies and ALL crates in one pass!
 */
export function computeMazeDistanceField(
  startCell: GridCell,
  spikeZones: readonly GroundSpikeZone[],
  mines: readonly ProximityMineState[],
  arena: BuiltArenaLayout,
  barrels: readonly TntBarrelState[] = [],
  avoidHazards = true,
): MazeDistanceField {
  const { cols, rows } = arena.grid;
  const total = cols * rows;
  const startIdx = startCell.row * cols + startCell.col;

  const blocked = new Uint8Array(total);
  if (avoidHazards) {
    for (const z of spikeZones) {
      if (z.age < z.duration) {
        const hc = worldToGridCell(z.x, z.y, arena);
        const idx = hc.row * cols + hc.col;
        if (idx !== startIdx) blocked[idx] = 1;
      }
    }
    for (const m of mines) {
      if (m.age < m.duration) {
        const hc = worldToGridCell(m.x, m.y, arena);
        const idx = hc.row * cols + hc.col;
        if (idx !== startIdx) blocked[idx] = 1;
      }
    }
    for (const br of barrels) {
      if (br.active && br.fuseRemainingSec !== null) {
        const hc = worldToGridCell(br.x, br.y, arena);
        const idx = hc.row * cols + hc.col;
        if (idx !== startIdx) blocked[idx] = 1;
      }
    }
  }

  const dist = new Int16Array(total).fill(-1);
  const parent = new Int16Array(total).fill(-1);
  const queue = new Int16Array(total);
  let head = 0;
  let tail = 0;

  dist[startIdx] = 0;
  queue[tail++] = startIdx;

  while (head < tail) {
    const curIdx = queue[head++];
    const r = Math.floor(curIdx / cols);
    const c = curIdx - r * cols;
    const nextD = dist[curIdx] + 1;

    for (const nb of getAccessibleNeighbors(arena.grid, { col: c, row: r })) {
      const nbIdx = nb.row * cols + nb.col;
      if (dist[nbIdx] !== -1) continue;
      if (avoidHazards && blocked[nbIdx] === 1) continue;
      dist[nbIdx] = nextD;
      parent[nbIdx] = curIdx;
      queue[tail++] = nbIdx;
    }
  }

  return { cols, rows, startIdx, dist, parent };
}

function resolveWaypointFromField(
  self: TankKinematics,
  goalX: number,
  goalY: number,
  field: MazeDistanceField,
  fallbackField: MazeDistanceField | null,
  arena: BuiltArenaLayout,
): { x: number; y: number; cellSteps: number } {
  const startCell = worldToGridCell(self.x, self.y, arena);
  const goalCell = worldToGridCell(goalX, goalY, arena);
  const clearance = self.radius * 0.88;

  if (
    (startCell.col === goalCell.col && startCell.row === goalCell.row) ||
    !hasWallOcclusion(self.x, self.y, goalX, goalY, clearance, arena.walls)
  ) {
    return { x: goalX, y: goalY, cellSteps: 0 };
  }

  const goalIdx = goalCell.row * field.cols + goalCell.col;
  let activeField = field;
  if (activeField.dist[goalIdx] < 0 && fallbackField && fallbackField.dist[goalIdx] >= 0) {
    activeField = fallbackField;
  }
  if (activeField.dist[goalIdx] < 0) {
    return { x: goalX, y: goalY, cellSteps: 99 };
  }

  const pathIndices: number[] = [];
  let cursor = goalIdx;
  let guard = field.cols * field.rows + 2;
  while (cursor >= 0 && guard-- > 0) {
    pathIndices.push(cursor);
    if (cursor === activeField.startIdx) break;
    cursor = activeField.parent[cursor];
  }
  pathIndices.reverse();

  const cells: GridCell[] = pathIndices.map((idx) => {
    const row = Math.floor(idx / activeField.cols);
    return { col: idx - row * activeField.cols, row };
  });

  const waypoints: Array<{ x: number; y: number }> = [];
  for (let i = 1; i < cells.length; i++) {
    waypoints.push(doorwayWorldPoint(cells[i - 1], cells[i], arena));
    waypoints.push({
      x: arena.originX + (cells[i].col + 0.5) * arena.cellSize,
      y: arena.originY + (cells[i].row + 0.5) * arena.cellSize,
    });
  }
  waypoints.push({ x: goalX, y: goalY });

  let aim = waypoints[0];
  for (let i = Math.min(waypoints.length - 1, 7); i >= 0; i--) {
    if (!hasWallOcclusion(self.x, self.y, waypoints[i].x, waypoints[i].y, clearance, arena.walls)) {
      aim = waypoints[i];
      break;
    }
  }

  return { x: aim.x, y: aim.y, cellSteps: Math.max(0, cells.length - 1) };
}

export function computeMazeNavigationPoint(
  self: TankKinematics,
  goalX: number,
  goalY: number,
  spikeZones: readonly GroundSpikeZone[],
  mines: readonly ProximityMineState[],
  arena: BuiltArenaLayout,
  barrels: readonly TntBarrelState[] = [],
): { x: number; y: number; cellSteps: number } {
  const startCell = worldToGridCell(self.x, self.y, arena);
  const safeField = computeMazeDistanceField(startCell, spikeZones, mines, arena, barrels, true);
  const goalCell = worldToGridCell(goalX, goalY, arena);
  const goalIdx = goalCell.row * safeField.cols + goalCell.col;
  const fallbackField =
    safeField.dist[goalIdx] < 0
      ? computeMazeDistanceField(startCell, spikeZones, mines, arena, barrels, false)
      : null;

  return resolveWaypointFromField(self, goalX, goalY, safeField, fallbackField, arena);
}

export interface AIWorldContext {
  difficulty: AIDifficulty;
  tactic?: AITacticId;
  dt: number;
  self: TankKinematics;
  selfSkill: SkillId | null;
  selfSkillAmmo: number;
  selfAmmo: number;
  selfShielded: boolean;
  selfReaperSweeping: boolean;
  selfChargingLaser: boolean;
  canFire: boolean;
  tanks: readonly TankKinematics[];
  shieldedTankIndices: ReadonlySet<PlayerIndex>;
  reaperTankIndices: ReadonlySet<PlayerIndex>;
  projectiles: readonly ProjectileKinematics[];
  crates: readonly MysteryCrateState[];
  spikeZones: readonly GroundSpikeZone[];
  mines: readonly ProximityMineState[];
  barrels?: readonly TntBarrelState[];
  arena: BuiltArenaLayout;
}

function driveTankTowardVector(
  self: TankKinematics,
  desiredX: number,
  desiredY: number,
  turnDeadbandRad: number,
  allowReverseDodge: boolean,
): { forward: boolean; backward: boolean; left: boolean; right: boolean } {
  const mag = Math.hypot(desiredX, desiredY);
  if (mag < 1e-4) {
    return { forward: false, backward: false, left: false, right: false };
  }

  const targetAngle = Math.atan2(desiredY, desiredX);
  const fwdDiff = wrapAngleRad(targetAngle - self.angle);

  if (allowReverseDodge && Math.abs(fwdDiff) > (Math.PI * 2) / 3) {
    const revAngle = wrapAngleRad(targetAngle + Math.PI);
    const revDiff = wrapAngleRad(revAngle - self.angle);
    return {
      forward: false,
      backward: true,
      left: revDiff < -turnDeadbandRad,
      right: revDiff > turnDeadbandRad,
    };
  }

  return {
    forward: Math.abs(fwdDiff) < Math.PI * 0.48,
    backward: false,
    left: fwdDiff < -turnDeadbandRad,
    right: fwdDiff > turnDeadbandRad,
  };
}

/**
 * Prioritized 6-branch tactical AI Behavior Tree producing standard `PlayerInputState` commands:
 * 1. Unified Grid BFS Sensor (true corridor distances across large 22×13 & 24×14 mazes)
 * 2. Emergency Survival Reflex (Aegis Shield + Urgent Bullet/Hazard/TNT Evasion)
 * 3. Maze-Path Target & Crate Objective Selector
 * 4. Weapon Mastery & Opportunistic TNT Trap Detonation
 * 5. Clearance-Guided Corner Unstuck Recovery
 * 6. Tactic Spacing & Corridor Navigation (`balanced`, `rusher`, `sniper`, `camper`)
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

  const profile = AI_DIFFICULTY_PROFILES[difficulty];
  const scale = arena.scaleRatio;
  const barrelLen = BASE_GAMEPLAY.tankBarrelLength * scale;
  const muzzleX = self.x + Math.cos(self.angle) * barrelLen;
  const muzzleY = self.y + Math.sin(self.angle) * barrelLen;
  const bulletRadius = BASE_GAMEPLAY.projectileRadius * scale;
  const bulletSpeed = BASE_GAMEPLAY.projectileSpeed * scale;

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

  // Branch 2: Defensive Aegis Shield Reflex (only pops on imminent projectile/blast OR unoccluded close enemy!)
  if (ctx.selfSkill === 'shield' && ctx.canFire) {
    let closeUnoccludedEnemy = false;
    const proxThreshold = arena.cellSize * (difficulty === 'easy' ? 1.2 : 1.65);
    for (const e of enemies) {
      const d = Math.hypot(e.x - self.x, e.y - self.y);
      if (
        d < proxThreshold &&
        !hasWallOcclusion(self.x, self.y, e.x, e.y, bulletRadius, arena.walls)
      ) {
        closeUnoccludedEnemy = true;
        break;
      }
    }

    if (danger.imminentBulletTimeSec < 0.48 || closeUnoccludedEnemy) {
      return {
        ...idle,
        firePressed: true,
        fireHeld: true,
        fireBufferedUntil: mem.clock + 0.12,
      };
    }
  }

  // Branch 3: Maze-Path Aware Target Selection (prevents fixating on enemies behind long solid walls!)
  let primaryEnemy = enemies[0];
  let primaryEnemySteps = 99;
  let bestEnemyScore = Infinity;
  for (const e of enemies) {
    const euclid = Math.hypot(e.x - self.x, e.y - self.y);
    const steps = cellStepDistanceTo(e.x, e.y);
    const pathMetric =
      ctx.selfSkill === 'laser' || ctx.selfSkill === 'reaper'
        ? euclid
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

  // Branch 4: Specialized Weapon Mastery & Opportunistic TNT Detonation
  let wantFirePressed = false;
  let wantFireHeld = false;
  let desiredAimAngle: number | null = null;

  if (ctx.selfSkill === 'laser') {
    const angleToEnemy = Math.atan2(primaryEnemy.y - muzzleY, primaryEnemy.x - muzzleX);
    desiredAimAngle = angleToEnemy;
    const coneLimit = ((POWERUP_CONFIG.laserAutoAimConeDeg - 2) * Math.PI) / 180;
    const diff = Math.abs(wrapAngleRad(angleToEnemy - self.angle));
    const safeToFreeze = danger.imminentBulletTimeSec > 0.9;
    if (
      ctx.canFire &&
      diff <= coneLimit &&
      safeToFreeze &&
      !ctx.shieldedTankIndices.has(primaryEnemy.index)
    ) {
      wantFirePressed = true;
    }
  } else if (ctx.selfSkill === 'reaper') {
    const triggerRange = arena.cellSize * (POWERUP_CONFIG.reaperBladeCellsLength * 0.92);
    if (
      ctx.canFire &&
      distToEnemy <= triggerRange &&
      !ctx.shieldedTankIndices.has(primaryEnemy.index)
    ) {
      wantFirePressed = true;
    }
  } else if (ctx.selfSkill === 'mine') {
    const alreadyMinedHere = ctx.mines.some(
      (m) => m.age < m.duration && Math.hypot(m.x - self.x, m.y - self.y) < arena.cellSize * 1.15,
    );
    if (
      ctx.canFire &&
      !alreadyMinedHere &&
      mem.fireCooldownTimer <= 0 &&
      (primaryEnemySteps <= 3 || rng.nextFloat() < 0.025)
    ) {
      wantFirePressed = true;
      mem.fireCooldownTimer = 0.95;
    }
  } else if (ctx.selfSkill === 'flame') {
    const flameRange = arena.cellSize * 4.75;
    const angleToEnemy = Math.atan2(primaryEnemy.y - self.y, primaryEnemy.x - self.x);
    const diff = Math.abs(wrapAngleRad(angleToEnemy - self.angle));
    const clearSight = !hasWallOcclusion(
      self.x,
      self.y,
      primaryEnemy.x,
      primaryEnemy.y,
      bulletRadius,
      arena.walls,
    );
    const selfNearBarrelInCone = barrels.some(
      (br) =>
        br.active &&
        Math.hypot(br.x - self.x, br.y - self.y) < br.blastRadius + self.radius * 1.25 &&
        Math.abs(wrapAngleRad(Math.atan2(br.y - self.y, br.x - self.x) - self.angle)) < 0.5,
    );
    if (
      ctx.canFire &&
      !selfNearBarrelInCone &&
      ((distToEnemy <= flameRange && diff < 0.42 && clearSight) ||
        (difficulty !== 'easy' && danger.bulletInFrontCone))
    ) {
      wantFirePressed = true;
      wantFireHeld = true;
    }
  } else if (ctx.selfSkill === 'drill') {
    const angleToEnemy = Math.atan2(primaryEnemy.y - self.y, primaryEnemy.x - self.x);
    const wallsBetween = countWallIntersections(
      muzzleX,
      muzzleY,
      primaryEnemy.x,
      primaryEnemy.y,
      bulletRadius,
      arena.walls,
    );
    if (wallsBetween <= POWERUP_CONFIG.drillWallsPerShot && distToEnemy < arena.cellSize * 6.0) {
      desiredAimAngle = angleToEnemy;
      const diff = Math.abs(wrapAngleRad(angleToEnemy - self.angle));
      if (
        ctx.canFire &&
        mem.fireCooldownTimer <= 0 &&
        diff < 0.14 &&
        !ctx.shieldedTankIndices.has(primaryEnemy.index)
      ) {
        wantFirePressed = true;
        mem.fireCooldownTimer = profile.fireIntervalSec;
      }
    }
  } else if (!ctx.selfReaperSweeping) {
    // Standard Cannon / Gatling / Scatter / Spike / Homing ballistic + multi-bounce + TNT trap solver!
    const hasAmmo = ctx.selfSkill ? ctx.selfSkillAmmo > 0 : ctx.selfAmmo > 0;
    const maxRayDist = Math.hypot(arena.width, arena.height) * (1 + profile.maxBounces * 0.55);

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
        bulletRadius,
        profile.predictiveLead ? bulletSpeed : 0,
        barrels,
        profile.detonateTntTraps,
      );

      if (currentCheck.hitsEnemy && !currentCheck.selfHitRisk) {
        if (ctx.canFire && mem.fireCooldownTimer <= 0) {
          if (difficulty !== 'easy' || rng.nextFloat() < 0.72) {
            wantFirePressed = true;
            wantFireHeld = ctx.selfSkill === 'gatling';
            mem.fireCooldownTimer =
              ctx.selfSkill === 'gatling'
                ? POWERUP_CONFIG.gatlingCooldownSec * (difficulty === 'easy' ? 2.2 : 1.05)
                : profile.fireIntervalSec;
          }
        }
      } else {
        const candidates: number[] = [];
        for (const e of enemies) {
          let tx = e.x;
          let ty = e.y;
          if (profile.predictiveLead) {
            const leadT = Math.min(0.4, Math.hypot(e.x - self.x, e.y - self.y) / bulletSpeed);
            tx += e.vx * leadT;
            ty += e.vy * leadT;
          }
          candidates.push(Math.atan2(ty - self.y, tx - self.x));
        }

        // Also include direct angles toward TNT barrels that trap an enemy!
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
            bulletRadius,
            profile.predictiveLead ? bulletSpeed : 0,
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
          mem.aimHoldTimer = 0.22;
          desiredAimAngle = mem.cachedAimAngle;
        } else if (
          ctx.selfSkill === 'homing' &&
          difficulty !== 'easy' &&
          ctx.canFire &&
          mem.fireCooldownTimer <= 0
        ) {
          // On large maps, launch Homing Missile down an open safe corridor so its seeker hunts the enemy!
          const fwdClear = wallClearanceInDirection(
            muzzleX,
            muzzleY,
            Math.cos(self.angle),
            Math.sin(self.angle),
            bulletRadius,
            arena.cellSize * 2.2,
            arena.walls,
          );
          if (fwdClear >= arena.cellSize * 1.4 && !currentCheck.selfHitRisk) {
            wantFirePressed = true;
            mem.fireCooldownTimer = profile.fireIntervalSec;
          }
        } else if (mem.cachedAimAngle !== null) {
          desiredAimAngle = mem.cachedAimAngle;
        }
      }
    }
  }

  // Urgent Evasion Override: if threatLevel is high, dodge immediately!
  if (danger.threatLevel >= 0.65) {
    const move = driveTankTowardVector(
      self,
      danger.dodgeX,
      danger.dodgeY,
      profile.turnDeadbandRad,
      true,
    );
    return {
      ...move,
      firePressed: wantFirePressed,
      fireHeld: wantFireHeld,
      fireBufferedUntil: wantFirePressed ? mem.clock + 0.12 : 0,
    };
  }

  // Branch 5: Clearance-Guided Corner Recovery
  if (mem.unstuckTimer > 0) {
    mem.unstuckTimer = Math.max(0, mem.unstuckTimer - dt);
    return {
      forward: false,
      backward: true,
      left: mem.unstuckTurnSign < 0,
      right: mem.unstuckTurnSign > 0,
      firePressed: wantFirePressed,
      fireHeld: wantFireHeld,
      fireBufferedUntil: wantFirePressed ? mem.clock + 0.12 : 0,
    };
  }

  // Branch 6: Maze-Path Crate vs Enemy Navigation & Tactic Spacing
  let navGoalX = primaryEnemy.x;
  let navGoalY = primaryEnemy.y;

  if (!ctx.selfSkill && ctx.crates.length > 0 && profile.cratePriority > 0) {
    let bestCrate: MysteryCrateState | null = null;
    let bestCratePathDist = Infinity;
    for (const c of ctx.crates) {
      const cSteps = cellStepDistanceTo(c.x, c.y);
      const cMetric = cSteps * arena.cellSize * 0.8 + Math.hypot(c.x - self.x, c.y - self.y) * 0.2;
      if (cMetric < bestCratePathDist) {
        bestCratePathDist = cMetric;
        bestCrate = c;
      }
    }
    const enemyPathDist = primaryEnemySteps * arena.cellSize * 0.8 + distToEnemy * 0.2;
    if (bestCrate && bestCratePathDist * (1 / profile.cratePriority) < enemyPathDist * 1.25) {
      navGoalX = bestCrate.x;
      navGoalY = bestCrate.y;
    }
  }

  if (desiredAimAngle !== null && danger.threatLevel < 0.25) {
    const aimDiff = wrapAngleRad(desiredAimAngle - self.angle);
    if (Math.abs(aimDiff) > profile.turnDeadbandRad * 0.7) {
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

  const navWp = resolveWaypointFromField(
    self,
    navGoalX,
    navGoalY,
    safeField,
    rawField,
    arena,
  );

  let moveVecX = navWp.x - self.x + danger.dodgeX * 42;
  let moveVecY = navWp.y - self.y + danger.dodgeY * 42;

  const tactic = ctx.tactic ?? 'balanced';
  const chasingCrate = navGoalX !== primaryEnemy.x || navGoalY !== primaryEnemy.y;
  const rushingClose =
    tactic === 'rusher' ||
    ctx.selfSkill === 'reaper' ||
    ctx.selfSkill === 'flame' ||
    chasingCrate;

  const preferredStandoff =
    tactic === 'sniper'
      ? arena.cellSize * 2.75
      : tactic === 'camper'
        ? arena.cellSize * 2.15
        : arena.cellSize * 1.15;

  if (
    !rushingClose &&
    navWp.cellSteps <= (tactic === 'sniper' ? 1 : 0) &&
    distToEnemy < preferredStandoff
  ) {
    const awayX = self.x - primaryEnemy.x;
    const awayY = self.y - primaryEnemy.y;
    const kiteStrafe = tactic === 'sniper' ? 0.45 : 0.75;
    moveVecX = awayX - awayY * kiteStrafe + danger.dodgeX * 42;
    moveVecY = awayY + awayX * kiteStrafe + danger.dodgeY * 42;
  } else if (
    tactic === 'camper' &&
    !chasingCrate &&
    primaryEnemySteps <= 4 &&
    distToEnemy < arena.cellSize * 3.6 &&
    danger.threatLevel < 0.2
  ) {
    const aimTargetX = navWp.cellSteps > 0 ? navWp.x : primaryEnemy.x;
    const aimTargetY = navWp.cellSteps > 0 ? navWp.y : primaryEnemy.y;
    const aimDiff = wrapAngleRad(Math.atan2(aimTargetY - self.y, aimTargetX - self.x) - self.angle);
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
    difficulty === 'hard' || difficulty === 'super_hard',
  );

  if (profile.throttleDutyCycle < 1 && Math.sin(mem.clock * 5.2 + self.index) > 0.65) {
    move.forward = false;
  }

  if (move.forward) {
    const moved = Math.hypot(self.x - mem.lastProgressX, self.y - mem.lastProgressY);
    if (moved > 3.5 * scale) {
      mem.lastProgressX = self.x;
      mem.lastProgressY = self.y;
      mem.stuckTimer = 0;
    } else {
      mem.stuckTimer += dt;
      if (mem.stuckTimer >= 0.52) {
        mem.stuckTimer = 0;
        mem.unstuckTimer = 0.36;
        // Turn rear toward whichever perpendicular side has more open maze clearance!
        const leftAng = self.angle - Math.PI * 0.5;
        const rightAng = self.angle + Math.PI * 0.5;
        const leftClear = wallClearanceInDirection(
          self.x,
          self.y,
          Math.cos(leftAng),
          Math.sin(leftAng),
          self.radius * 0.85,
          arena.cellSize * 1.4,
          arena.walls,
        );
        const rightClear = wallClearanceInDirection(
          self.x,
          self.y,
          Math.cos(rightAng),
          Math.sin(rightAng),
          self.radius * 0.85,
          arena.cellSize * 1.4,
          arena.walls,
        );
        if (Math.abs(leftClear - rightClear) > 4 * scale) {
          mem.unstuckTurnSign = leftClear > rightClear ? -1 : 1;
        } else {
          mem.unstuckTurnSign = rng.nextFloat() < 0.5 ? 1 : -1;
        }
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
