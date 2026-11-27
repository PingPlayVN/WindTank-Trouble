import { settingsManager } from '../managers/SettingsManager';
import type { Tank } from '../entities/Tank';
import { computeBotDecision, createAISlotMemory, type AISlotMemory } from './AISim';
import { SeededRng } from './MazeSystem';
import type { PowerUpSystem } from './PowerUpSystem';
import type { ProjectileSystem } from './ProjectileSystem';
import type {
  AIDifficulty,
  BuiltArenaLayout,
  PlayerConfig,
  PlayerIndex,
  PlayerInputState,
  RoundPhase,
} from '../types/gameTypes';

const IDLE_INPUT: PlayerInputState = {
  forward: false,
  backward: false,
  left: false,
  right: false,
  firePressed: false,
  fireHeld: false,
  fireBufferedUntil: 0,
};

export class AISystem {
  private readonly slots = new Map<
    PlayerIndex,
    {
      difficulty: AIDifficulty;
      memory: AISlotMemory;
      rng: SeededRng;
      pendingFirePress: boolean;
    }
  >();

  constructor(activePlayers: readonly PlayerConfig[], roundSeed: number) {
    for (const p of activePlayers) {
      if (p.isAI) {
        this.slots.set(p.index, {
          difficulty: p.aiDifficulty,
          memory: createAISlotMemory(p.index),
          rng: new SeededRng((roundSeed ^ Math.imul(p.index + 1, 0x9e3779b1)) >>> 0),
          pendingFirePress: false,
        });
      }
    }
  }

  isAIControlled(index: PlayerIndex): boolean {
    return this.slots.has(index);
  }

  updateSlotConfigs(activePlayers: readonly PlayerConfig[], roundSeed: number): void {
    for (const p of activePlayers) {
      if (p.isAI) {
        const existing = this.slots.get(p.index);
        if (existing) {
          existing.difficulty = p.aiDifficulty;
        } else {
          this.slots.set(p.index, {
            difficulty: p.aiDifficulty,
            memory: createAISlotMemory(p.index),
            rng: new SeededRng((roundSeed ^ Math.imul(p.index + 1, 0x9e3779b1)) >>> 0),
            pendingFirePress: false,
          });
        }
      } else {
        this.slots.delete(p.index);
      }
    }
  }

  computeInputForTank(
    tank: Tank,
    dt: number,
    phase: RoundPhase,
    tanks: readonly Tank[],
    arena: BuiltArenaLayout,
    projectileSystem: ProjectileSystem,
    powerUpSystem: PowerUpSystem,
  ): PlayerInputState {
    const slot = this.slots.get(tank.index);
    if (!slot || phase !== 'playing' || !tank.kinematics.alive) {
      if (slot) slot.pendingFirePress = false;
      return IDLE_INPUT;
    }

    const tankKinematics = tanks.map((t) => t.kinematics);
    const shieldedIndices = new Set<PlayerIndex>(
      tanks.filter((t) => t.isShielded()).map((t) => t.index),
    );
    const reaperIndices = new Set<PlayerIndex>(
      tanks.filter((t) => t.isReaperWindingUp() || t.isReaperSweeping()).map((t) => t.index),
    );

    const decision = computeBotDecision(
      {
        difficulty: slot.difficulty,
        tactic: settingsManager.getSettings().aiTactic,
        dt,
        self: tank.kinematics,
        selfSkill: tank.getEquippedSkill(),
        selfSkillAmmo: tank.getSkillAmmo(),
        selfAmmo: projectileSystem.getRemainingAmmo(tank.index),
        selfShielded: tank.isShielded(),
        selfReaperSweeping: tank.isReaperSweeping(),
        selfChargingLaser: tank.isChargingLaser(),
        canFire: tank.canFire(),
        tanks: tankKinematics,
        shieldedTankIndices: shieldedIndices,
        reaperTankIndices: reaperIndices,
        projectiles: projectileSystem.getKinematicsList(),
        crates: powerUpSystem.getCrateStates(),
        spikeZones: powerUpSystem.getSpikeZoneStates(),
        mines: powerUpSystem.getMineStates(),
        arena,
      },
      slot.memory,
      slot.rng,
    );

    if (decision.firePressed) {
      slot.pendingFirePress = true;
    }

    return decision;
  }

  consumeBufferedFire(index: PlayerIndex): boolean {
    const slot = this.slots.get(index);
    if (!slot || !slot.pendingFirePress) return false;
    slot.pendingFirePress = false;
    return true;
  }
}
