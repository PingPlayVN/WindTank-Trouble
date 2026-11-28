import { BASE_GAMEPLAY, POWERUP_CONFIG } from '../../config/gameplayConfig';
import { computeSafeMuzzleSpawn } from '../../systems/CollisionSystem';
import type { PlayerIndex, TankKinematics } from '../../types/gameTypes';
import type { CryoZoneState, SkillDescriptor, SkillFireContext } from '../types';

export const CRYO_SKILL_DESCRIPTOR: SkillDescriptor = {
  id: 'cryo',
  name: 'PHÁO ĐÓNG BĂNG',
  hudShort: 'HÀN BĂNG',
  suitTitle: 'Giáp Bắc Cực Hàn Băng',
  weight: 8,
  dropPercent: 8,
  ammo: POWERUP_CONFIG.cryoAmmo,
  ammoLabel: '2 CẦU BĂNG',
  accentColor: 0x00acc1,
  accentHex: '#00838F',
  summary:
    'Cầu băng tác dụng CẢ CHỦ LẪN ĐỊCH: dính trực tiếp hóa tảng băng, vào vùng băng chậm gấp 2 & ở lâu sẽ đóng băng!',
  traits: [
    '2 cầu băng nảy tường (tác dụng cả chủ!) • Trúng trực tiếp hoặc đứng ngay tâm nổ sẽ ĐÓNG BĂNG KHỐI ngay lập tức',
    'Đi vào vùng băng bị LÀM CHẬM GẤP 2 LẦN (50% tốc độ) kèm vòng tích tụ hàn khí quanh xe',
    'Ở lì trong vùng băng quá 1.25s không thoát ra kịp sẽ bị khóa cứng trong Tảng Băng Tinh Thể 1.85s!',
  ],
};

export function findTanksInCryoZones(
  zones: readonly CryoZoneState[],
  tanks: readonly TankKinematics[],
): Set<PlayerIndex> {
  const affected = new Set<PlayerIndex>();
  for (const t of tanks) {
    if (!t.alive) continue;
    for (const z of zones) {
      if (z.age >= z.duration) continue;
      if (Math.hypot(t.x - z.x, t.y - z.y) <= z.radius + t.radius * 0.45) {
        affected.add(t.index);
        break;
      }
    }
  }
  return affected;
}

export function findDirectCryoBurstVictims(
  cx: number,
  cy: number,
  zoneRadius: number,
  ownerIndex: PlayerIndex,
  allowOwnerHit: boolean,
  tanks: readonly TankKinematics[],
): PlayerIndex[] {
  const victims: PlayerIndex[] = [];
  for (const t of tanks) {
    if (!t.alive) continue;
    if (t.index === ownerIndex && !allowOwnerHit) continue;
    if (Math.hypot(t.x - cx, t.y - cy) <= zoneRadius * 0.88 + t.radius * 0.45) {
      victims.push(t.index);
    }
  }
  return victims;
}

export function fireCryoSkill(ctx: SkillFireContext): { fired: boolean; hudDirty: boolean } {
  const {
    tank,
    walls,
    scale,
    consumeBufferedPress,
    projectileSystem,
    effectsSystem,
    audioManager,
    emitNetEvent,
  } = ctx;
  if (!consumeBufferedPress()) return { fired: false, hudDirty: false };

  const radius = BASE_GAMEPLAY.projectileRadius * POWERUP_CONFIG.cryoOrbRadiusMultiplier * scale;
  const speed = BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.cryoOrbSpeedMultiplier * scale;
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
    maxLifetime: POWERUP_CONFIG.cryoOrbLifetimeSec,
    maxBounces: POWERUP_CONFIG.cryoOrbMaxBounces,
    graceTimer: BASE_GAMEPLAY.selfHitGraceSec,
    variant: 'cryo_orb',
    bounceBehavior: 'reflect',
  });
  if (!proj) return { fired: false, hudDirty: false };

  tank.triggerFireVisual(POWERUP_CONFIG.cryoCooldownSec);
  audioManager.playCryoShot();
  effectsSystem.emitCryoMuzzle(spawn.x, spawn.y, tank.kinematics.angle);
  emitNetEvent({
    kind: 'muzzle_fx',
    variant: 'cryo_orb',
    x: spawn.x,
    y: spawn.y,
    angle: tank.kinematics.angle,
  });

  const { depleted } = tank.consumeSkillAmmo(1);
  if (depleted) {
    effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
  }
  return { fired: true, hudDirty: true };
}
