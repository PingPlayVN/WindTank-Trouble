import {
  BASE_GAMEPLAY,
  getSkillDescriptor,
  POWERUP_CONFIG,
  SKILL_DESCRIPTORS,
} from '../config/constants';
import { rebuildArenaWalls } from '../maps/MazeBuilder';
import { getAccessibleNeighbors, type SeededRng } from './MazeSystem';
import { sweepCircleAgainstWall } from './CollisionSystem';
import type {
  BuiltArenaLayout,
  GridCell,
  PlayerIndex,
  ProjectileKinematics,
  SkillId,
  TankKinematics,
  WallRect,
} from '../types/gameTypes';

export interface MysteryCrateState {
  id: number;
  col: number;
  row: number;
  x: number;
  y: number;
  radius: number;
  spawnAge: number;
}

export interface GroundSpikeNode {
  x: number;
  y: number;
  radius: number;
  angle: number;
}

export interface GroundSpikeZone {
  id: number;
  ownerIndex: PlayerIndex;
  x: number;
  y: number;
  age: number;
  duration: number;
  nodes: GroundSpikeNode[];
}

export interface PlayerSkillState {
  skill: SkillId | null;
  ammo: number;
  chargingLaserRemaining: number;
  reaperWindupRemaining?: number;
  reaperDeployRemaining?: number;
  reaperSpinRemaining?: number;
}

export interface ProximityMineState {
  id: number;
  ownerIndex: PlayerIndex;
  x: number;
  y: number;
  age: number;
  armingSec: number;
  duration: number;
  triggerRadius: number;
  blastRadius: number;
}

export function wrapAngleRad(angle: number): number {
  let a = (angle + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

/**
 * Rolls a random skill weighted by power/rarity, respecting `enabledSkills` when provided.
 */
export function rollWeightedSkill(
  rng: SeededRng,
  enabledSkills?: ReadonlyArray<SkillId>,
): SkillId {
  const pool =
    enabledSkills && enabledSkills.length > 0
      ? SKILL_DESCRIPTORS.filter((d) => enabledSkills.includes(d.id))
      : SKILL_DESCRIPTORS;

  if (pool.length === 0) {
    return SKILL_DESCRIPTORS[0].id;
  }

  let totalWeight = 0;
  for (const desc of pool) {
    totalWeight += desc.weight;
  }
  let pick = rng.nextFloat() * totalWeight;
  for (const desc of pool) {
    pick -= desc.weight;
    if (pick <= 0) {
      return desc.id;
    }
  }
  return pool[0].id;
}

export function canPickupCrate(state: PlayerSkillState, pendingDischarge = false): boolean {
  return (
    state.chargingLaserRemaining <= 0 &&
    !pendingDischarge &&
    (state.reaperWindupRemaining ?? 0) <= 0 &&
    (state.reaperDeployRemaining ?? 0) <= 0 &&
    (state.reaperSpinRemaining ?? 0) <= 0
  );
}

export function tryApplyCratePickup(
  state: PlayerSkillState,
  rolledSkill: SkillId,
  pendingDischarge = false,
): { pickedUp: boolean; nextState: PlayerSkillState } {
  if (!canPickupCrate(state, pendingDischarge)) {
    return {
      pickedUp: false,
      nextState: { ...state },
    };
  }
  const desc = getSkillDescriptor(rolledSkill);
  return {
    pickedUp: true,
    nextState: {
      skill: rolledSkill,
      ammo: desc.ammo,
      chargingLaserRemaining: 0,
    },
  };
}

/**
 * Picks a safe, unoccupied maze cell for spawning a Mystery Wooden Crate.
 */
export function pickMysteryCrateCell(
  arena: BuiltArenaLayout,
  tanks: readonly TankKinematics[],
  crates: readonly MysteryCrateState[],
  spikeZones: readonly GroundSpikeZone[],
  rng: SeededRng,
  maxCrates: number = POWERUP_CONFIG.maxCratesOnFloor,
): { col: number; row: number; x: number; y: number } | null {
  if (crates.length >= maxCrates) {
    return null;
  }

  const candidates: Array<{ col: number; row: number; x: number; y: number; minTankDist: number }> = [];
  const { cols, rows } = arena.grid;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (crates.some((c) => c.col === col && c.row === row)) continue;
      const cx = arena.originX + (col + 0.5) * arena.cellSize;
      const cy = arena.originY + (row + 0.5) * arena.cellSize;

      const onSpikes = spikeZones.some(
        (z) => z.age < z.duration && Math.hypot(cx - z.x, cy - z.y) < arena.cellSize * 0.85,
      );
      if (onSpikes) continue;

      let minTankDist = Infinity;
      for (const t of tanks) {
        if (!t.alive) continue;
        const d = Math.hypot(cx - t.x, cy - t.y);
        if (d < minTankDist) minTankDist = d;
      }

      candidates.push({ col, row, x: cx, y: cy, minTankDist });
    }
  }

  if (candidates.length === 0) return null;

  const safeThreshold = arena.cellSize * 1.45;
  const roomy = candidates.filter((c) => c.minTankDist >= safeThreshold);
  if (roomy.length > 0) {
    const chosen = roomy[rng.nextInt(roomy.length)];
    return { col: chosen.col, row: chosen.row, x: chosen.x, y: chosen.y };
  }

  candidates.sort((a, b) => b.minTankDist - a.minTankDist);
  const top = candidates[0];
  return { col: top.col, row: top.row, x: top.x, y: top.y };
}

