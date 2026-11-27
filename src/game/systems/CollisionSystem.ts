import type {
  ProjectileHitEvent,
  ProjectileKinematics,
  TankKinematics,
  WallBounceEvent,
  WallRect,
} from '../types/gameTypes';

const EPSILON = 1e-4;

/**
 * Resolves circle-vs-AABB tank-wall collisions with smooth sliding along walls
 * and clean corner gliding, preventing any tank from overlapping maze walls.
 */
export function resolveTankWallCollisions(tank: TankKinematics, walls: readonly WallRect[]): boolean {
  if (!tank.alive) return false;
  let collided = false;
  const r = tank.radius;
  const rSq = r * r;

  for (let iter = 0; iter < 3; iter++) {
    let anyPush = false;
    for (let i = 0; i < walls.length; i++) {
      const w = walls[i];
      if (
        tank.x + r < w.minX ||
        tank.x - r > w.maxX ||
        tank.y + r < w.minY ||
        tank.y - r > w.maxY
      ) {
        continue;
      }

      const closestX = Math.max(w.minX, Math.min(tank.x, w.maxX));
      const closestY = Math.max(w.minY, Math.min(tank.y, w.maxY));
      const dx = tank.x - closestX;
      const dy = tank.y - closestY;
      const distSq = dx * dx + dy * dy;

      if (distSq < rSq) {
        collided = true;
        anyPush = true;
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;
          const overlap = r - dist + EPSILON;
          tank.x += nx * overlap;
          tank.y += ny * overlap;

          // Project out inward normal velocity so tank glides smoothly along wall
          const vn = tank.vx * nx + tank.vy * ny;
          if (vn < 0) {
            tank.vx -= vn * nx;
            tank.vy -= vn * ny;
          }
        } else {
          // Tank center is inside AABB — push out along shallowest penetration axis
          const penLeft = tank.x - w.minX;
          const penRight = w.maxX - tank.x;
          const penTop = tank.y - w.minY;
          const penBottom = w.maxY - tank.y;
          const minPen = Math.min(penLeft, penRight, penTop, penBottom);
          if (minPen === penLeft) {
            tank.x = w.minX - r - EPSILON;
            if (tank.vx > 0) tank.vx = 0;
          } else if (minPen === penRight) {
            tank.x = w.maxX + r + EPSILON;
            if (tank.vx < 0) tank.vx = 0;
          } else if (minPen === penTop) {
            tank.y = w.minY - r - EPSILON;
            if (tank.vy > 0) tank.vy = 0;
          } else {
            tank.y = w.maxY + r + EPSILON;
            if (tank.vy < 0) tank.vy = 0;
          }
        }
      }
    }
    if (!anyPush) break;
  }

  return collided;
}

/**
 * Resolves solid tank-vs-tank collisions and re-clamps against walls so no tank
 * can push another tank through a wall.
 */
export function resolveAllTankCollisions(
  tanks: TankKinematics[],
  walls: readonly WallRect[],
  phantomIndices?: ReadonlySet<number>,
  perimeterWalls?: readonly WallRect[],
): void {
  const wallsFor = (t: TankKinematics): readonly WallRect[] =>
    phantomIndices?.has(t.index) && perimeterWalls ? perimeterWalls : walls;

  const blockedByWall = new Array<boolean>(tanks.length).fill(false);
  for (let i = 0; i < tanks.length; i++) {
    blockedByWall[i] = resolveTankWallCollisions(tanks[i], wallsFor(tanks[i]));
  }

  for (let iter = 0; iter < 6; iter++) {
    let anyTankOverlap = false;
    for (let i = 0; i < tanks.length; i++) {
      const a = tanks[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < tanks.length; j++) {
        const b = tanks[j];
        if (!b.alive) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const minDist = a.radius + b.radius;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDist * minDist) {
          anyTankOverlap = true;
          const dist = Math.sqrt(distSq) || 0.001;
          const nx = dx / dist;
          const ny = dy / dist;
          const totalOverlap = minDist - dist + EPSILON;
          // Transfer more displacement to whichever tank is NOT pinned against a wall
          const weightA = blockedByWall[i] && !blockedByWall[j] ? 0.15 : !blockedByWall[i] && blockedByWall[j] ? 0.85 : 0.5;
          const weightB = 1 - weightA;
          a.x -= nx * totalOverlap * weightA;
          a.y -= ny * totalOverlap * weightA;
          b.x += nx * totalOverlap * weightB;
          b.y += ny * totalOverlap * weightB;
        }
      }
    }

    for (let i = 0; i < tanks.length; i++) {
      blockedByWall[i] = resolveTankWallCollisions(tanks[i], wallsFor(tanks[i]));
    }
    if (!anyTankOverlap) break;
  }
}

