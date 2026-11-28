import { BASE_GAMEPLAY, POWERUP_CONFIG } from '../../config/gameplayConfig';
import { computeSafeMuzzleSpawn, sweepCircleAgainstWall } from '../../systems/CollisionSystem';
import type { SeededRng } from '../../systems/MazeSystem';
import type { BuiltArenaLayout, PlayerIndex, TankKinematics } from '../../types/gameTypes';
import type {
  GroundSpikeNode,
  GroundSpikeZone,
  SkillDescriptor,
  SkillFireContext,
} from '../types';

export const SPIKE_SKILL_DESCRIPTOR: SkillDescriptor = {
  id: 'spike',
  name: 'ĐẠN GAI SẮT',
  hudShort: 'ĐẠN GAI',
  suitTitle: 'Giáp Thiết Giáp Gai Sắt',
  weight: 7,
  dropPercent: 7,
  ammo: 1,
  ammoLabel: '1 CẦU GAI',
  accentColor: 0x6d4c41,
  accentHex: '#6D4C41',
  summary: 'Đạn cầu gai cỡ lớn, bay 3s sẽ phát nổ văng gai sắt và cắm bẫy gai trên sàn.',
  traits: [
    '1 viên to & chậm hơn đạn thường • Nảy tường vật lý trong 3s đầu',
    'Sau 3s (hoặc khi trúng xe) nổ tung 16 mảnh gai sắt bay tỏa 360°',
    'Để lại bãi gai sắt sát thương trên mặt đất trong 5s tiêu diệt mọi xe cán qua',
  ],
};

export function createSpikeBurstPayload(
  cx: number,
  cy: number,
  arena: BuiltArenaLayout,
  rng: SeededRng,
): {
  shrapnelVelocities: Array<{ vx: number; vy: number }>;
  groundNodes: GroundSpikeNode[];
} {
  const shrapnelCount = POWERUP_CONFIG.spikeShrapnelCount;
  const shrapnelSpeed =
    BASE_GAMEPLAY.projectileSpeed *
    POWERUP_CONFIG.spikeShrapnelSpeedMultiplier *
    arena.scaleRatio;

  const shrapnelVelocities: Array<{ vx: number; vy: number }> = [];
  for (let i = 0; i < shrapnelCount; i++) {
    const baseAngle = (i / shrapnelCount) * Math.PI * 2;
    const jitter = (rng.nextFloat() - 0.5) * 0.08;
    const a = baseAngle + jitter;
    shrapnelVelocities.push({
      vx: Math.cos(a) * shrapnelSpeed,
      vy: Math.sin(a) * shrapnelSpeed,
    });
  }

  const nodeRadius = POWERUP_CONFIG.spikeGroundNodeRadius * arena.scaleRatio;
  const maxRadius = POWERUP_CONFIG.spikeGroundRadius * arena.scaleRatio;
  const groundNodes: GroundSpikeNode[] = [
    { x: cx, y: cy, radius: nodeRadius, angle: rng.nextFloat() * Math.PI * 2 },
  ];

  const count = POWERUP_CONFIG.spikeGroundNodeCount;
  for (let i = 0; i < count; i++) {
    const ringFrac = i % 2 === 0 ? 0.52 : 0.96;
    const dist = maxRadius * ringFrac * (0.88 + rng.nextFloat() * 0.18);
    const angle = (i / count) * Math.PI * 2 + (rng.nextFloat() - 0.5) * 0.16;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;

    let earliestT = 1;
    for (let w = 0; w < arena.walls.length; w++) {
      const hit = sweepCircleAgainstWall(cx, cy, dx, dy, nodeRadius * 0.75, arena.walls[w]);
      if (hit && hit.t < earliestT) {
        earliestT = hit.t;
      }
    }

    const safeT = earliestT < 1 ? Math.max(0, earliestT - 0.1) : 1;
    groundNodes.push({
      x: cx + dx * safeT,
      y: cy + dy * safeT,
      radius: nodeRadius,
      angle,
    });
  }

  return { shrapnelVelocities, groundNodes };
}

export function findGroundSpikeVictims(
  zones: readonly GroundSpikeZone[],
  tanks: readonly TankKinematics[],
): PlayerIndex[] {
  const victims: PlayerIndex[] = [];
  for (const t of tanks) {
    if (!t.alive) continue;
    let impaled = false;
    for (const z of zones) {
      if (z.age >= z.duration) continue;
      for (const node of z.nodes) {
        const hitDist = t.radius * 0.88 + node.radius;
        const dx = t.x - node.x;
        const dy = t.y - node.y;
        if (dx * dx + dy * dy <= hitDist * hitDist) {
          impaled = true;
          break;
        }
      }
      if (impaled) break;
    }
    if (impaled) {
      victims.push(t.index);
    }
  }
  return victims;
}

export function fireSpikeSkill(ctx: SkillFireContext): { fired: boolean; hudDirty: boolean } {
  const { tank, walls, scale, consumeBufferedPress, projectileSystem, effectsSystem, audioManager } =
    ctx;
  if (!consumeBufferedPress()) return { fired: false, hudDirty: false };

  const radius = BASE_GAMEPLAY.projectileRadius * POWERUP_CONFIG.spikeRadiusMultiplier * scale;
  const speed = BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.spikeSpeedMultiplier * scale;
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
    maxLifetime: POWERUP_CONFIG.spikeFlightDetonateSec + 0.25,
    maxBounces: 48,
    graceTimer: spawn.immediateBounce ? 0 : BASE_GAMEPLAY.selfHitGraceSec,
    variant: 'spike_ball',
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