/**
 * Computes the cross-map wall-piercing blue Laser trajectory:
 * - Scans living rival tanks strictly in front of the muzzle within +-15 degrees.
 * - If found, bends along a smooth local-frame parabola `y' = k * x'^2` directly through the closest rival
 *   and continues across the entire arena boundary.
 * - Otherwise fires a straight ray across the entire arena boundary.
 */
export function computeLaserBeam(
  muzzleX: number,
  muzzleY: number,
  angle: number,
  ownerIndex: PlayerIndex,
  tanks: readonly TankKinematics[],
  arena: BuiltArenaLayout,
): {
  points: Array<{ x: number; y: number }>;
  lockedTargetIndex: PlayerIndex | null;
  hitVictimIndices: PlayerIndex[];
} {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const nx = -uy;
  const ny = ux;

  const maxConeRad = (POWERUP_CONFIG.laserAutoAimConeDeg * Math.PI) / 180;

  let lockedTarget: { index: PlayerIndex; localX: number; localY: number; dist: number } | null = null;

  for (const t of tanks) {
    if (!t.alive || t.index === ownerIndex) continue;
    const dx = t.x - muzzleX;
    const dy = t.y - muzzleY;
    const localX = dx * ux + dy * uy;
    const localY = dx * nx + dy * ny;
    if (localX <= 2) continue;

    const relAngle = Math.abs(Math.atan2(localY, localX));
    if (relAngle <= maxConeRad + 1e-6) {
      const dist = Math.hypot(localX, localY);
      if (!lockedTarget || dist < lockedTarget.dist) {
        lockedTarget = { index: t.index, localX, localY, dist };
      }
    }
  }

  const minX = arena.originX;
  const maxX = arena.originX + arena.width;
  const minY = arena.originY;
  const maxY = arena.originY + arena.height;
  const stepPx = Math.max(3, 5 * arena.scaleRatio);
  const maxSpan = Math.hypot(arena.width, arena.height) * 1.6;

  const points: Array<{ x: number; y: number }> = [{ x: muzzleX, y: muzzleY }];
  const k =
    lockedTarget && lockedTarget.localX > 1
      ? lockedTarget.localY / (lockedTarget.localX * lockedTarget.localX)
      : 0;

  let s = stepPx;
  while (s <= maxSpan) {
    const localY = k * s * s;
    const wx = muzzleX + ux * s + nx * localY;
    const wy = muzzleY + uy * s + ny * localY;

    if (wx < minX || wx > maxX || wy < minY || wy > maxY) {
      const prev = points[points.length - 1];
      const exitPt = clipSegmentExitToBox(prev.x, prev.y, wx, wy, minX, minY, maxX, maxY);
      points.push(exitPt);
      break;
    }

    points.push({ x: wx, y: wy });
    s += stepPx;
  }

  if (points.length === 1) {
    points.push({
      x: Math.max(minX, Math.min(maxX, muzzleX + ux * 10)),
      y: Math.max(minY, Math.min(maxY, muzzleY + uy * 10)),
    });
  }

  const beamHalfWidth = POWERUP_CONFIG.laserBeamHalfWidth * arena.scaleRatio;
  const hitVictimIndices: PlayerIndex[] = [];

  for (const t of tanks) {
    if (!t.alive || t.index === ownerIndex) continue;
    const hitRadius = t.radius + beamHalfWidth;
    const hitRadiusSq = hitRadius * hitRadius;
    let hit = false;

    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      if (pointToSegmentDistSq(t.x, t.y, p0.x, p0.y, p1.x, p1.y) <= hitRadiusSq) {
        hit = true;
        break;
      }
    }
    if (hit) {
      hitVictimIndices.push(t.index);
    }
  }

  return {
    points,
    lockedTargetIndex: lockedTarget ? lockedTarget.index : null,
    hitVictimIndices,
  };
}

function clipSegmentExitToBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): { x: number; y: number } {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let bestT = 1;

  if (dx > 1e-6) bestT = Math.min(bestT, (maxX - x0) / dx);
  else if (dx < -1e-6) bestT = Math.min(bestT, (minX - x0) / dx);

  if (dy > 1e-6) bestT = Math.min(bestT, (maxY - y0) / dy);
  else if (dy < -1e-6) bestT = Math.min(bestT, (minY - y0) / dy);

  const clampedT = Math.max(0, Math.min(1, bestT));
  return {
    x: x0 + dx * clampedT,
    y: y0 + dy * clampedT,
  };
}

function pointToSegmentDistSq(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 1e-9) {
    t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / lenSq));
  }
  const cx = x0 + dx * t;
  const cy = y0 + dy * t;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

/**
 * Generates the 3.0s Spike Shell burst payload:
 * - 16 high-speed iron spike shrapnel vectors radiating in 360 deg
 * - Wall-occluded lethal ground spike nodes embedded around the blast site
 */
export function createSpikeBurstPayload(
  cx: number,
  cy: number,
  arena: BuiltArenaLayout,
  rng: SeededRng,
): {
  shrapnelVelocities: Array<{ vx: number; vy: number }>;
  groundNodes: GroundSpikeNode[];
} {
  const shrapnelCount = POWERUP_CONFIG.spikeShrapnelCount;
  const shrapnelSpeed =
    BASE_GAMEPLAY.projectileSpeed *
    POWERUP_CONFIG.spikeShrapnelSpeedMultiplier *
    arena.scaleRatio;

  const shrapnelVelocities: Array<{ vx: number; vy: number }> = [];
  for (let i = 0; i < shrapnelCount; i++) {
    const baseAngle = (i / shrapnelCount) * Math.PI * 2;
    const jitter = (rng.nextFloat() - 0.5) * 0.08;
    const a = baseAngle + jitter;
    shrapnelVelocities.push({
      vx: Math.cos(a) * shrapnelSpeed,
      vy: Math.sin(a) * shrapnelSpeed,
    });
  }

  const nodeRadius = POWERUP_CONFIG.spikeGroundNodeRadius * arena.scaleRatio;
  const maxRadius = POWERUP_CONFIG.spikeGroundRadius * arena.scaleRatio;
  const groundNodes: GroundSpikeNode[] = [
    { x: cx, y: cy, radius: nodeRadius, angle: rng.nextFloat() * Math.PI * 2 },
  ];

  const count = POWERUP_CONFIG.spikeGroundNodeCount;
  for (let i = 0; i < count; i++) {
    const ringFrac = i % 2 === 0 ? 0.52 : 0.96;
    const dist = maxRadius * ringFrac * (0.88 + rng.nextFloat() * 0.18);
    const angle = (i / count) * Math.PI * 2 + (rng.nextFloat() - 0.5) * 0.16;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;

    let earliestT = 1;
    for (let w = 0; w < arena.walls.length; w++) {
      const hit = sweepCircleAgainstWall(cx, cy, dx, dy, nodeRadius * 0.75, arena.walls[w]);
      if (hit && hit.t < earliestT) {
        earliestT = hit.t;
      }
    }

    const safeT = earliestT < 1 ? Math.max(0, earliestT - 0.1) : 1;
    groundNodes.push({
      x: cx + dx * safeT,
      y: cy + dy * safeT,
      radius: nodeRadius,
      angle,
    });
  }

  return { shrapnelVelocities, groundNodes };
}

