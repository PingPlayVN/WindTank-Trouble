import { BASE_GAMEPLAY, POWERUP_CONFIG } from '../config/constants';
import type { TntBarrelState } from './BattleModeSim';
import { sweepCircleAgainstWall } from './CollisionSystem';
import { getAccessibleNeighbors, type SeededRng } from './MazeSystem';
import {
  computeScatterAngles,
  wrapAngleRad,
  type CryoZoneState,
  type GroundSpikeZone,
  type MysteryCrateState,
  type ProximityMineState,
  type WarpBeaconState,
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
  gatlingSuppressTimer: number;
  mineClearTimer: number;
  homingRetreatTimer: number;
  stuckTimer: number;
  unstuckTimer: number;
  unstuckTargetAngle: number | null;
  unstuckUseForward: boolean;
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
    gatlingSuppressTimer: 0,
    mineClearTimer: 0,
    homingRetreatTimer: 0,
    stuckTimer: 0,
    unstuckTimer: 0,
    unstuckTargetAngle: null,
    unstuckUseForward: false,
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

function simulateBallisticEndpoint(
  startX: number,
  startY: number,
  angle: number,
  speed: number,
  durationSec: number,
  bulletRadius: number,
  walls: readonly WallRect[],
  maxBounces = 14,
): { x: number; y: number; bounces: number } {
  let curX = startX;
  let curY = startY;
  let ux = Math.cos(angle);
  let uy = Math.sin(angle);
  let remainingDist = speed * durationSec;
  let bounces = 0;

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
    if (!earliestWall || b === maxBounces) {
      curX += ux * remainingDist;
      curY += uy * remainingDist;
      break;
    }
    const segLen = earliestWall.t * remainingDist;
    curX += ux * segLen + earliestWall.nx * 0.4;
    curY += uy * segLen + earliestWall.ny * 0.4;
    const dot = ux * earliestWall.nx + uy * earliestWall.ny;
    ux -= 2 * dot * earliestWall.nx;
    uy -= 2 * dot * earliestWall.ny;
    const norm = Math.hypot(ux, uy) || 1;
    ux /= norm;
    uy /= norm;
    remainingDist -= segLen;
    bounces++;
  }

  return { x: curX, y: curY, bounces };
}

