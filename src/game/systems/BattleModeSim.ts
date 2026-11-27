import { getBattleModeDescriptor } from '../config/constants';
import { resolveTankWallCollisions } from './CollisionSystem';
import { SeededRng } from './MazeSystem';
import type {
  BattleModeId,
  BuiltArenaLayout,
  PlayerIndex,
  ProjectileKinematics,
  ProjectileVariant,
  TankKinematics,
  TntBarrelsOption,
  WallRect,
} from '../types/gameTypes';

export type DamageSourceKind =
  | ProjectileVariant
  | 'laser'
  | 'reaper'
  | 'mine'
  | 'ground_spike'
  | 'tnt_barrel'
  | 'emp_blast'
  | 'warp_blast';

export const BATTLE_MODE_DAMAGE_TABLE: Record<DamageSourceKind, number> = {
  standard: 25,
  gatling: 9,
  scatter: 18,
  drill: 38,
  flame: 6,
  spike_ball: 35,
  spike_shard: 22,
  ground_spike: 40,
  homing_missile: 56,
  mine: 75,
  laser: 80,
  reaper: 34,
  tnt_barrel: 48,
  emp_orb: 24,
  emp_blast: 24,
  cryo_orb: 35,
  warp_blast: 68,
};

export interface EffectiveBattleModeRules {
  mode: BattleModeId;
  hasArmorHp: boolean;
  maxHp: number;
  isNightOps: boolean;
  hasTntBarrels: boolean;
}

export function resolveEffectiveBattleModeRules(
  mode: BattleModeId,
  maxArmorHp: number,
  tntOption: TntBarrelsOption,
): EffectiveBattleModeRules {
  const desc = getBattleModeDescriptor(mode);
  const clampedHp = maxArmorHp === 150 || maxArmorHp === 200 ? maxArmorHp : 100;
  const hasTntBarrels =
    tntOption === 'on' ? true : tntOption === 'off' ? false : desc.defaultTntBarrels;
  return {
    mode: desc.id,
    hasArmorHp: desc.hasArmorHp,
    maxHp: desc.hasArmorHp ? clampedHp : 100,
    isNightOps: desc.isNightOps,
    hasTntBarrels,
  };
}

export function computeWeaponDamage(source: DamageSourceKind): number {
  return BATTLE_MODE_DAMAGE_TABLE[source] ?? 25;
}

export interface TntBarrelState {
  id: number;
  x: number;
  y: number;
  radius: number;
  blastRadius: number;
  active: boolean;
  fuseRemainingSec: number | null; // non-null when chain-triggered and about to detonate
}

/**
 * Spawns deterministic Explosive TNT Barrels inside maze cells/intersections,
 * keeping safe distance from tank spawn positions and walls.
 */
export function spawnTntBarrels(
  arena: BuiltArenaLayout,
  tanks: readonly Pick<TankKinematics, 'x' | 'y'>[],
  seed: number,
): TntBarrelState[] {
  const rng = new SeededRng((seed ^ 0x51ed270b) >>> 0);
  const totalCells = arena.grid.cols * arena.grid.rows;
  const targetCount = Math.max(4, Math.min(9, Math.round(totalCells * 0.085)));
  const barrelRadius = Math.max(10, 14.5 * arena.scaleRatio);
  const blastRadius = arena.cellSize * 1.65;
  const minSpawnClearance = Math.max(arena.cellSize * 1.75, barrelRadius * 5.5);

  const candidates: Array<{ x: number; y: number }> = [];
  for (let r = 0; r < arena.grid.rows; r++) {
    for (let c = 0; c < arena.grid.cols; c++) {
      const cx = arena.originX + (c + 0.5) * arena.cellSize;
      const cy = arena.originY + (r + 0.5) * arena.cellSize;
      let nearTank = false;
      for (const t of tanks) {
        if (Math.hypot(cx - t.x, cy - t.y) < minSpawnClearance) {
          nearTank = true;
          break;
        }
      }
      if (!nearTank) {
        candidates.push({ x: cx, y: cy });
      }
    }
  }

  // Fisher-Yates shuffle with deterministic RNG
  for (let i = candidates.length - 1; i > 0; i--) {
    const j = Math.floor(rng.nextFloat() * (i + 1));
    const tmp = candidates[i];
    candidates[i] = candidates[j];
    candidates[j] = tmp;
  }

  const barrels: TntBarrelState[] = [];
  let nextId = 1;
  for (const cand of candidates) {
    if (barrels.length >= targetCount) break;
    // Ensure barrels are spaced out by at least 1.5 cells so corridors remain navigable
    const tooClose = barrels.some(
      (b) => Math.hypot(b.x - cand.x, b.y - cand.y) < arena.cellSize * 1.45,
    );
    if (tooClose) continue;

    barrels.push({
      id: nextId++,
      x: Math.round(cand.x * 10) / 10,
      y: Math.round(cand.y * 10) / 10,
      radius: barrelRadius,
      blastRadius,
      active: true,
      fuseRemainingSec: null,
    });
  }

  return barrels;
}

