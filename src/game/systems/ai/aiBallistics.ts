import { POWERUP_CONFIG } from '../../config/gameplayConfig';
import type {
  BuiltArenaLayout,
  PlayerIndex,
  TankKinematics,
  WallRect,
} from '../../types/gameTypes';
import type { TntBarrelState } from '../BattleModeSim';
import { sweepCircleAgainstWall } from '../CollisionSystem';
import type { BallisticTraceResult } from './aiTypes';

export function rayCircleFirstHitDist(
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

export function countWallIntersections(
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

export function wallClearanceInDirection(
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

export function simulateBallisticEndpoint(
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

export function isOuterBoundaryWallHit(
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
