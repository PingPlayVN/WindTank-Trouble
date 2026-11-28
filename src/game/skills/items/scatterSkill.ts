import { BASE_GAMEPLAY, POWERUP_CONFIG } from '../../config/gameplayConfig';
import { computeSafeMuzzleSpawn } from '../../systems/CollisionSystem';
import type { SkillDescriptor, SkillFireContext } from '../types';

export const SCATTER_SKILL_DESCRIPTOR: SkillDescriptor = {
  id: 'scatter',
  name: 'PHÁO CHÙM HẢI TẶC',
  hudShort: 'PHÁO CHÙM',
  suitTitle: 'Giáp Hải Tặc Pháo Chùm',
  weight: 11,
  dropPercent: 11,
  ammo: POWERUP_CONFIG.scatterAmmo,
  ammoLabel: '3 LOẠT × 5 VIÊN',
  accentColor: 0x2979ff,
  accentHex: '#2979FF',
  summary: 'Khai hỏa chùm 5 viên đạn quạt cực rát, phủ kín các khúc cua hẹp.',
  traits: [
    '3 loạt bắn • Mỗi phát tung ra 5 viên đạn chùm góc quạt ±18°',
    'Đạn bay nhanh hơn 16%, nảy tường liên hoàn kèm lực giật lùi chiến thuật',
    'Khắc chế cực mạnh các pha đối đầu trực diện hoặc rải đạn ngã tư',
  ],
};

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

export function fireScatterSkill(ctx: SkillFireContext): { fired: boolean; hudDirty: boolean } {
  const { tank, walls, scale, consumeBufferedPress, projectileSystem, effectsSystem, audioManager } =
    ctx;
  if (!consumeBufferedPress()) return { fired: false, hudDirty: false };

  const radius = BASE_GAMEPLAY.projectileRadius * POWERUP_CONFIG.scatterRadiusMultiplier * scale;
  const speed = BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.scatterSpeedMultiplier * scale;
  const angles = computeScatterAngles(tank.kinematics.angle);

  let muzzleX = tank.kinematics.x;
  let muzzleY = tank.kinematics.y;
  for (const ang of angles) {
    const spawn = computeSafeMuzzleSpawn(
      tank.kinematics.x,
      tank.kinematics.y,
      ang,
      tank.getBarrelLength(),
      radius,
      speed,
      walls,
    );
    muzzleX = spawn.x;
    muzzleY = spawn.y;
    projectileSystem.spawnCustomProjectile({
      ownerIndex: tank.index,
      x: spawn.x,
      y: spawn.y,
      vx: spawn.vx,
      vy: spawn.vy,
      radius,
      maxLifetime: POWERUP_CONFIG.scatterLifetimeSec,
      maxBounces: POWERUP_CONFIG.scatterMaxBounces,
      graceTimer: spawn.immediateBounce ? 0 : BASE_GAMEPLAY.selfHitGraceSec,
      variant: 'scatter',
      bounceBehavior: 'reflect',
    });
  }

  tank.triggerFireVisual(POWERUP_CONFIG.scatterCooldownSec);
  tank.applyRecoilImpulse(POWERUP_CONFIG.scatterRecoilImpulse * scale);
  audioManager.playScatterShot();
  effectsSystem.emitScatterMuzzle(muzzleX, muzzleY, tank.kinematics.angle);

  const { depleted } = tank.consumeSkillAmmo(1);
  if (depleted) {
    effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
  }
  return { fired: true, hudDirty: true };
}