/**
 * Treats active TNT Barrels as solid physical obstacles for living tanks,
 * resolving overlaps cleanly without pushing any tank into maze walls!
 */
export function resolveTankBarrelCollisions(
  tanks: TankKinematics[],
  barrels: readonly TntBarrelState[],
  walls: readonly WallRect[],
): void {
  for (const t of tanks) {
    if (!t.alive) continue;
    let pushed = false;
    for (const b of barrels) {
      if (!b.active) continue;
      const dx = t.x - b.x;
      const dy = t.y - b.y;
      const minDist = t.radius + b.radius;
      const dSq = dx * dx + dy * dy;
      if (dSq < minDist * minDist) {
        const d = Math.sqrt(dSq);
        const nx = d > 0.0001 ? dx / d : 1;
        const ny = d > 0.0001 ? dy / d : 0;
        const overlap = minDist - d;
        t.x += nx * overlap;
        t.y += ny * overlap;
        pushed = true;
      }
    }
    if (pushed) {
      resolveTankWallCollisions(t, walls);
    }
  }
}

export interface ProjectileBarrelHit {
  projectileId: number;
  barrelId: number;
  x: number;
  y: number;
}

export function findProjectileBarrelHits(
  projectiles: readonly ProjectileKinematics[],
  barrels: readonly TntBarrelState[],
): ProjectileBarrelHit[] {
  const hits: ProjectileBarrelHit[] = [];
  if (barrels.length === 0) return hits;

  for (const p of projectiles) {
    if (!p.active) continue;
    for (const b of barrels) {
      if (!b.active) continue;
      const minDist = p.radius + b.radius;
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      if (dx * dx + dy * dy <= minDist * minDist) {
        hits.push({
          projectileId: p.id,
          barrelId: b.id,
          x: p.x,
          y: p.y,
        });
        break;
      }
    }
  }
  return hits;
}

export interface BarrelBlastVictim {
  index: PlayerIndex;
  damage: number;
  knockbackDx: number;
  knockbackDy: number;
}

export interface BarrelBlastResult {
  victims: BarrelBlastVictim[];
  chainedBarrelIds: number[];
  wallProbePoints: Array<{ x: number; y: number }>;
}

/**
 * Computes splash damage, wall-safe knockback vectors, chained barrel IDs,
 * and surrounding interior wall points to demolish when a TNT barrel explodes!
 */
export function computeBarrelExplosionImpact(
  barrel: TntBarrelState,
  allBarrels: readonly TntBarrelState[],
  tanks: readonly TankKinematics[],
  arena: BuiltArenaLayout,
): BarrelBlastResult {
  const victims: BarrelBlastVictim[] = [];
  const blastR = barrel.blastRadius;

  for (const t of tanks) {
    if (!t.alive) continue;
    const dx = t.x - barrel.x;
    const dy = t.y - barrel.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= blastR + t.radius) {
      const norm = Math.max(0, Math.min(1, dist / Math.max(1, blastR)));
      const dmg = Math.round(
        BATTLE_MODE_DAMAGE_TABLE.tnt_barrel * (1 - norm * 0.52),
      );
      const nx = dist > 0.001 ? dx / dist : 1;
      const ny = dist > 0.001 ? dy / dist : 0;
      const pushMag = (1 - norm * 0.65) * 26 * arena.scaleRatio;
      victims.push({
        index: t.index,
        damage: Math.max(20, dmg),
        knockbackDx: nx * pushMag,
        knockbackDy: ny * pushMag,
      });
    }
  }

  const chainedBarrelIds: number[] = [];
  for (const other of allBarrels) {
    if (!other.active || other.id === barrel.id || other.fuseRemainingSec !== null) continue;
    if (Math.hypot(other.x - barrel.x, other.y - barrel.y) <= blastR * 1.08) {
      chainedBarrelIds.push(other.id);
    }
  }

  // Probe the 4 cardinal neighbor wall midpoints around the barrel so adjacent interior walls shatter!
  const probeDist = arena.cellSize * 0.52;
  const wallProbePoints = [
    { x: barrel.x + probeDist, y: barrel.y },
    { x: barrel.x - probeDist, y: barrel.y },
    { x: barrel.x, y: barrel.y + probeDist },
    { x: barrel.x, y: barrel.y - probeDist },
  ];

  return { victims, chainedBarrelIds, wallProbePoints };
}