export interface SweptHit {
  t: number;
  nx: number;
  ny: number;
}

/**
 * Swept circle (radius `r`) from `(x0, y0)` by `(dx, dy)` against an AABB `WallRect`.
 * Tests the 4 flat edges (expanded by `r`) and the 4 rounded corners (circles of radius `r`)
 * for exact, zero-tunneling ricochet reflection.
 */
export function sweepCircleAgainstWall(
  x0: number,
  y0: number,
  dx: number,
  dy: number,
  r: number,
  w: WallRect,
): SweptHit | null {
  const minBoundX = Math.min(x0, x0 + dx) - r - 1;
  const maxBoundX = Math.max(x0, x0 + dx) + r + 1;
  const minBoundY = Math.min(y0, y0 + dy) - r - 1;
  const maxBoundY = Math.max(y0, y0 + dy) + r + 1;

  if (maxBoundX < w.minX || minBoundX > w.maxX || maxBoundY < w.minY || minBoundY > w.maxY) {
    return null;
  }

  // First check if starting position is already penetrating this wall
  const cx = Math.max(w.minX, Math.min(x0, w.maxX));
  const cy = Math.max(w.minY, Math.min(y0, w.maxY));
  const odx = x0 - cx;
  const ody = y0 - cy;
  const oDistSq = odx * odx + ody * ody;
  if (oDistSq < (r - 0.05) * (r - 0.05)) {
    if (oDistSq > 1e-8) {
      const oDist = Math.sqrt(oDistSq);
      const nx = odx / oDist;
      const ny = ody / oDist;
      if (dx * nx + dy * ny < 0) {
        return { t: 0, nx, ny };
      }
    } else {
      const penL = x0 - w.minX;
      const penR = w.maxX - x0;
      const penT = y0 - w.minY;
      const penB = w.maxY - y0;
      const m = Math.min(penL, penR, penT, penB);
      if (m === penL) return { t: 0, nx: -1, ny: 0 };
      if (m === penR) return { t: 0, nx: 1, ny: 0 };
      if (m === penT) return { t: 0, nx: 0, ny: -1 };
      return { t: 0, nx: 0, ny: 1 };
    }
  }

  let best = null as SweptHit | null;

  // 1. Left vertical face (x = w.minX - r, y in [w.minY, w.maxY]), moving right (dx > 0)
  if (dx > 1e-8) {
    const t = (w.minX - r - x0) / dx;
    if (t >= -1e-5 && t <= 1) {
      const hitY = y0 + dy * t;
      if (hitY >= w.minY && hitY <= w.maxY) {
        const clampedT = Math.max(0, t);
        if (!best || clampedT < best.t) best = { t: clampedT, nx: -1, ny: 0 };
      }
    }
  }
  // 2. Right vertical face (x = w.maxX + r, y in [w.minY, w.maxY]), moving left (dx < 0)
  if (dx < -1e-8) {
    const t = (w.maxX + r - x0) / dx;
    if (t >= -1e-5 && t <= 1) {
      const hitY = y0 + dy * t;
      if (hitY >= w.minY && hitY <= w.maxY) {
        const clampedT = Math.max(0, t);
        if (!best || clampedT < best.t) best = { t: clampedT, nx: 1, ny: 0 };
      }
    }
  }
  // 3. Top horizontal face (y = w.minY - r, x in [w.minX, w.maxX]), moving down (dy > 0)
  if (dy > 1e-8) {
    const t = (w.minY - r - y0) / dy;
    if (t >= -1e-5 && t <= 1) {
      const hitX = x0 + dx * t;
      if (hitX >= w.minX && hitX <= w.maxX) {
        const clampedT = Math.max(0, t);
        if (!best || clampedT < best.t) best = { t: clampedT, nx: 0, ny: -1 };
      }
    }
  }
  // 4. Bottom horizontal face (y = w.maxY + r, x in [w.minX, w.maxX]), moving up (dy < 0)
  if (dy < -1e-8) {
    const t = (w.maxY + r - y0) / dy;
    if (t >= -1e-5 && t <= 1) {
      const hitX = x0 + dx * t;
      if (hitX >= w.minX && hitX <= w.maxX) {
        const clampedT = Math.max(0, t);
        if (!best || clampedT < best.t) best = { t: clampedT, nx: 0, ny: 1 };
      }
    }
  }

  // 5. Four corner circles of radius `r` centered at the wall vertices
  const corners: Array<[number, number]> = [
    [w.minX, w.minY],
    [w.maxX, w.minY],
    [w.minX, w.maxY],
    [w.maxX, w.maxY],
  ];
  const a = dx * dx + dy * dy;
  if (a > 1e-9) {
    for (let c = 0; c < 4; c++) {
      const [vx, vy] = corners[c];
      const fx = x0 - vx;
      const fy = y0 - vy;
      const b = 2 * (fx * dx + fy * dy);
      if (b >= 0) continue; // moving away from corner
      const cc = fx * fx + fy * fy - r * r;
      const disc = b * b - 4 * a * cc;
      if (disc < 0) continue;
      const t = (-b - Math.sqrt(disc)) / (2 * a);
      if (t >= 0 && t <= 1 && (!best || t < best.t)) {
        const hx = x0 + dx * t;
        const hy = y0 + dy * t;
        const len = Math.hypot(hx - vx, hy - vy);
        let nx = 0;
        let ny = 0;
        if (len > 1e-8) {
          const rawNx = (hx - vx) / len;
          const rawNy = (hy - vy) / len;
          // Snap nearly-axis hits cleanly; otherwise preserve exact unit radial corner normal!
          if (Math.abs(rawNx) > 0.94) {
            nx = Math.sign(rawNx);
            ny = 0;
          } else if (Math.abs(rawNy) > 0.94) {
            nx = 0;
            ny = Math.sign(rawNy);
          } else {
            nx = rawNx;
            ny = rawNy;
          }
        } else {
          const dLen = Math.hypot(dx, dy) || 1;
          nx = -dx / dLen;
          ny = -dy / dLen;
        }
        best = { t, nx, ny };
      }
    }
  }

  return best;
}

