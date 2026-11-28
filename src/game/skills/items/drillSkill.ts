import { BASE_GAMEPLAY, POWERUP_CONFIG } from '../../config/gameplayConfig';
import { rebuildArenaWalls } from '../../maps/MazeBuilder';
import type { BuiltArenaLayout } from '../../types/gameTypes';
import type { SkillDescriptor, SkillFireContext } from '../types';

export const DRILL_SKILL_DESCRIPTOR: SkillDescriptor = {
  id: 'drill',
  name: 'MŨI KHOAN ĐỊA CHẤN',
  hudShort: 'MŨI KHOAN',
  suitTitle: 'Giáp Khoan Phá Địa Chấn',
  weight: 7,
  dropPercent: 7,
  ammo: POWERUP_CONFIG.drillAmmo,
  ammoLabel: '2 MŨI KHOAN',
  accentColor: 0xf9a825,
  accentHex: '#F57F17',
  summary: 'Đạn mũi khoan xoay siêu tốc đục thủng các bức tường ngăn mê cung.',
  traits: [
    '2 mũi khoan hạng nặng • Mỗi mũi ĐỤC THỦNG tối đa 4 bức tường nội khu!',
    'Mở thông đường tắt mới ngay lập tức (giữ nguyên tường bao viền ngoài)',
    'Xuyên tường đánh úp bất ngờ các mục tiêu đang cố thủ trong góc kín',
  ],
};

/**
 * Identifies the closest interior maze wall segment (`hWalls` or `vWalls`)
 * to `(worldX, worldY)`, carves it open (`false`), and rebuilds `arena.walls` in-place.
 * Outer perimeter walls (`r === 0`, `r === rows`, `c === 0`, `c === cols`) are indestructible.
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

export function fireDrillSkill(ctx: SkillFireContext): { fired: boolean; hudDirty: boolean } {
  const { tank, scale, consumeBufferedPress, projectileSystem, effectsSystem, audioManager } = ctx;
  if (!consumeBufferedPress()) return { fired: false, hudDirty: false };

  const radius = BASE_GAMEPLAY.projectileRadius * POWERUP_CONFIG.drillRadiusMultiplier * scale;
  const speed = BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.drillSpeedMultiplier * scale;
  const baseX =
    tank.kinematics.x + Math.cos(tank.kinematics.angle) * (tank.getBarrelLength() * 0.85);
  const baseY =
    tank.kinematics.y + Math.sin(tank.kinematics.angle) * (tank.getBarrelLength() * 0.85);

  const proj = projectileSystem.spawnCustomProjectile({
    ownerIndex: tank.index,
    x: baseX,
    y: baseY,
    vx: Math.cos(tank.kinematics.angle) * speed,
    vy: Math.sin(tank.kinematics.angle) * speed,
    radius,
    maxLifetime: POWERUP_CONFIG.drillLifetimeSec,
    maxBounces: 20,
    graceTimer: BASE_GAMEPLAY.selfHitGraceSec,
    variant: 'drill',
    bounceBehavior: 'drill',
    drillsLeft: POWERUP_CONFIG.drillWallsPerShot,
  });
  if (!proj) return { fired: false, hudDirty: false };

  tank.triggerFireVisual(POWERUP_CONFIG.drillCooldownSec);
  audioManager.playWallDrill();
  effectsSystem.emitMuzzleFlash(baseX, baseY, tank.kinematics.angle);

  const { depleted } = tank.consumeSkillAmmo(1);
  if (depleted) {
    effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
  }
  return { fired: true, hudDirty: true };
}