export function findGroundSpikeVictims(
  zones: readonly GroundSpikeZone[],
  tanks: readonly TankKinematics[],
): PlayerIndex[] {
  const victims: PlayerIndex[] = [];
  for (const t of tanks) {
    if (!t.alive) continue;
    let impaled = false;
    for (const z of zones) {
      if (z.age >= z.duration) continue;
      for (const node of z.nodes) {
        const hitDist = t.radius * 0.88 + node.radius;
        const dx = t.x - node.x;
        const dy = t.y - node.y;
        if (dx * dx + dy * dy <= hitDist * hitDist) {
          impaled = true;
          break;
        }
      }
      if (impaled) break;
    }
    if (impaled) {
      victims.push(t.index);
    }
  }
  return victims;
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

function doorwayWorldPoint(a: GridCell, b: GridCell, arena: BuiltArenaLayout): { x: number; y: number } {
  const cx = (a.col + b.col) * 0.5 + 0.5;
  const cy = (a.row + b.row) * 0.5 + 0.5;
  return {
    x: arena.originX + cx * arena.cellSize,
    y: arena.originY + cy * arena.cellSize,
  };
}

/**
 * Steers a Homing Missile:
 * - 0..4.0s: pure physical bouncing shell (`seeking: false`).
 * - >= 4.0s: switches to `'slide'` wall behavior, runs exact BFS shortest-path search on `arena.grid`
 *   to ALL living tanks (including the shooter!), dynamically locks onto whichever tank has the
 *   shortest true maze path distance, and steers along string-pulled corridor waypoints.
 */
export function steerHomingMissile(
  proj: ProjectileKinematics,
  tanks: readonly TankKinematics[],
  arena: BuiltArenaLayout,
  dt: number,
): { seeking: boolean; targetIndex: PlayerIndex | null } {
  if (!proj.active || proj.age < POWERUP_CONFIG.homingBallisticSec) {
    return { seeking: false, targetIndex: null };
  }

  proj.bounceBehavior = 'slide';
  proj.graceTimer = 0;

  const livingTanks = tanks.filter((t) => t.alive);
  if (livingTanks.length === 0) {
    return { seeking: true, targetIndex: null };
  }

  const startCell = worldToGridCell(proj.x, proj.y, arena);
  const { cols, rows } = arena.grid;

  const distGrid: number[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => Infinity),
  );
  const parentGrid: Array<Array<GridCell | null>> = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null),
  );

  distGrid[startCell.row][startCell.col] = 0;
  const queue: GridCell[] = [startCell];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const nextDist = distGrid[cur.row][cur.col] + 1;
    for (const nb of getAccessibleNeighbors(arena.grid, cur)) {
      if (distGrid[nb.row][nb.col] === Infinity) {
        distGrid[nb.row][nb.col] = nextDist;
        parentGrid[nb.row][nb.col] = cur;
        queue.push(nb);
      }
    }
  }

  const clearance = proj.radius + 2.2 * arena.scaleRatio;

  let bestTarget: {
    tank: TankKinematics;
    mazeDistance: number;
    waypoints: Array<{ x: number; y: number }>;
  } | null = null;

  for (const t of livingTanks) {
    const tCell = worldToGridCell(t.x, t.y, arena);
    if (!Number.isFinite(distGrid[tCell.row][tCell.col])) continue;

    if (
      (tCell.col === startCell.col && tCell.row === startCell.row) ||
      !hasWallOcclusion(proj.x, proj.y, t.x, t.y, proj.radius, arena.walls)
    ) {
      const directDist = Math.hypot(t.x - proj.x, t.y - proj.y);
      if (!bestTarget || directDist < bestTarget.mazeDistance) {
        bestTarget = {
          tank: t,
          mazeDistance: directDist,
          waypoints: [{ x: t.x, y: t.y }],
        };
      }
      continue;
    }

    // Reconstruct shortest cell chain from startCell -> tCell
    const cells: GridCell[] = [];
    let cursor: GridCell | null = tCell;
    while (cursor) {
      cells.push(cursor);
      cursor = parentGrid[cursor.row][cursor.col];
    }
    cells.reverse();

    const waypoints: Array<{ x: number; y: number }> = [];
    for (let i = 1; i < cells.length; i++) {
      waypoints.push(doorwayWorldPoint(cells[i - 1], cells[i], arena));
      if (i < cells.length - 1) {
        waypoints.push({
          x: arena.originX + (cells[i].col + 0.5) * arena.cellSize,
          y: arena.originY + (cells[i].row + 0.5) * arena.cellSize,
        });
      }
    }
    waypoints.push({ x: t.x, y: t.y });

    let totalMazeDist = 0;
    let prevX = proj.x;
    let prevY = proj.y;
    for (const wp of waypoints) {
      totalMazeDist += Math.hypot(wp.x - prevX, wp.y - prevY);
      prevX = wp.x;
      prevY = wp.y;
    }

    if (!bestTarget || totalMazeDist < bestTarget.mazeDistance) {
      bestTarget = {
        tank: t,
        mazeDistance: totalMazeDist,
        waypoints,
      };
    }
  }

  if (!bestTarget) {
    return { seeking: true, targetIndex: null };
  }

  // Funnel / Line-of-Sight string-pulling: aim at the furthest unobstructed waypoint along the shortest path
  let aimPoint = bestTarget.waypoints[0];
  for (let i = bestTarget.waypoints.length - 1; i >= 0; i--) {
    const wp = bestTarget.waypoints[i];
    if (!hasWallOcclusion(proj.x, proj.y, wp.x, wp.y, clearance, arena.walls)) {
      aimPoint = wp;
      break;
    }
  }

  const desiredAngle = Math.atan2(aimPoint.y - proj.y, aimPoint.x - proj.x);
  const curAngle = Math.atan2(proj.vy, proj.vx);
  const diff = wrapAngleRad(desiredAngle - curAngle);
  const maxStep = POWERUP_CONFIG.homingTurnRateRad * dt;
  const nextAngle =
    Math.abs(diff) <= maxStep ? desiredAngle : curAngle + Math.sign(diff) * maxStep;

  const seekSpeed =
    BASE_GAMEPLAY.projectileSpeed *
    POWERUP_CONFIG.homingSeekSpeedMultiplier *
    arena.scaleRatio;
  proj.vx = Math.cos(nextAngle) * seekSpeed;
  proj.vy = Math.sin(nextAngle) * seekSpeed;

  return {
    seeking: true,
    targetIndex: bestTarget.tank.index,
  };
}