/**
 * Applies a knockback displacement in small wall-checked substeps so a tank is NEVER
 * pushed into or through a maze wall by an explosion!
 */
export function applySafeTankKnockback(
  tank: TankKinematics,
  dx: number,
  dy: number,
  walls: readonly WallRect[],
): void {
  const maxStep = Math.max(2, tank.radius * 0.42);
  const totalDist = Math.hypot(dx, dy);
  if (totalDist < 0.01) return;
  const steps = Math.max(1, Math.ceil(totalDist / maxStep));
  const sx = dx / steps;
  const sy = dy / steps;
  for (let i = 0; i < steps; i++) {
    tank.x += sx;
    tank.y += sy;
    resolveTankWallCollisions(tank, walls);
  }
}

/**
 * Exact ray-vs-AABB slab intersection distance in `[0, maxRange]`.
 */
export function raycastDistanceAgainstWalls(
  ox: number,
  oy: number,
  dirX: number,
  dirY: number,
  maxRange: number,
  walls: readonly WallRect[],
  barrels?: readonly TntBarrelState[],
): number {
  let minT = maxRange;
  const invX = Math.abs(dirX) > 1e-8 ? 1 / dirX : 1e12;
  const invY = Math.abs(dirY) > 1e-8 ? 1 / dirY : 1e12;

  for (let i = 0; i < walls.length; i++) {
    const w = walls[i];
    const tx1 = (w.minX - ox) * invX;
    const tx2 = (w.maxX - ox) * invX;
    let tmin = tx1 < tx2 ? tx1 : tx2;
    let tmax = tx1 > tx2 ? tx1 : tx2;

    const ty1 = (w.minY - oy) * invY;
    const ty2 = (w.maxY - oy) * invY;
    const tyMin = ty1 < ty2 ? ty1 : ty2;
    const tyMax = ty1 > ty2 ? ty1 : ty2;

    if (tyMin > tmin) tmin = tyMin;
    if (tyMax < tmax) tmax = tyMax;

    if (tmax >= 0 && tmin <= tmax && tmin < minT) {
      minT = Math.max(0, tmin);
    }
  }

  if (barrels) {
    for (let i = 0; i < barrels.length; i++) {
      const b = barrels[i];
      if (!b.active) continue;
      const fx = ox - b.x;
      const fy = oy - b.y;
      const proj = fx * dirX + fy * dirY;
      const c = fx * fx + fy * fy - b.radius * b.radius;
      if (c > 0 && proj > 0) continue;
      const disc = proj * proj - c;
      if (disc < 0) continue;
      const t = Math.max(0, -proj - Math.sqrt(disc));
      if (t < minT) {
        minT = t;
      }
    }
  }

  return minT;
}

/**
 * Casts a smooth fan of rays across `[headingRad - coneHalfRad, headingRad + coneHalfRad]`
 * clipped against maze walls and TNT barrels to produce a realistic tactical headlight polygon!
 */
export function castFlashlightPolygon(
  originX: number,
  originY: number,
  headingRad: number,
  coneHalfRad: number,
  maxRange: number,
  walls: readonly WallRect[],
  barrels?: readonly TntBarrelState[],
  raySteps = 44,
): Array<{ x: number; y: number }> {
  const pts: Array<{ x: number; y: number }> = [{ x: originX, y: originY }];
  const startA = headingRad - coneHalfRad;
  const step = (coneHalfRad * 2) / Math.max(4, raySteps);

  for (let i = 0; i <= raySteps; i++) {
    const a = startA + i * step;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const hitDist = raycastDistanceAgainstWalls(
      originX,
      originY,
      dx,
      dy,
      maxRange,
      walls,
      barrels,
    );
    pts.push({
      x: originX + dx * hitDist,
      y: originY + dy * hitDist,
    });
  }

  return pts;
}