function isOuterBoundaryWallHit(
  x0: number,
  y0: number,
  angle: number,
  maxDist: number,
  radius: number,
  arena: BuiltArenaLayout,
): boolean {
  const dx = Math.cos(angle) * maxDist;
  const dy = Math.sin(angle) * maxDist;
  let earliestWall: WallRect | null = null;
  let earliestT = 1.01;
  for (let i = 0; i < arena.walls.length; i++) {
    const w = arena.walls[i];
    const hit = sweepCircleAgainstWall(x0, y0, dx, dy, radius, w);
    if (hit && hit.t < earliestT) {
      earliestT = hit.t;
      earliestWall = w;
    }
  }
  if (!earliestWall) return false;
  const eps = arena.wallThickness + 2;
  const onLeftBorder =
    Math.abs(earliestWall.x - arena.originX) <= eps && earliestWall.height > earliestWall.width;
  const onRightBorder =
    Math.abs(earliestWall.x - (arena.originX + arena.width)) <= eps &&
    earliestWall.height > earliestWall.width;
  const onTopBorder =
    Math.abs(earliestWall.y - arena.originY) <= eps && earliestWall.width > earliestWall.height;
  const onBottomBorder =
    Math.abs(earliestWall.y - (arena.originY + arena.height)) <= eps &&
    earliestWall.width > earliestWall.height;
  return onLeftBorder || onRightBorder || onTopBorder || onBottomBorder;
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

    // Detect incoming physical bullets inside the tank's front flame-incineration cone (`+-44 deg`, `< 168px`)
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

    // Homing Missile maze-corridor awareness: steer through open doorways AWAY from impending/active seeker lock!
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

      // If we are dangerously close to being the nearest maze target, flee through the doorway that increases BFS distance!
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

  // Fusing or Bullet-Threatened TNT Barrels repulsion
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
): { x: number; y: number; cellSteps: number; firstDoorway: { x: number; y: number } | null } {
  const startCell = worldToGridCell(self.x, self.y, arena);
  const goalCell = worldToGridCell(goalX, goalY, arena);
  // Use clearance strictly WIDER than tank hull (`1.18x`) so tanks NEVER clip doorway wall corners!
  const safeHullClearance = self.radius * 1.18;

  if (
    (startCell.col === goalCell.col && startCell.row === goalCell.row) ||
    !hasWallOcclusion(self.x, self.y, goalX, goalY, self.radius * 1.24, arena.walls)
  ) {
    return { x: goalX, y: goalY, cellSteps: 0, firstDoorway: null };
  }

  const goalIdx = goalCell.row * field.cols + goalCell.col;
  let activeField = field;
  if (activeField.dist[goalIdx] < 0 && fallbackField && fallbackField.dist[goalIdx] >= 0) {
    activeField = fallbackField;
  }
  if (activeField.dist[goalIdx] < 0) {
    return { x: goalX, y: goalY, cellSteps: 99, firstDoorway: null };
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

  const firstDoorway = waypoints[0] ?? null;
  let aim = waypoints[0];
  // Tight 3-node corridor lookahead (`doorway -> cellCenter -> nextDoorway`) keeps tank centered in hallways!
  for (let i = Math.min(waypoints.length - 1, 2); i >= 0; i--) {
    if (
      !hasWallOcclusion(
        self.x,
        self.y,
        waypoints[i].x,
        waypoints[i].y,
        safeHullClearance,
        arena.walls,
      )
    ) {
      aim = waypoints[i];
      break;
    }
  }

  return { x: aim.x, y: aim.y, cellSteps: Math.max(0, cells.length - 1), firstDoorway };
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

  const wp = resolveWaypointFromField(self, goalX, goalY, safeField, fallbackField, arena);
  return { x: wp.x, y: wp.y, cellSteps: wp.cellSteps };
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
  selfPhantom?: boolean;
  selfWarpBeaconPlaced?: boolean;
  hasActiveEmpOrb?: boolean;
  selfReaperSweeping: boolean;
  selfChargingLaser: boolean;
  canFire: boolean;
  tanks: readonly TankKinematics[];
  shieldedTankIndices: ReadonlySet<PlayerIndex>;
  reaperTankIndices: ReadonlySet<PlayerIndex>;
  laserChargingTankIndices?: ReadonlySet<PlayerIndex>;
  projectiles: readonly ProjectileKinematics[];
  crates: readonly MysteryCrateState[];
  spikeZones: readonly GroundSpikeZone[];
  mines: readonly ProximityMineState[];
  cryoZones?: readonly CryoZoneState[];
  warpBeacons?: readonly WarpBeaconState[];
  barrels?: readonly TntBarrelState[];
  arena: BuiltArenaLayout;
}

/**
 * Nose-first corridor driving with front wall-whisker centering so tanks NEVER lock into
 * tail-first reverse driving during navigation! `allowEmergencyReverse` is ONLY enabled during
 * acute bullet/explosion evasion when backing up has verified rear wall clearance.
 */
function driveTankTowardVector(
  self: TankKinematics,
  desiredX: number,
  desiredY: number,
  turnDeadbandRad: number,
  allowEmergencyReverse: boolean,
  arena?: BuiltArenaLayout,
): { forward: boolean; backward: boolean; left: boolean; right: boolean } {
  const mag = Math.hypot(desiredX, desiredY);
  if (mag < 1e-4) {
    return { forward: false, backward: false, left: false, right: false };
  }

  const targetAngle = Math.atan2(desiredY, desiredX);
  let fwdDiff = wrapAngleRad(targetAngle - self.angle);

  if (allowEmergencyReverse && Math.abs(fwdDiff) > (Math.PI * 2) / 3) {
    const rearClear = arena
      ? wallClearanceInDirection(
          self.x,
          self.y,
          -Math.cos(self.angle),
          -Math.sin(self.angle),
          self.radius * 0.9,
          self.radius * 2.4,
          arena.walls,
        )
      : 999;
    if (rearClear > self.radius * 1.35) {
      const revAngle = wrapAngleRad(targetAngle + Math.PI);
      const revDiff = wrapAngleRad(revAngle - self.angle);
      return {
        forward: false,
        backward: true,
        left: revDiff < -turnDeadbandRad,
        right: revDiff > turnDeadbandRad,
      };
    }
  }

  const wantForward = Math.abs(fwdDiff) < Math.PI * 0.42;

  // Front ±36° wall-whisker feelers gently nudge steering away from doorway wall corners while moving forward!
  if (wantForward && arena) {
    const whiskerLen = self.radius * 1.72;
    const leftWhisker = wallClearanceInDirection(
      self.x,
      self.y,
      Math.cos(self.angle - 0.62),
      Math.sin(self.angle - 0.62),
      self.radius * 0.55,
      whiskerLen,
      arena.walls,
    );
    const rightWhisker = wallClearanceInDirection(
      self.x,
      self.y,
      Math.cos(self.angle + 0.62),
      Math.sin(self.angle + 0.62),
      self.radius * 0.55,
      whiskerLen,
      arena.walls,
    );
    if (leftWhisker < whiskerLen * 0.85 || rightWhisker < whiskerLen * 0.85) {
      const nudge = ((rightWhisker - leftWhisker) / whiskerLen) * 0.28;
      fwdDiff += nudge;
    }
  }

  return {
    forward: wantForward,
    backward: false,
    left: fwdDiff < -turnDeadbandRad,
    right: fwdDiff > turnDeadbandRad,
  };
}

/**
 * Prioritized 6-branch tactical AI Behavior Tree producing standard `PlayerInputState` commands:
 * 1. Unified Grid BFS Sensor (true corridor distances across large 22×13 & 24×14 mazes)
 * 2. Emergency Survival Reflex (Aegis Shield vs Bullets/Laser/Reaper + Urgent Evasion)
 * 3. Maze-Path Target & Crate Objective Selector
 * 4. Dedicated 10-Skill Weapon Mastery & Opportunistic TNT Trap Detonation
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

  // Branch 2: Defensive Aegis Shield / Phantom / Warp Recall / Remote EMP Detonation Reflexes!
  if (ctx.hasActiveEmpOrb) {
    const empOrb = ctx.projectiles.find(
      (p) => p.active && p.ownerIndex === self.index && p.variant === 'emp_orb' && p.age >= 0.08,
    );
    if (empOrb) {
      const blastR = arena.cellSize * POWERUP_CONFIG.empBlastCellsRadius * 0.94;
      const catchesEnemy = enemies.some(
        (e) => Math.hypot(e.x - empOrb.x, e.y - empOrb.y) <= blastR,
      );
      if (catchesEnemy) {
        return {
          ...idle,
          firePressed: true,
          fireHeld: false,
          fireBufferedUntil: mem.clock + 0.12,
        };
      }
    }
  }

  // Enemy Cryo Zones & Enemy Warp Beacons mild avoidance
  if (difficulty !== 'easy') {
    for (const cz of ctx.cryoZones ?? []) {
      if (cz.age >= cz.duration || cz.ownerIndex === self.index) continue;
      const dx = self.x - cz.x;
      const dy = self.y - cz.y;
      const d = Math.hypot(dx, dy) || 1;
      const avoidR = cz.radius + self.radius + 10 * scale;
      if (d < avoidR) {
        const push = ((avoidR - d) / avoidR) * 1.4;
        danger.dodgeX += (dx / d) * push;
        danger.dodgeY += (dy / d) * push;
      }
    }
  }

  if (ctx.selfSkill === 'warp' && ctx.selfWarpBeaconPlaced && ctx.canFire) {
    const riftKillReady = enemies.some(
      (e) =>
        !ctx.shieldedTankIndices.has(e.index) &&
        Math.hypot(e.x - self.x, e.y - self.y) <= POWERUP_CONFIG.warpBlastRadius * scale * 0.95,
    );
    const emergencyEscape = danger.imminentBulletTimeSec < 0.52 || danger.threatLevel >= 0.92;
    if (riftKillReady || emergencyEscape) {
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

  // Branch 4: Specialized 10-Skill Weapon Mastery & Opportunistic TNT Detonation
  let wantFirePressed = false;
  let wantFireHeld = false;
  let desiredAimAngle: number | null = null;
  const enemyShielded = ctx.shieldedTankIndices.has(primaryEnemy.index);

  if (ctx.selfSkill === 'laser') {
    // 1. LASER SIÊU CẤP: Cross-map wall-piercing beam with +-15 deg parabolic auto-aim (`2.0s` immobile charge!)
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
    // 2. LƯỠI HÁI TỬ THẦN: Rush deep inside the `4.7-cell` wall-piercing scythe radius before triggering `1.16s` windup!
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
    const safeWindup = wallsBetween >= 1 || danger.imminentBulletTimeSec > 1.05 || ctx.selfShielded;
    if (
      ctx.canFire &&
      !enemyShielded &&
      safeWindup &&
      distToEnemy <= arena.cellSize * maxSafeTriggerCells
    ) {
      wantFirePressed = true;
    }
  } else if (ctx.selfSkill === 'mine') {
    // 3. MÌN BÓNG MA: Plant stealth mines at corridor intersections/choke-points (never trap self in a 1-exit dead-end!)
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
    // 4. HỎA LONG PHUN LỬA: Direct inferno + 90-deg corner-sliding pre-fire + incoming-bullet incineration!
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
      primaryNavPreview.firstDoorway
    ) {
      const doorAng = Math.atan2(
        primaryNavPreview.firstDoorway.y - self.y,
        primaryNavPreview.firstDoorway.x - self.x,
      );
      if (danger.threatLevel < 0.35) {
        desiredAimAngle = doorAng;
      }
      if (Math.abs(wrapAngleRad(doorAng - self.angle)) < 0.36) {
        cornerSlideReady = true;
      }
    } else if (clearSight && distToEnemy <= flameRange && !enemyShielded && danger.threatLevel < 0.35) {
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
    // 5. MŨI KHOAN ĐỊA CHẤN: Carve through 1..4 INTERIOR walls (never outer border!) to snipe or open a shortcut!
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
    // 6. PHÁO CHÙM HẢI TẶC: Simulate ALL 5 fan pellets (`+-17.8 deg`) for corner broadsides & zero self-ricochet!
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
        mem.fireCooldownTimer = Math.max(POWERUP_CONFIG.scatterCooldownSec, profile.fireIntervalSec);
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
    // 7. ĐẠN ĐỊNH VỊ (2.5s slower ballistic bounce -> Maze-BFS Seeker!):
    //    - Close in first if enemy is > 10 corridor steps away.
    //    - Launch indirectly around corners / down corridors toward enemy territory where the 2.5s lock-point
    //      advances closer to the enemy, then IMMEDIATELY peel off / retreat into opposite rooms (`homingRetreatTimer`)
    //      so the AI never drives behind its own slower missile!
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

    if (directCheck.hitsEnemy && !directCheck.selfHitRisk && ctx.canFire && mem.fireCooldownTimer <= 0) {
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
        return { enemy: e, field: ef, curStepsFromSelf: curStepsFromSelf >= 0 ? curStepsFromSelf : 99 };
      });

      const candidateAngles: number[] = [self.angle];
      if (primaryNavPreview.firstDoorway) {
        const doorAng = Math.atan2(
          primaryNavPreview.firstDoorway.y - self.y,
          primaryNavPreview.firstDoorway.x - self.x,
        );
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

        // Only reject immediate close-wall self-ricochets (within ~3.4 cells, before AI peels off!)
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
          const directScore = 2600 - safetyTrace.travelDist - Math.abs(wrapAngleRad(ang - self.angle)) * 45;
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
        // Never fire a shot whose 2.5s bounce ends up right back in our own cell or adjacent dead-end!
        if (selfSteps < 1) continue;
        if (selfSteps === 1 && Math.hypot(lockPt.x - self.x, lockPt.y - self.y) < arena.cellSize * 1.15) {
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

        // Trajectory must actually penetrate closer toward an enemy along the maze!
        if (!advancesTowardEnemy) continue;

        // Account for AI's immediate post-launch retreat (~1.5 cells of extra separation on Normal+):
        const retreatBonus = difficulty === 'easy' ? 0 : arena.cellSize * 0.9;
        const mazeAdvantage = selfTrueMazeDist + retreatBonus - nearestEnemyMazeDist;
        const minRequiredAdvantage =
          difficulty === 'easy' ? arena.cellSize * 0.25 : arena.cellSize * 0.85;
        if (mazeAdvantage < minRequiredAdvantage) continue;

        // Prefer dropping the 2.5s seeker lock right outside the enemy's room (`1..3` cells away)!
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
    // 11. BÓNG MA XUYÊN TƯỜNG: Pop Phase Shift when walls separate us from an enemy within 5.5 cells or under fire!
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
    // 12. MỎ NEO KHÔNG GIAN (Stage 1): Plant anchor in a multi-exit cell before diving into combat!
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
    // 13. TƯỜNG NĂNG LƯỢNG: Seal corridor ahead to block imminent bullets, trap close enemies, or block Homing!
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
    // 14. LỰU ĐẠN XUNG ĐIỆN EMP: Launch toward shielded/channeling/nearby enemies (2nd press detonates mid-air!)
    const empSpeed =
      BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.empOrbSpeedMultiplier * scale;
    const empR =
      BASE_GAMEPLAY.projectileRadius * POWERUP_CONFIG.empOrbRadiusMultiplier * scale;
    const highValueEnemy = enemies.find(
      (e) =>
        ctx.shieldedTankIndices.has(e.index) ||
        ctx.reaperTankIndices.has(e.index) ||
        Boolean(ctx.laserChargingTankIndices?.has(e.index)),
    );
    const empTarget = highValueEnemy ?? primaryEnemy;
    const empDist = Math.hypot(empTarget.x - self.x, empTarget.y - self.y);
    if (ctx.canFire && mem.fireCooldownTimer <= 0 && empDist <= arena.cellSize * 5.8) {
      const directAng = Math.atan2(empTarget.y - self.y, empTarget.x - self.x);
      let bestEmpAng: number | null = null;
      let bestEmpErr = arena.cellSize * POWERUP_CONFIG.empBlastCellsRadius * 0.9;
      const probes = [directAng, self.angle];
      for (let k = 0; k < 20; k++) probes.push((k / 20) * Math.PI * 2 - Math.PI);
      for (const ang of probes) {
        const mx = self.x + Math.cos(ang) * barrelLen;
        const my = self.y + Math.sin(ang) * barrelLen;
        for (const tProbe of [0.45, 0.9, 1.4, 1.9]) {
          const pt = simulateBallisticEndpoint(mx, my, ang, empSpeed, tProbe, empR, arena.walls, 6);
          const err = Math.hypot(pt.x - empTarget.x, pt.y - empTarget.y);
          if (err < bestEmpErr) {
            bestEmpErr = err;
            bestEmpAng = ang;
          }
        }
      }
      if (bestEmpAng !== null) {
        if (Math.abs(wrapAngleRad(bestEmpAng - self.angle)) <= 0.18) {
          wantFirePressed = true;
          mem.fireCooldownTimer = 0.25;
        } else {
          desiredAimAngle = bestEmpAng;
        }
      }
    }
  } else if (!ctx.selfReaperSweeping) {
    // Standard Cannon / Gatling / Spike / Cryo (`0.92x` bounce freeze orb)!
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
          // Tactical Spike Airburst: bounce Spike Ball so its 3.0s detonation bursts shrapnel & ground spikes near enemy!
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

  // Urgent Evasion Override: dodge incoming bullets/blasts immediately (ignored if Aegis Shield is active and no mines/spikes!)
  if (danger.threatLevel >= 0.68 && (!ctx.selfShielded || danger.imminentBulletTimeSec === Infinity)) {
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

  // Branch 5: Brief, Doorway-Guided Unstuck Recovery (0.22s max, never drives aimlessly backward!)
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

  // Active Homing Disengage: if ANY Homing Missile is in its 2.5s pre-lock flight OR hunting nearby,
  // route nose-first via BFS to a multi-exit cell FAR from the missile so we NEVER follow our own missile
  // and ALWAYS force the 2.5s radar lock onto the enemy!
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
      const mField = computeMazeDistanceField(mCell, ctx.spikeZones, ctx.mines, arena, barrels, false);
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

  // Snap barrel onto firing solution when nearly aligned (or lining up Laser/Drill), without freezing forever!
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
    : resolveWaypointFromField(
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

  // IMPORTANT: Never pass allowEmergencyReverse=true during normal navigation (`false` prevents tail-first reverse driving!)
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
