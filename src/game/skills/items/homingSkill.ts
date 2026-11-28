import { BASE_GAMEPLAY, POWERUP_CONFIG } from '../../config/gameplayConfig';
import { computeSafeMuzzleSpawn } from '../../systems/CollisionSystem';
import { getAccessibleNeighbors } from '../../systems/MazeSystem';
import type {
  BuiltArenaLayout,
  GridCell,
  PlayerIndex,
  ProjectileKinematics,
  TankKinematics,
} from '../../types/gameTypes';
import {
  doorwayWorldPoint,
  hasWallOcclusion,
  worldToGridCell,
  wrapAngleRad,
} from '../geometry';
import type { SkillDescriptor, SkillFireContext } from '../types';

export const HOMING_SKILL_DESCRIPTOR: SkillDescriptor = {
  id: 'homing',
  name: 'ĐẠN ĐỊNH VỊ',
  hudShort: 'ĐỊNH VỊ',
  suitTitle: 'Giáp Chiến Cơ Tầm Nhiệt',
  weight: 5,
  dropPercent: 5,
  ammo: 1,
  ammoLabel: '1 TÊN LỬA',
  accentColor: 0xe53935,
  accentHex: '#E53935',
  summary: 'Tên lửa nảy tường 2.5s đầu rồi bật radar tìm đường ngắn nhất qua mê cung.',
  traits: [
    '2.5s đầu bay đằm & nảy tường vượt góc khuất • Sau 2.5s bật động cơ dò tìm',
    'Tự luồn lách theo đường ngắn nhất mê cung tới xe gần nhất (KỂ CẢ NGƯỜI BẮN!)',
    'Tự động đổi mục tiêu ngay lập tức nếu có xe khác tiến lại gần hơn',
  ],
};

/**
 * Steers a Homing Missile:
 * - 0..2.5s (`POWERUP_CONFIG.homingBallisticSec`): pure physical bouncing shell (`seeking: false`).
 * - >= 2.5s: switches to `'slide'` wall behavior, runs exact BFS shortest-path search on `arena.grid`
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
    BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.homingSeekSpeedMultiplier * arena.scaleRatio;
  proj.vx = Math.cos(nextAngle) * seekSpeed;
  proj.vy = Math.sin(nextAngle) * seekSpeed;

  return {
    seeking: true,
    targetIndex: bestTarget.tank.index,
  };
}

export function fireHomingSkill(ctx: SkillFireContext): { fired: boolean; hudDirty: boolean } {
  const { tank, walls, scale, consumeBufferedPress, projectileSystem, effectsSystem, audioManager } =
    ctx;
  if (!consumeBufferedPress()) return { fired: false, hudDirty: false };

  const radius = BASE_GAMEPLAY.projectileRadius * POWERUP_CONFIG.homingRadiusMultiplier * scale;
  const speed =
    BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.homingBallisticSpeedMultiplier * scale;
  const spawn = computeSafeMuzzleSpawn(
    tank.kinematics.x,
    tank.kinematics.y,
    tank.kinematics.angle,
    tank.getBarrelLength(),
    radius,
    speed,
    walls,
  );

  const proj = projectileSystem.spawnCustomProjectile({
    ownerIndex: tank.index,
    x: spawn.x,
    y: spawn.y,
    vx: spawn.vx,
    vy: spawn.vy,
    radius,
    maxLifetime: POWERUP_CONFIG.homingTotalLifetimeSec,
    maxBounces: 24,
    graceTimer: spawn.immediateBounce ? 0 : BASE_GAMEPLAY.selfHitGraceSec,
    variant: 'homing_missile',
    bounceBehavior: 'reflect',
  });
  if (!proj) return { fired: false, hudDirty: false };

  tank.triggerFireVisual();
  tank.consumeSkillAmmo(1);
  effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
  audioManager.playFire();
  effectsSystem.emitMuzzleFlash(spawn.x, spawn.y, tank.kinematics.angle);
  return { fired: true, hudDirty: true };
}
