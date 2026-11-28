import { POWERUP_CONFIG } from '../../config/gameplayConfig';
import { resolveTankWallCollisions } from '../../systems/CollisionSystem';
import type {
  PlayerIndex,
  ProjectileKinematics,
  TankKinematics,
} from '../../types/gameTypes';
import type { ProximityMineState, SkillDescriptor, SkillFireContext } from '../types';

export const MINE_SKILL_DESCRIPTOR: SkillDescriptor = {
  id: 'mine',
  name: 'MÌN BÓNG MA',
  hudShort: 'MÌN TÀNG HÌNH',
  suitTitle: 'Giáp Đặc Công Bóng Đêm',
  weight: 9,
  dropPercent: 9,
  ammo: POWERUP_CONFIG.mineAmmo,
  ammoLabel: '3 QUẢ MÌN',
  accentColor: 0x455a64,
  accentHex: '#455A64',
  summary: 'Rải mìn cảm ứng sau đuôi xe, tự động tàng hình sau 1.6s gài chốt.',
  traits: [
    '3 quả mìn thả sau đuôi xe • Có 1.6s nhấp nháy chờ gài chốt an toàn',
    'Sau khi gài chốt sẽ TÀNG HÌNH trên sàn (chỉ lóe sáng mờ chu kỳ 3.2s)',
    'Phát nổ cực mạnh khi có xe đi gần hoặc bị đạn/tia lửa quét trúng!',
  ],
};

export function findTriggeredMines(
  mines: readonly ProximityMineState[],
  tanks: readonly TankKinematics[],
  projectiles: ProjectileKinematics[],
): Array<{ mineId: number; x: number; y: number; victimIndices: PlayerIndex[] }> {
  const triggeredIds = new Set<number>();
  const queue: ProximityMineState[] = [];

  for (const m of mines) {
    if (m.age < m.armingSec || m.age >= m.duration) continue;

    let tripped = false;
    for (const t of tanks) {
      if (!t.alive) continue;
      if (Math.hypot(t.x - m.x, t.y - m.y) <= m.triggerRadius + t.radius * 0.45) {
        tripped = true;
        break;
      }
    }

    if (!tripped) {
      for (const p of projectiles) {
        if (!p.active) continue;
        if (Math.hypot(p.x - m.x, p.y - m.y) <= p.radius + m.triggerRadius * 0.52) {
          p.active = false;
          tripped = true;
          break;
        }
      }
    }

    if (tripped) {
      triggeredIds.add(m.id);
      queue.push(m);
    }
  }

  let head = 0;
  while (head < queue.length) {
    const src = queue[head++];
    for (const other of mines) {
      if (triggeredIds.has(other.id) || other.age >= other.duration) continue;
      if (Math.hypot(other.x - src.x, other.y - src.y) <= src.blastRadius * 1.15) {
        triggeredIds.add(other.id);
        queue.push(other);
      }
    }
  }

  return queue.map((m) => {
    const victimIndices: PlayerIndex[] = [];
    for (const t of tanks) {
      if (!t.alive) continue;
      if (Math.hypot(t.x - m.x, t.y - m.y) <= m.blastRadius + t.radius * 0.55) {
        victimIndices.push(t.index);
      }
    }
    return {
      mineId: m.id,
      x: m.x,
      y: m.y,
      victimIndices,
    };
  });
}

export function fireMineSkill(ctx: SkillFireContext): { fired: boolean; hudDirty: boolean } {
  const {
    tank,
    walls,
    scale,
    consumeBufferedPress,
    allocateEntityId,
    deployMineVisual,
    effectsSystem,
    audioManager,
  } = ctx;
  if (!consumeBufferedPress()) return { fired: false, hudDirty: false };

  const rearDist = tank.kinematics.radius + 9 * scale;
  const mineDummy: TankKinematics = {
    index: tank.index,
    x: tank.kinematics.x - Math.cos(tank.kinematics.angle) * rearDist,
    y: tank.kinematics.y - Math.sin(tank.kinematics.angle) * rearDist,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 8 * scale,
    alive: true,
  };
  resolveTankWallCollisions(mineDummy, walls);

  const mineState: ProximityMineState = {
    id: allocateEntityId(),
    ownerIndex: tank.index,
    x: mineDummy.x,
    y: mineDummy.y,
    age: 0,
    armingSec: POWERUP_CONFIG.mineArmingSec,
    duration: POWERUP_CONFIG.mineDurationSec,
    triggerRadius: POWERUP_CONFIG.mineTriggerRadius * scale,
    blastRadius: POWERUP_CONFIG.mineBlastRadius * scale,
  };

  deployMineVisual(mineState);
  tank.triggerFireVisual(POWERUP_CONFIG.mineCooldownSec);
  audioManager.playMineDeploy();
  effectsSystem.emitMineDeploy(mineState.x, mineState.y);

  const { depleted } = tank.consumeSkillAmmo(1);
  if (depleted) {
    effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
  }
  return { fired: true, hudDirty: true };
}
