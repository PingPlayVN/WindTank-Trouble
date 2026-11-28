import { BASE_GAMEPLAY, POWERUP_CONFIG } from '../../config/gameplayConfig';
import type {
  PlayerIndex,
  ProjectileKinematics,
  TankKinematics,
  WallRect,
} from '../../types/gameTypes';
import { hasWallOcclusion, pointToSegmentDistSq, wrapAngleRad } from '../geometry';
import type {
  EnergyBarrierState,
  ProximityMineState,
  SkillDescriptor,
  SkillFireContext,
} from '../types';

export const EMP_SKILL_DESCRIPTOR: SkillDescriptor = {
  id: 'emp',
  name: 'BÃO XUNG ĐIỆN TỪ',
  hudShort: 'XUNG ĐIỆN',
  suitTitle: 'Giáp Lôi Thần Bão Từ',
  weight: 7,
  dropPercent: 7,
  ammo: POWERUP_CONFIG.empAmmo,
  ammoLabel: '2 LẦN PHÁT XUNG',
  accentColor: 0x651fff,
  accentHex: '#6200EA',
  summary:
    'Phát 2 đợt sóng điện từ 360° từ thân xe: đảo cực cướp đạn địch, giật sét cận chiến & gây chập mạch đảo lái!',
  traits: [
    '2 lần phát xung 360° quanh xe (3.05 ô) • ĐẢO CỰC & CƯỚP QUYỀN mọi đạn địch đang bay, dội ngược lại (+32% tốc)!',
    'Phóng Tia Sét Cao Thế hạ gục mục tiêu áp sát (1.5 ô) & phá sập Khiên, Tường Chắn, Mìn, tụ Laser/Lưỡi Hái',
    'Làm địch CHẬP MẠCH 2.5s xuyên tường: Đảo ngược tay lái Trái ↔ Phải & ép súng tự cướp cò bắn loạn!',
  ],
};

export function computeEmpBlastImpact(
  cx: number,
  cy: number,
  blastRadius: number,
  ownerIndex: PlayerIndex,
  tanks: readonly TankKinematics[],
  mines: readonly ProximityMineState[],
  barriers: readonly EnergyBarrierState[],
  zapRadius = 0,
  walls: readonly WallRect[] = [],
): {
  hitEnemyIndices: PlayerIndex[];
  zappedEnemyIndices: PlayerIndex[];
  clearedMineIds: number[];
  clearedBarrierIds: number[];
} {
  const hitEnemyIndices: PlayerIndex[] = [];
  const zappedEnemyIndices: PlayerIndex[] = [];
  for (const t of tanks) {
    if (!t.alive || t.index === ownerIndex) continue;
    const d = Math.hypot(t.x - cx, t.y - cy);
    if (d <= blastRadius + t.radius * 0.7) {
      hitEnemyIndices.push(t.index);
      if (
        zapRadius > 0 &&
        d <= zapRadius + t.radius * 0.6 &&
        !hasWallOcclusion(cx, cy, t.x, t.y, 3.2, walls)
      ) {
        zappedEnemyIndices.push(t.index);
      }
    }
  }

  const clearedMineIds: number[] = [];
  for (const m of mines) {
    if (m.age >= m.duration) continue;
    if (Math.hypot(m.x - cx, m.y - cy) <= blastRadius + m.triggerRadius * 0.4) {
      clearedMineIds.push(m.id);
    }
  }

  const blastRSq = blastRadius * blastRadius;
  const clearedBarrierIds: number[] = [];
  for (const b of barriers) {
    if (b.age >= b.duration) continue;
    if (pointToSegmentDistSq(cx, cy, b.x0, b.y0, b.x1, b.y1) <= blastRSq) {
      clearedBarrierIds.push(b.id);
    }
  }

  return { hitEnemyIndices, zappedEnemyIndices, clearedMineIds, clearedBarrierIds };
}

export function repelProjectilesWithEmpPulse(
  cx: number,
  cy: number,
  blastRadius: number,
  ownerIndex: PlayerIndex,
  projectiles: ProjectileKinematics[],
  tanks: readonly TankKinematics[],
  walls: readonly WallRect[],
  scaleRatio: number,
): Array<{ x: number; y: number }> {
  const hijackedCoords: Array<{ x: number; y: number }> = [];
  const blastRSq = blastRadius * blastRadius;
  const enemies = tanks.filter((t) => t.alive && t.index !== ownerIndex);

  for (const p of projectiles) {
    if (!p.active || p.ownerIndex === ownerIndex || p.variant === 'flame') continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const dSq = dx * dx + dy * dy;
    if (dSq > blastRSq) continue;

    let outAngle = Math.atan2(dy, dx);

    let bestTargetAng: number | null = null;
    let bestEnemyDist = Infinity;
    for (const e of enemies) {
      const ed = Math.hypot(e.x - p.x, e.y - p.y);
      if (ed < bestEnemyDist && !hasWallOcclusion(p.x, p.y, e.x, e.y, p.radius, walls)) {
        const angToE = Math.atan2(e.y - p.y, e.x - p.x);
        if (Math.abs(wrapAngleRad(angToE - outAngle)) <= 0.96) {
          bestEnemyDist = ed;
          bestTargetAng = angToE;
        }
      }
    }
    if (bestTargetAng !== null) {
      outAngle = bestTargetAng;
    }

    const baseSpeed = Math.max(
      Math.hypot(p.vx, p.vy),
      BASE_GAMEPLAY.projectileSpeed * scaleRatio * 0.95,
    );
    const maxCap = BASE_GAMEPLAY.projectileSpeed * scaleRatio * 1.55;
    const boosted = Math.min(maxCap, baseSpeed * POWERUP_CONFIG.empBulletReflectSpeedBoost);

    p.vx = Math.cos(outAngle) * boosted;
    p.vy = Math.sin(outAngle) * boosted;
    p.ownerIndex = ownerIndex;
    p.graceTimer = 0.08;
    p.bounces = Math.max(1, p.bounces);
    hijackedCoords.push({ x: p.x, y: p.y });
  }

  return hijackedCoords;
}

export function fireEmpSkill(ctx: SkillFireContext): { fired: boolean; hudDirty: boolean } {
  const { tank, consumeBufferedPress, effectsSystem, queueEmpBlast } = ctx;
  if (!consumeBufferedPress()) return { fired: false, hudDirty: false };

  tank.triggerFireVisual(POWERUP_CONFIG.empCooldownSec);
  const { depleted } = tank.consumeSkillAmmo(1);
  if (depleted) {
    effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
  }
  queueEmpBlast(tank.kinematics.x, tank.kinematics.y, tank.index);
  return { fired: true, hudDirty: true };
}
