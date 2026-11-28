import { POWERUP_CONFIG } from '../../config/gameplayConfig';
import { resolveTankWallCollisions } from '../../systems/CollisionSystem';
import type { BuiltArenaLayout, TankKinematics, WallRect } from '../../types/gameTypes';
import { worldToGridCell } from '../geometry';
import type { SkillDescriptor, SkillFireContext } from '../types';

export const PHANTOM_SKILL_DESCRIPTOR: SkillDescriptor = {
  id: 'phantom',
  name: 'BÓNG MA XUYÊN TƯỜNG',
  hudShort: 'XUYÊN TƯỜNG',
  suitTitle: 'Giáp Bóng Ma Hư Không',
  weight: 6,
  dropPercent: 6,
  ammo: 1,
  ammoLabel: '3.5 GIÂY HÓA MA',
  accentColor: 0x7e57c2,
  accentHex: '#5E35B1',
  summary: 'Hóa thể bóng ma bán trong suốt 3.5s, tăng 20% tốc chạy và đi xuyên tường mê cung!',
  traits: [
    'Bấm bắn để hóa Bóng Ma 3.5s • Vẫn bắn đạn thường tự do trong lúc xuyên tường!',
    'Tăng +20% tốc độ lướt đi xuyên qua mọi bức tường nội khu mê cung để tập kích sau lưng',
    'Hết 3.5s nếu đang kẹt giữa tường sẽ tự động đẩy mượt ra hành lang gần nhất (đạn vẫn bắn trúng!)',
  ],
};

/**
 * Builds the 4 outer arena border walls so a phased tank glides freely through interior walls
 * while staying strictly inside the arena perimeter.
 */
export function computeArenaPerimeterWalls(arena: BuiltArenaLayout): WallRect[] {
  const { originX, originY, width, height, wallThickness } = arena;
  const ht = wallThickness / 2;
  return [
    {
      x: originX,
      y: originY - ht,
      width,
      height: wallThickness,
      minX: originX,
      minY: originY - ht,
      maxX: originX + width,
      maxY: originY + ht,
    },
    {
      x: originX,
      y: originY + height - ht,
      width,
      height: wallThickness,
      minX: originX,
      minY: originY + height - ht,
      maxX: originX + width,
      maxY: originY + height + ht,
    },
    {
      x: originX - ht,
      y: originY,
      width: wallThickness,
      height,
      minX: originX - ht,
      minY: originY,
      maxX: originX + ht,
      maxY: originY + height,
    },
    {
      x: originX + width - ht,
      y: originY,
      width: wallThickness,
      height,
      minX: originX + width - ht,
      minY: originY,
      maxX: originX + width + ht,
      maxY: originY + height,
    },
  ];
}

function tankOverlapsAnyWall(tank: TankKinematics, walls: readonly WallRect[]): boolean {
  const rSq = (tank.radius - 0.25) * (tank.radius - 0.25);
  for (const w of walls) {
    const cx = Math.max(w.minX, Math.min(tank.x, w.maxX));
    const cy = Math.max(w.minY, Math.min(tank.y, w.maxY));
    const dx = tank.x - cx;
    const dy = tank.y - cy;
    if (dx * dx + dy * dy < rSq) return true;
  }
  return false;
}

/**
 * Smoothly ejects a tank out of any interior maze wall when Phantom Phase expires mid-wall.
 */
export function ejectTankFromInteriorWalls(
  tank: TankKinematics,
  arena: BuiltArenaLayout,
): boolean {
  if (!tank.alive) return false;
  if (!tankOverlapsAnyWall(tank, arena.walls)) return false;

  for (let pass = 0; pass < 4; pass++) {
    resolveTankWallCollisions(tank, arena.walls);
    if (!tankOverlapsAnyWall(tank, arena.walls)) {
      return true;
    }
  }

  const cell = worldToGridCell(tank.x, tank.y, arena);
  tank.x = arena.originX + (cell.col + 0.5) * arena.cellSize;
  tank.y = arena.originY + (cell.row + 0.5) * arena.cellSize;
  resolveTankWallCollisions(tank, arena.walls);
  return true;
}

export function firePhantomSkill(ctx: SkillFireContext): { fired: boolean; hudDirty: boolean } {
  const { tank, consumeBufferedPress, effectsSystem, audioManager, emitNetEvent } = ctx;
  if (!consumeBufferedPress()) return { fired: false, hudDirty: false };

  tank.activatePhantom(POWERUP_CONFIG.phantomDurationSec);
  audioManager.playPhantomActivate();
  effectsSystem.emitPhantomActivate(tank.kinematics.x, tank.kinematics.y);
  emitNetEvent({
    kind: 'hazard_fx',
    sub: 'phantom_activate',
    x: tank.kinematics.x,
    y: tank.kinematics.y,
  });
  return { fired: true, hudDirty: true };
}