/**
 * Checks if spawning a projectile from tank center `(tx, ty)` out to barrel tip `(mx, my)`
 * crosses a wall, returning the safe spawn & reflected velocity if blocked by an adjacent wall.
 */
export function computeSafeMuzzleSpawn(
  tx: number,
  ty: number,
  angle: number,
  barrelLength: number,
  projRadius: number,
  speed: number,
  walls: readonly WallRect[],
): { x: number; y: number; vx: number; vy: number; immediateBounce: boolean } {
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  const dx = dirX * barrelLength;
  const dy = dirY * barrelLength;

  let earliest: SweptHit | null = null;
  for (let i = 0; i < walls.length; i++) {
    const hit = sweepCircleAgainstWall(tx, ty, dx, dy, projRadius, walls[i]);
    if (hit && (!earliest || hit.t < earliest.t)) {
      earliest = hit;
    }
  }

  if (!earliest) {
    return {
      x: tx + dx,
      y: ty + dy,
      vx: dirX * speed,
      vy: dirY * speed,
      immediateBounce: false,
    };
  }

  const safeT = Math.max(0, earliest.t - 0.02);
  const nLen = Math.hypot(earliest.nx, earliest.ny) || 1;
  const unx = earliest.nx / nLen;
  const uny = earliest.ny / nLen;
  const spawnX = tx + dx * safeT + unx * 0.5;
  const spawnY = ty + dy * safeT + uny * 0.5;
  const dot = (dirX * unx + dirY * uny) * 2;
  let rdx = dirX - dot * unx;
  let rdy = dirY - dot * uny;
  const rLen = Math.hypot(rdx, rdy) || 1;
  rdx /= rLen;
  rdy /= rLen;
  return {
    x: spawnX,
    y: spawnY,
    vx: rdx * speed,
    vy: rdy * speed,
    immediateBounce: true,
  };
}

