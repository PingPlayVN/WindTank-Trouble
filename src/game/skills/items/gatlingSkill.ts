import { BASE_GAMEPLAY, POWERUP_CONFIG } from '../../config/gameplayConfig';
import { computeSafeMuzzleSpawn } from '../../systems/CollisionSystem';
import type { SkillDescriptor, SkillFireContext } from '../types';

export const GATLING_SKILL_DESCRIPTOR: SkillDescriptor = {
  id: 'gatling',
  name: 'ĐẠN LIÊN THANH',
  hudShort: 'LIÊN THANH',
  suitTitle: 'Giáp Chiến Binh Bão Đạn',
  weight: 10,
  dropPercent: 10,
  ammo: POWERUP_CONFIG.gatlingAmmo,
  ammoLabel: '20 VIÊN',
  accentColor: 0xfb8c00,
  accentHex: '#FB8C00',
  summary: 'Băng đạn 20 viên tốc độ cao kèm lực giật lùi nòng cực phấn khích.',
  traits: [
    '20 viên đạn vật lý nhỏ gọn • Nảy tường như đạn thường',
    'Tốc độ bay +36%, xả đạn liên thanh cực gắt kèm độ giật lùi thân xe & rung nòng!',
    'Hết 20 viên tự động quay về giáp và đạn mặc định',
  ],
};

export function fireGatlingSkill(ctx: SkillFireContext): { fired: boolean; hudDirty: boolean } {
  const {
    tank,
    walls,
    scale,
    rng,
    isHeldFire,
    consumeBufferedPress,
    projectileSystem,
    effectsSystem,
    audioManager,
  } = ctx;

  const triggered = consumeBufferedPress() || isHeldFire;
  if (!triggered) return { fired: false, hudDirty: false };

  const radius = BASE_GAMEPLAY.projectileRadius * POWERUP_CONFIG.gatlingRadiusMultiplier * scale;
  const speed = BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.gatlingSpeedMultiplier * scale;
  const bloom = (rng.nextFloat() - 0.5) * 2 * POWERUP_CONFIG.gatlingSpreadRad;
  const shotAngle = tank.kinematics.angle + bloom;
  const spawn = computeSafeMuzzleSpawn(
    tank.kinematics.x,
    tank.kinematics.y,
    shotAngle,
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
    maxLifetime: POWERUP_CONFIG.gatlingLifetimeSec,
    maxBounces: POWERUP_CONFIG.gatlingMaxBounces,
    graceTimer: spawn.immediateBounce ? 0 : BASE_GAMEPLAY.selfHitGraceSec * 0.75,
    variant: 'gatling',
    bounceBehavior: 'reflect',
  });
  if (!proj) return { fired: false, hudDirty: false };

  tank.triggerFireVisual(POWERUP_CONFIG.gatlingCooldownSec);
  tank.applyRecoilImpulse(POWERUP_CONFIG.gatlingRecoilImpulse * scale);
  audioManager.playGatlingFire();
  effectsSystem.emitGatlingMuzzle(spawn.x, spawn.y, shotAngle);
  if (spawn.immediateBounce) {
    audioManager.playWallBounce(1);
    effectsSystem.emitWallBounce(spawn.x, spawn.y);
  }

  const { depleted } = tank.consumeSkillAmmo(1);
  if (depleted) {
    effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
  }
  return { fired: true, hudDirty: true };
}
