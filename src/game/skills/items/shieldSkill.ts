import { BASE_GAMEPLAY, POWERUP_CONFIG } from '../../config/gameplayConfig';
import type {
  PlayerIndex,
  ProjectileKinematics,
  TankKinematics,
} from '../../types/gameTypes';
import type { SkillDescriptor, SkillFireContext } from '../types';

export const SHIELD_SKILL_DESCRIPTOR: SkillDescriptor = {
  id: 'shield',
  name: 'KHIÊN TỪ TRƯỜNG',
  hudShort: 'KHIÊN HỘ THỂ',
  suitTitle: 'Giáp Hộ Vệ Từ Trường',
  weight: 6,
  dropPercent: 6,
  ammo: 1,
  ammoLabel: '5.5 GIÂY HỘ THỂ',
  accentColor: 0x00bfa5,
  accentHex: '#00897B',
  summary: 'Bật vòm từ trường 5.5s phản ngược đạn địch và chặn đứng Laser/Mìn/Gai.',
  traits: [
    'Bấm bắn để bật Khiên Từ Trường trong 5.5s (vẫn bắn đạn thường tự do!)',
    'PHẢN NGƯỢC & CƯỚP QUYỀN SỞ HỮU mọi viên đạn lao vào vòm khiên!',
    'Miễn nhiễm hoàn toàn tia Laser, Lưỡi Hái, Mìn Bóng Ma và bẫy Gai Sắt',
  ],
};

/**
 * Deflects & hijacks physical projectiles touching a shielded tank (incinerating flame tongues).
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

export function fireShieldSkill(ctx: SkillFireContext): { fired: boolean; hudDirty: boolean } {
  const { tank, consumeBufferedPress, effectsSystem, audioManager } = ctx;
  if (!consumeBufferedPress()) return { fired: false, hudDirty: false };

  tank.activateShield(POWERUP_CONFIG.shieldDurationSec);
  audioManager.playShieldActivate();
  effectsSystem.emitShieldActivate(tank.kinematics.x, tank.kinematics.y);
  return { fired: true, hudDirty: true };
}