/**
 * 5. Scatter (`Pháo Chùm Hải Tặc`): 5-pellet fan angles centered around `baseAngle`.
 */
export function computeScatterAngles(baseAngle: number): number[] {
  const count = POWERUP_CONFIG.scatterPelletCount;
  const step = POWERUP_CONFIG.scatterSpreadStepRad;
  const half = (count - 1) / 2;
  const angles: number[] = [];
  for (let i = 0; i < count; i++) {
    angles.push(baseAngle + (i - half) * step);
  }
  return angles;
}

/**
 * 6. Shield (`Khiên Từ Trường`): deflects & hijacks physical projectiles touching a shielded tank!
 */
export function deflectProjectilesAgainstShields(
  projectiles: ProjectileKinematics[],
  tanks: readonly TankKinematics[],
  shieldedIndices: ReadonlySet<PlayerIndex>,
  scaleRatio: number,
): Array<{ x: number; y: number; colorPlayerIndex: PlayerIndex }> {
  const events: Array<{ x: number; y: number; colorPlayerIndex: PlayerIndex }> = [];
  if (shieldedIndices.size === 0) return events;

  for (const t of tanks) {
    if (!t.alive || !shieldedIndices.has(t.index)) continue;
    const shieldR = t.radius * POWERUP_CONFIG.shieldRadiusFactor;

    for (const p of projectiles) {
      if (!p.active) continue;
      // Ignore own fresh unbounced shots exiting the shield dome!
      if (p.ownerIndex === t.index && p.bounces === 0 && p.age < 0.25) continue;

      const dx = p.x - t.x;
      const dy = p.y - t.y;
      const hitDist = shieldR + p.radius;
      const distSq = dx * dx + dy * dy;
      if (distSq <= hitDist * hitDist) {
        if (p.variant === 'flame') {
          p.active = false;
          events.push({ x: p.x, y: p.y, colorPlayerIndex: t.index });
          continue;
        }

        const dist = Math.sqrt(distSq) || 1;
        const nx = dx / dist;
        const ny = dy / dist;
        const curSpeed = Math.hypot(p.vx, p.vy);
        const variantMul =
          p.variant === 'gatling'
            ? POWERUP_CONFIG.gatlingSpeedMultiplier
            : p.variant === 'scatter'
              ? POWERUP_CONFIG.scatterSpeedMultiplier
              : p.variant === 'drill'
                ? POWERUP_CONFIG.drillSpeedMultiplier
                : p.variant === 'spike_shard'
                  ? POWERUP_CONFIG.spikeShrapnelSpeedMultiplier
                  : 1.0;
        const maxBoostedSpeed =
          BASE_GAMEPLAY.projectileSpeed *
          scaleRatio *
          variantMul *
          POWERUP_CONFIG.shieldReflectSpeedBoost;
        const speed = Math.min(maxBoostedSpeed, curSpeed * POWERUP_CONFIG.shieldReflectSpeedBoost);

        // Push outside shield dome, invert/reflect outward, and hijack ownership!
        p.x = t.x + nx * (hitDist + 1.5 * scaleRatio);
        p.y = t.y + ny * (hitDist + 1.5 * scaleRatio);
        p.vx = nx * speed;
        p.vy = ny * speed;
        p.ownerIndex = t.index;
        p.graceTimer = 0.08;
        p.bounces = Math.max(1, p.bounces);
        events.push({ x: p.x, y: p.y, colorPlayerIndex: t.index });
      }
    }
  }

  return events;
}