/**
 * Steps all active projectiles forward by `dt` seconds with continuous swept wall
 * ricochets and swept segment-vs-tank hit detection.
 */
export function stepProjectilesSimulation(
  projectiles: ProjectileKinematics[],
  tanks: readonly TankKinematics[],
  walls: readonly WallRect[],
  dt: number,
  onDrillImpact?: (
    proj: ProjectileKinematics,
    impactX: number,
    impactY: number,
  ) => boolean,
): { bounces: WallBounceEvent[]; hits: ProjectileHitEvent[] } {
  const bounces: WallBounceEvent[] = [];
  const hits: ProjectileHitEvent[] = [];

  const clampedDt = Math.min(dt, 0.05);

  for (let pIdx = 0; pIdx < projectiles.length; pIdx++) {
    const p = projectiles[pIdx];
    if (!p.active) continue;

    p.age += clampedDt;
    if (p.graceTimer > 0) {
      p.graceTimer = Math.max(0, p.graceTimer - clampedDt);
    }
    if (p.age >= p.maxLifetime) {
      p.active = false;
      continue;
    }

    p.prevX = p.x;
    p.prevY = p.y;

    let remainingDt = clampedDt;
    let safetyBounces = 0;

    while (remainingDt > 1e-6 && p.active && safetyBounces < 6) {
      const segStartX = p.x;
      const segStartY = p.y;
      const dx = p.vx * remainingDt;
      const dy = p.vy * remainingDt;

      let earliestWall: SweptHit | null = null;
      for (let wIdx = 0; wIdx < walls.length; wIdx++) {
        const hit = sweepCircleAgainstWall(segStartX, segStartY, dx, dy, p.radius, walls[wIdx]);
        if (hit && (!earliestWall || hit.t < earliestWall.t)) {
          earliestWall = hit;
        }
      }

      const travelFraction = earliestWall ? earliestWall.t : 1;
      const segEndX = segStartX + dx * travelFraction;
      const segEndY = segStartY + dy * travelFraction;

      // Test swept segment against all living tanks BEFORE applying the wall bounce at segEnd
      const hitVictim = findEarliestTankHitOnSegment(
        p,
        segStartX,
        segStartY,
        segEndX,
        segEndY,
        tanks,
      );
      if (hitVictim) {
        p.x = hitVictim.hitX;
        p.y = hitVictim.hitY;
        p.active = false;
        hits.push({
          projectileId: p.id,
          ownerIndex: p.ownerIndex,
          victimIndex: hitVictim.tank.index,
          x: hitVictim.hitX,
          y: hitVictim.hitY,
        });
        break;
      }

      p.x = segEndX;
      p.y = segEndY;

      if (earliestWall) {
        const behavior = p.bounceBehavior ?? 'reflect';

        if (behavior === 'shatter') {
          p.x += earliestWall.nx * 0.35;
          p.y += earliestWall.ny * 0.35;
          bounces.push({
            projectileId: p.id,
            x: p.x,
            y: p.y,
            nx: earliestWall.nx,
            ny: earliestWall.ny,
            bounces: p.bounces + 1,
          });
          p.active = false;
          break;
        }

        if (behavior === 'drill') {
          const probeX = segEndX - earliestWall.nx * 3.0;
          const probeY = segEndY - earliestWall.ny * 3.0;
          if ((p.drillsLeft ?? 0) > 0 && onDrillImpact && onDrillImpact(p, probeX, probeY)) {
            p.drillsLeft = (p.drillsLeft ?? 1) - 1;
            p.graceTimer = 0;
            if (p.drillsLeft <= 0) {
              bounces.push({
                projectileId: p.id,
                x: probeX,
                y: probeY,
                nx: earliestWall.nx,
                ny: earliestWall.ny,
                bounces: p.bounces + 1,
              });
              p.active = false;
              break;
            }
            // Wall was carved away! Punch straight through without reflecting
            const speed = Math.hypot(p.vx, p.vy) || 1;
            p.x = segEndX + (p.vx / speed) * 1.2;
            p.y = segEndY + (p.vy / speed) * 1.2;
            remainingDt *= 1 - travelFraction;
            safetyBounces++;
            continue;
          }
          // Hit an indestructible outer border wall (or no drills left): reflect cleanly if drills remain!
          if ((p.drillsLeft ?? 0) <= 0) {
            p.active = false;
            break;
          }
        }

        if (behavior === 'slide') {
          p.x += earliestWall.nx * 0.55;
          p.y += earliestWall.ny * 0.55;
          const speed = Math.hypot(p.vx, p.vy) || 1;
          const vn = p.vx * earliestWall.nx + p.vy * earliestWall.ny;
          let tvx = p.vx - vn * earliestWall.nx;
          let tvy = p.vy - vn * earliestWall.ny;
          const tLen = Math.hypot(tvx, tvy);
          if (tLen > 1e-4) {
            p.vx = (tvx / tLen) * speed;
            p.vy = (tvy / tLen) * speed;
          } else {
            // Perpendicular nose-on contact: reflect outward so seeker turns cleanly next tick
            const dot2 = 2 * vn;
            p.vx -= dot2 * earliestWall.nx;
            p.vy -= dot2 * earliestWall.ny;
          }
          p.graceTimer = 0;
          remainingDt *= 1 - travelFraction;
          safetyBounces++;
          continue;
        }

        // Default 'reflect': nudge off contact surface & reflect velocity specularly with exact speed conservation
        const nLen = Math.hypot(earliestWall.nx, earliestWall.ny) || 1;
        const unx = earliestWall.nx / nLen;
        const uny = earliestWall.ny / nLen;
        const preSpeed = Math.hypot(p.vx, p.vy);

        p.x += unx * 0.35;
        p.y += uny * 0.35;
        const dot2 = 2 * (p.vx * unx + p.vy * uny);
        let rvx = p.vx - dot2 * unx;
        let rvy = p.vy - dot2 * uny;
        const postLen = Math.hypot(rvx, rvy);
        if (postLen > 1e-8 && preSpeed > 0) {
          p.vx = (rvx / postLen) * preSpeed;
          p.vy = (rvy / postLen) * preSpeed;
        } else {
          p.vx = rvx;
          p.vy = rvy;
        }
        p.bounces += 1;
        p.graceTimer = 0; // Once reflected off any wall, shell can hit its own shooter!

        bounces.push({
          projectileId: p.id,
          x: p.x,
          y: p.y,
          nx: earliestWall.nx,
          ny: earliestWall.ny,
          bounces: p.bounces,
        });

        if (p.bounces > p.maxBounces) {
          p.active = false;
          break;
        }

        remainingDt *= 1 - travelFraction;
        safetyBounces++;
      } else {
        remainingDt = 0;
      }
    }
  }

  return { bounces, hits };
}

