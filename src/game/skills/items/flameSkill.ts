import { BASE_GAMEPLAY, POWERUP_CONFIG } from '../../config/gameplayConfig';
import { computeSafeMuzzleSpawn } from '../../systems/CollisionSystem';
import type { ProjectileKinematics } from '../../types/gameTypes';
import type { SkillDescriptor, SkillFireContext } from '../types';

export const FLAME_SKILL_DESCRIPTOR: SkillDescriptor = {
  id: 'flame',
  name: 'HỎA LONG PHUN LỬA',
  hudShort: 'PHUN LỬA',
  suitTitle: 'Giáp Hỏa Long Nhiệt Hạch',
  weight: 8,
  dropPercent: 8,
  ammo: POWERUP_CONFIG.flameAmmo,
  ammoLabel: '80 LUỒNG LỬA DÀY',
  accentColor: 0xff3d00,
  accentHex: '#FF3D00',
  summary: 'Phun bão lửa dày đặc tầm cực xa dọc hành lang, đốt cháy cả xe địch lẫn đạn bay tới.',
  traits: [
    'Bình nhiên liệu 80 nhịp phun kép siêu dày, vươn xa xuyên suốt cả dãy hành lang dài!',
    'ĐỐT CHÁY & TIÊU HỦY toàn bộ đạn vật lý bay ngược chiều vào biển lửa',
    'Trượt ôm theo góc tường mê cung kèm tàn lửa & khói nhiệt hạch rực cháy',
  ],
};

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

    const speed = Math.hypot(p.vx, p.vy);
    if (speed > 8 * scaleRatio) {
      const nx = -p.vy / speed;
      const ny = p.vx / speed;
      const phase = p.id * 2.39996;
      const swirl = Math.sin(p.age * 16.5 + phase) * (24 + frac * 76) * scaleRatio;
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

export function fireFlameSkill(ctx: SkillFireContext): { fired: boolean; hudDirty: boolean } {
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
    emitNetEvent,
  } = ctx;

  const triggered = consumeBufferedPress() || isHeldFire;
  if (!triggered) return { fired: false, hudDirty: false };

  const startR = POWERUP_CONFIG.flameStartRadius * scale;
  let spawnedAny = false;
  let muzzleX = tank.kinematics.x;
  let muzzleY = tank.kinematics.y;

  for (let layer = 0; layer < 3; layer++) {
    const isCore = layer === 0;
    const speedMul = isCore ? 1.07 : 0.82 + rng.nextFloat() * 0.24;
    const speed =
      BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.flameSpeedMultiplier * scale * speedMul;
    const spreadScale = isCore ? 0.38 : 1.18;
    const spread = (rng.nextFloat() - 0.5) * 2 * POWERUP_CONFIG.flameSpreadRad * spreadScale;
    const fireAngle = tank.kinematics.angle + spread;

    const spawn = computeSafeMuzzleSpawn(
      tank.kinematics.x,
      tank.kinematics.y,
      fireAngle,
      tank.getBarrelLength() * 0.92,
      startR,
      speed,
      walls,
    );
    muzzleX = spawn.x;
    muzzleY = spawn.y;

    const proj = projectileSystem.spawnCustomProjectile({
      ownerIndex: tank.index,
      x: spawn.x,
      y: spawn.y,
      vx: spawn.vx + tank.kinematics.vx * 0.42,
      vy: spawn.vy + tank.kinematics.vy * 0.42,
      radius: startR * (isCore ? 0.88 : 1.14),
      maxLifetime: POWERUP_CONFIG.flameLifetimeSec * (isCore ? 1.02 : 0.84 + layer * 0.06),
      maxBounces: 5,
      graceTimer: 0.28,
      variant: 'flame',
      bounceBehavior: 'slide',
    });
    if (proj) spawnedAny = true;
  }

  if (!spawnedAny) return { fired: false, hudDirty: false };

  tank.triggerFireVisual(POWERUP_CONFIG.flameCooldownSec);
  tank.applyRecoilImpulse(3.2 * scale);
  audioManager.playFlameSpray();
  effectsSystem.emitFlameMuzzle(muzzleX, muzzleY, tank.kinematics.angle);
  emitNetEvent({
    kind: 'muzzle_fx',
    variant: 'flame',
    x: muzzleX,
    y: muzzleY,
    angle: tank.kinematics.angle,
  });

  const { depleted } = tank.consumeSkillAmmo(1);
  if (depleted) {
    effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
  }
  return { fired: true, hudDirty: true };
}
