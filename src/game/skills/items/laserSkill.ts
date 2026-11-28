import { POWERUP_CONFIG } from '../../config/gameplayConfig';
import type { BuiltArenaLayout, PlayerIndex, TankKinematics } from '../../types/gameTypes';
import { clipSegmentExitToBox, pointToSegmentDistSq } from '../geometry';
import type { SkillDescriptor, SkillFireContext } from '../types';

export const LASER_SKILL_DESCRIPTOR: SkillDescriptor = {
  id: 'laser',
  name: 'LASER SIÊU CẤP',
  hudShort: 'LASER',
  suitTitle: 'Giáp Quang Năng Tối Thượng',
  weight: 2,
  dropPercent: 2,
  ammo: 1,
  ammoLabel: '1 TIA XUYÊN MAP',
  accentColor: 0x0091ea,
  accentHex: '#0091EA',
  summary: 'Tụ lực 2s bắn tia laser xanh dương xuyên toàn bộ tường mê cung.',
  traits: [
    'Tụ lực 2s trước khi khai hỏa (trong lúc tụ lực KHÔNG THỂ di chuyển & xoay)',
    'Tia laser xanh dương chiếu xuyên thấu toàn bộ bản đồ bất chấp tường chắn',
    'Đối thủ nằm trong góc ±15° trước nòng sẽ hút tia uốn cong parabol trúng đích!',
  ],
};

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

  let lockedTarget: { index: PlayerIndex; localX: number; localY: number; dist: number } | null =
    null;

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

export function fireLaserSkill(ctx: SkillFireContext): { fired: boolean; hudDirty: boolean } {
  const { tank, consumeBufferedPress, audioManager } = ctx;
  if (!consumeBufferedPress()) return { fired: false, hudDirty: false };

  tank.startLaserCharge(POWERUP_CONFIG.laserChargeSec);
  audioManager.playLaserCharge(POWERUP_CONFIG.laserChargeSec);
  return { fired: true, hudDirty: true };
}