function findEarliestTankHitOnSegment(
  proj: ProjectileKinematics,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  tanks: readonly TankKinematics[],
): { tank: TankKinematics; t: number; hitX: number; hitY: number } | null {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const segLenSq = dx * dx + dy * dy;

  let best: { tank: TankKinematics; t: number; hitX: number; hitY: number } | null = null;

  for (let i = 0; i < tanks.length; i++) {
    const t = tanks[i];
    if (!t.alive) continue;
    if (
      t.index === proj.ownerIndex &&
      (proj.graceTimer > 0 ||
        proj.variant === 'flame' ||
        proj.variant === 'emp_orb' ||
        proj.variant === 'cryo_orb')
    ) {
      continue;
    }

    const combinedR = proj.radius + t.radius * 0.94;
    const combinedRSq = combinedR * combinedR;

    let param = 0;
    if (segLenSq > 1e-9) {
      param = ((t.x - x0) * dx + (t.y - y0) * dy) / segLenSq;
      param = Math.max(0, Math.min(1, param));
    }
    const cx = x0 + dx * param;
    const cy = y0 + dy * param;
    const distSq = (t.x - cx) * (t.x - cx) + (t.y - cy) * (t.y - cy);

    if (distSq <= combinedRSq && (!best || param < best.t)) {
      best = { tank: t, t: param, hitX: cx, hitY: cy };
    }
  }

  return best;
}