/**
 * 7. Drill (`Mũi Khoan Địa Chấn`): identifies the closest interior maze wall segment (`hWalls` or `vWalls`)
 * to `(worldX, worldY)`, carves it open (`false`), and rebuilds `arena.walls` in-place!
 * Outer perimeter walls (`r === 0`, `r === rows`, `c === 0`, `c === cols`) are strictly indestructible.
 */
export function drillMazeWallAtPoint(
  arena: BuiltArenaLayout,
  worldX: number,
  worldY: number,
): { carved: boolean; breakX: number; breakY: number } {
  const { grid, originX, originY, cellSize } = arena;
  const { cols, rows } = grid;
  const maxSnapDist = cellSize * 0.55;

  let best: {
    kind: 'h' | 'v';
    r: number;
    c: number;
    dist: number;
    wx: number;
    wy: number;
  } | null = null;

  // Check interior horizontal wall segments (1 <= r <= rows - 1)
  for (let r = 1; r < rows; r++) {
    const wy = originY + r * cellSize;
    if (Math.abs(worldY - wy) > maxSnapDist) continue;
    for (let c = 0; c < cols; c++) {
      if (!grid.hWalls[r][c]) continue;
      const segMinX = originX + c * cellSize;
      const segMaxX = segMinX + cellSize;
      const clampedX = Math.max(segMinX, Math.min(worldX, segMaxX));
      const d = Math.hypot(worldX - clampedX, worldY - wy);
      if (d <= maxSnapDist && (!best || d < best.dist)) {
        best = { kind: 'h', r, c, dist: d, wx: (segMinX + segMaxX) / 2, wy };
      }
    }
  }

  // Check interior vertical wall segments (1 <= c <= cols - 1)
  for (let c = 1; c < cols; c++) {
    const wx = originX + c * cellSize;
    if (Math.abs(worldX - wx) > maxSnapDist) continue;
    for (let r = 0; r < rows; r++) {
      if (!grid.vWalls[r][c]) continue;
      const segMinY = originY + r * cellSize;
      const segMaxY = segMinY + cellSize;
      const clampedY = Math.max(segMinY, Math.min(worldY, segMaxY));
      const d = Math.hypot(worldX - wx, worldY - clampedY);
      if (d <= maxSnapDist && (!best || d < best.dist)) {
        best = { kind: 'v', r, c, dist: d, wx, wy: (segMinY + segMaxY) / 2 };
      }
    }
  }

  if (!best) {
    return { carved: false, breakX: worldX, breakY: worldY };
  }

  if (best.kind === 'h') {
    grid.hWalls[best.r][best.c] = false;
  } else {
    grid.vWalls[best.r][best.c] = false;
  }

  rebuildArenaWalls(arena);
  return { carved: true, breakX: best.wx, breakY: best.wy };
}

/**
 * 8. Mine (`Mìn Bóng Ma`): checks armed mines against tank proximity or bullet hits,
 * resolving chain-reaction blasts across nearby mines!
 */