export interface FlashlightRaySample {
  x: number;
  y: number;
  dist: number;
  hitWall: boolean;
  normAngle: number; // -1..+1 across the cone
}

/**
 * Casts structured headlight ray samples with normalized angle (`-1..+1`) and `hitWall` flags
 * so the lighting engine can render smooth cosine angular falloff + 3D wall-face bounce highlights!
 */
export function castFlashlightRaySamples(
  originX: number,
  originY: number,
  headingRad: number,
  coneHalfRad: number,
  maxRange: number,
  walls: readonly WallRect[],
  barrels?: readonly TntBarrelState[],
  raySteps = 60,
): FlashlightRaySample[] {
  const samples: FlashlightRaySample[] = [];
  const steps = Math.max(6, raySteps);
  const startA = headingRad - coneHalfRad;
  const step = (coneHalfRad * 2) / steps;

  for (let i = 0; i <= steps; i++) {
    const normAngle = (i / steps) * 2 - 1;
    const a = startA + i * step;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const hitDist = raycastDistanceAgainstWalls(
      originX,
      originY,
      dx,
      dy,
      maxRange,
      walls,
      barrels,
    );
    samples.push({
      x: originX + dx * hitDist,
      y: originY + dy * hitDist,
      dist: hitDist,
      hitWall: hitDist < maxRange - 1.5,
      normAngle,
    });
  }
  return samples;
}

/**
 * Casts a 360-degree wall-occluded visibility polygon around a flying Signal-Flare projectile
 * (`đạn pháo sáng`) so shells illuminate corridors and side-doorways realistically without bleeding through walls!
 */
export function castOmnidirectionalLightPolygon(
  originX: number,
  originY: number,
  maxRadius: number,
  walls: readonly WallRect[],
  barrels?: readonly TntBarrelState[],
  rayCount = 36,
): Array<{ x: number; y: number; dist: number; hitWall: boolean }> {
  const pts: Array<{ x: number; y: number; dist: number; hitWall: boolean }> = [];
  const count = Math.max(12, rayCount);
  const step = (Math.PI * 2) / count;

  for (let i = 0; i < count; i++) {
    const a = i * step;
    const dx = Math.cos(a);
    const dy = Math.sin(a);
    const hitDist = raycastDistanceAgainstWalls(
      originX,
      originY,
      dx,
      dy,
      maxRadius,
      walls,
      barrels,
    );
    pts.push({
      x: originX + dx * hitDist,
      y: originY + dy * hitDist,
      dist: hitDist,
      hitWall: hitDist < maxRadius - 1.5,
    });
  }

  return pts;
}

export interface CoalescedFlareSource {
  x: number;
  y: number;
  vx: number;
  vy: number;
  variant: ProjectileVariant;
  weight: number;
}

/**
 * Merges tightly-packed projectile clusters (such as 40+ overlapping Flame puffs or Scatter pellets
 * within `mergeDist`) into clean representative Signal-Flare light sources to maintain locked 60+ FPS!
 */
export function coalesceProjectileLightSources(
  projectiles: readonly ProjectileKinematics[],
  mergeDist = 28,
  maxSources = 16,
): CoalescedFlareSource[] {
  const clusters: CoalescedFlareSource[] = [];
  const mergeSq = mergeDist * mergeDist;

  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (!p.active) continue;
    const variant: ProjectileVariant = p.variant ?? 'standard';

    let merged = false;
    for (let c = 0; c < clusters.length; c++) {
      const cl = clusters[c];
      if (cl.variant !== variant) continue;
      const dx = p.x - cl.x;
      const dy = p.y - cl.y;
      if (dx * dx + dy * dy <= mergeSq) {
        const nextW = cl.weight + 1;
        cl.x = (cl.x * cl.weight + p.x) / nextW;
        cl.y = (cl.y * cl.weight + p.y) / nextW;
        cl.vx = (cl.vx * cl.weight + p.vx) / nextW;
        cl.vy = (cl.vy * cl.weight + p.vy) / nextW;
        cl.weight = nextW;
        merged = true;
        break;
      }
    }

    if (!merged) {
      if (clusters.length < maxSources) {
        clusters.push({
          x: p.x,
          y: p.y,
          vx: p.vx,
          vy: p.vy,
          variant,
          weight: 1,
        });
      }
    }
  }

  return clusters;
}