export function findTriggeredMines(
  mines: readonly ProximityMineState[],
  tanks: readonly TankKinematics[],
  projectiles: ProjectileKinematics[],
): Array<{ mineId: number; x: number; y: number; victimIndices: PlayerIndex[] }> {
  const triggeredIds = new Set<number>();
  const queue: ProximityMineState[] = [];

  for (const m of mines) {
    if (m.age < m.armingSec || m.age >= m.duration) continue;

    let tripped = false;
    for (const t of tanks) {
      if (!t.alive) continue;
      if (Math.hypot(t.x - m.x, t.y - m.y) <= m.triggerRadius + t.radius * 0.45) {
        tripped = true;
        break;
      }
    }

    if (!tripped) {
      for (const p of projectiles) {
        if (!p.active) continue;
        if (Math.hypot(p.x - m.x, p.y - m.y) <= p.radius + m.triggerRadius * 0.52) {
          p.active = false;
          tripped = true;
          break;
        }
      }
    }

    if (tripped) {
      triggeredIds.add(m.id);
      queue.push(m);
    }
  }

  // Chain-reaction propagation to nearby mines
  let head = 0;
  while (head < queue.length) {
    const src = queue[head++];
    for (const other of mines) {
      if (triggeredIds.has(other.id) || other.age >= other.duration) continue;
      if (Math.hypot(other.x - src.x, other.y - src.y) <= src.blastRadius * 1.15) {
        triggeredIds.add(other.id);
        queue.push(other);
      }
    }
  }

  return queue.map((m) => {
    const victimIndices: PlayerIndex[] = [];
    for (const t of tanks) {
      if (!t.alive) continue;
      if (Math.hypot(t.x - m.x, t.y - m.y) <= m.blastRadius + t.radius * 0.55) {
        victimIndices.push(t.index);
      }
    }
    return {
      mineId: m.id,
      x: m.x,
      y: m.y,
      victimIndices,
    };
  });
}

/**
 * 9. Flame (`Hỏa Long Phun Lửa`): realistic pressurized fluid-jet thermodynamics!
 * - Phase 1 (`age < 0.16s`): tight high-velocity laminar nozzle core with low drag.
 * - Phase 2 (`age >= 0.16s`): rapid turbulent air entrainment, vortex curl swirl perpendicular
 *   to the flow vector, and non-linear thermal cone expansion (`startR -> endR`).
 */
export function stepFlameThermodynamics(
  projectiles: ProjectileKinematics[],
  dt: number,
  scaleRatio: number,
): void {
  const startR = POWERUP_CONFIG.flameStartRadius * scaleRatio;
  const endR = POWERUP_CONFIG.flameEndRadius * scaleRatio;

  for (const p of projectiles) {
    if (!p.active || p.variant !== 'flame') continue;
    const frac = Math.min(1, p.age / Math.max(0.05, p.maxLifetime));

    const localDragRate =
      p.age < 0.16
        ? POWERUP_CONFIG.flameDragPerSec * 0.42
        : POWERUP_CONFIG.flameDragPerSec * (0.95 + frac * 0.55);
    const drag = Math.exp(-localDragRate * dt);
    p.vx *= drag;
    p.vy *= drag;

    // Turbulent Kármán-style lateral vortex swirl perpendicular to jet velocity
    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 8 * scaleRatio) {
      const nx = -p.vy / speed;
      const ny = p.vx / speed;
      const phase = p.id * 2.39996;
      const swirl =
        Math.sin(p.age * 16.5 + phase) * (24 + frac * 76) * scaleRatio;
      p.vx += nx * swirl * dt;
      p.vy += ny * swirl * dt;
    }

    p.radius = startR + (endR - startR) * Math.pow(frac, 0.74);
  }
}

export function incinerateProjectilesWithFlames(
  projectiles: ProjectileKinematics[],
): Array<{ x: number; y: number }> {
  const burned: Array<{ x: number; y: number }> = [];
  const flames = projectiles.filter((p) => p.active && p.variant === 'flame');
  if (flames.length === 0) return burned;

  for (const other of projectiles) {
    if (!other.active || other.variant === 'flame') continue;
    for (const fl of flames) {
      if (other.ownerIndex === fl.ownerIndex && other.bounces === 0) continue;
      const hitDist = fl.radius + other.radius;
      const dx = other.x - fl.x;
      const dy = other.y - fl.y;
      if (dx * dx + dy * dy <= hitDist * hitDist) {
        other.active = false;
        burned.push({ x: other.x, y: other.y });
        break;
      }
    }
  }
  return burned;
}

const CRESCENT_CURVE_SAMPLES = [-0.32, -0.1, 0.12, 0.36, 0.62, 0.84, 1.05] as const;

function buildCrescentScytheCurve(
  cx: number,
  cy: number,
  ux: number,
  uy: number,
  vx: number,
  vy: number,
  bladeLength: number,
  crescentScale = 1,
): Array<{ x: number; y: number }> {
  if (crescentScale <= 0.02 || bladeLength <= 1) return [];
  const clampedScale = Math.max(0, Math.min(1.15, crescentScale));
  const crescentSpan = bladeLength * 0.44 * clampedScale;
  return CRESCENT_CURVE_SAMPLES.map((t) => {
    const radial = bladeLength * (0.985 - 0.14 * t * t * clampedScale);
    const lateral = t * crescentSpan;
    return {
      x: cx + ux * radial + vx * lateral,
      y: cy + uy * radial + vy * lateral,
    };
  });
}

function hitsPolyline(
  px: number,
  py: number,
  pts: ReadonlyArray<{ x: number; y: number }>,
  hitRSq: number,
): boolean {
  for (let i = 1; i < pts.length; i++) {
    if (pointToSegmentDistSq(px, py, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= hitRSq) {
      return true;
    }
  }
  return false;
}

/**
 * 10. Reaper (`Lưỡi Hái Tử Thần`): computes the two opposing wall-piercing plasma shafts
 * (`angle` and `angle + PI`) PLUS two curved transverse Crescent Scythe heads (`crescentA`, `crescentB`)
 * scaled by `crescentScale` (`0` while laser shaft is still shooting out to peak; `0..1` while unfurling sideways;
 * `1` during the 180-deg sweep!), returning all rival tanks sliced by the active shaft or crescent blades!
 */
export function computeReaperBlades(
  cx: number,
  cy: number,
  angle: number,
  ownerIndex: PlayerIndex,
  bladeLength: number,
  tanks: readonly TankKinematics[],
  scaleRatio: number,
  crescentScale = 1,
): {
  bladeA: { x0: number; y0: number; x1: number; y1: number };
  bladeB: { x0: number; y0: number; x1: number; y1: number };
  crescentA: Array<{ x: number; y: number }>;
  crescentB: Array<{ x: number; y: number }>;
  hitVictimIndices: PlayerIndex[];
} {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  // Leading perpendicular normal in direction of positive angular spin
  const vx = -uy;
  const vy = ux;

  const dx = ux * bladeLength;
  const dy = uy * bladeLength;

  const bladeA = { x0: cx, y0: cy, x1: cx + dx, y1: cy + dy };
  const bladeB = { x0: cx, y0: cy, x1: cx - dx, y1: cy - dy };
  const crescentA = buildCrescentScytheCurve(cx, cy, ux, uy, vx, vy, bladeLength, crescentScale);
  const crescentB = buildCrescentScytheCurve(cx, cy, -ux, -uy, -vx, -vy, bladeLength, crescentScale);

  const halfW = POWERUP_CONFIG.reaperBladeHalfWidth * scaleRatio;
  const crescentHalfW = halfW * 1.18;
  const hitVictimIndices: PlayerIndex[] = [];

  if (bladeLength > 2) {
    for (const t of tanks) {
      if (!t.alive || t.index === ownerIndex) continue;
      const shaftRSq = (t.radius + halfW) * (t.radius + halfW);
      const crescRSq = (t.radius + crescentHalfW) * (t.radius + crescentHalfW);
      if (
        pointToSegmentDistSq(t.x, t.y, bladeA.x0, bladeA.y0, bladeA.x1, bladeA.y1) <= shaftRSq ||
        pointToSegmentDistSq(t.x, t.y, bladeB.x0, bladeB.y0, bladeB.x1, bladeB.y1) <= shaftRSq ||
        (crescentA.length >= 2 && hitsPolyline(t.x, t.y, crescentA, crescRSq)) ||
        (crescentB.length >= 2 && hitsPolyline(t.x, t.y, crescentB, crescRSq))
      ) {
        hitVictimIndices.push(t.index);
      }
    }
  }

  return { bladeA, bladeB, crescentA, crescentB, hitVictimIndices };
}
