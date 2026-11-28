import { POWERUP_CONFIG } from '../config/gameplayConfig';
import type { SeededRng } from '../systems/MazeSystem';
import type { BuiltArenaLayout, SkillId, TankKinematics } from '../types/gameTypes';
import { getSkillDescriptor, SKILL_DESCRIPTORS } from './registry';
import type { GroundSpikeZone, MysteryCrateState, PlayerSkillState } from './types';

/**
 * Rolls a random skill weighted by power/rarity, respecting `enabledSkills` when provided.
 */
export function rollWeightedSkill(
  rng: SeededRng,
  enabledSkills?: ReadonlyArray<SkillId>,
): SkillId {
  const pool =
    enabledSkills && enabledSkills.length > 0
      ? SKILL_DESCRIPTORS.filter((d) => enabledSkills.includes(d.id))
      : SKILL_DESCRIPTORS;

  if (pool.length === 0) {
    return SKILL_DESCRIPTORS[0].id;
  }

  let totalWeight = 0;
  for (const desc of pool) {
    totalWeight += desc.weight;
  }
  let pick = rng.nextFloat() * totalWeight;
  for (const desc of pool) {
    pick -= desc.weight;
    if (pick <= 0) {
      return desc.id;
    }
  }
  return pool[0].id;
}

export function canPickupCrate(state: PlayerSkillState, pendingDischarge = false): boolean {
  return (
    state.chargingLaserRemaining <= 0 &&
    !pendingDischarge &&
    (state.reaperWindupRemaining ?? 0) <= 0 &&
    (state.reaperDeployRemaining ?? 0) <= 0 &&
    (state.reaperSpinRemaining ?? 0) <= 0
  );
}

export function tryApplyCratePickup(
  state: PlayerSkillState,
  rolledSkill: SkillId,
  pendingDischarge = false,
): { pickedUp: boolean; nextState: PlayerSkillState } {
  if (!canPickupCrate(state, pendingDischarge)) {
    return {
      pickedUp: false,
      nextState: { ...state },
    };
  }
  const desc = getSkillDescriptor(rolledSkill);
  return {
    pickedUp: true,
    nextState: {
      skill: rolledSkill,
      ammo: desc.ammo,
      chargingLaserRemaining: 0,
    },
  };
}

/**
 * Picks a safe, unoccupied maze cell for spawning a Mystery Wooden Crate.
 */
export function pickMysteryCrateCell(
  arena: BuiltArenaLayout,
  tanks: readonly TankKinematics[],
  crates: readonly MysteryCrateState[],
  spikeZones: readonly GroundSpikeZone[],
  rng: SeededRng,
  maxCrates: number = POWERUP_CONFIG.maxCratesOnFloor,
): { col: number; row: number; x: number; y: number } | null {
  if (crates.length >= maxCrates) {
    return null;
  }

  const candidates: Array<{
    col: number;
    row: number;
    x: number;
    y: number;
    minTankDist: number;
  }> = [];
  const { cols, rows } = arena.grid;

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (crates.some((c) => c.col === col && c.row === row)) continue;
      const cx = arena.originX + (col + 0.5) * arena.cellSize;
      const cy = arena.originY + (row + 0.5) * arena.cellSize;

      const onSpikes = spikeZones.some(
        (z) => z.age < z.duration && Math.hypot(cx - z.x, cy - z.y) < arena.cellSize * 0.85,
      );
      if (onSpikes) continue;

      let minTankDist = Infinity;
      for (const t of tanks) {
        if (!t.alive) continue;
        const d = Math.hypot(cx - t.x, cy - t.y);
        if (d < minTankDist) minTankDist = d;
      }

      candidates.push({ col, row, x: cx, y: cy, minTankDist });
    }
  }

  if (candidates.length === 0) return null;

  const safeThreshold = arena.cellSize * 1.45;
  const roomy = candidates.filter((c) => c.minTankDist >= safeThreshold);
  if (roomy.length > 0) {
    const chosen = roomy[rng.nextInt(roomy.length)];
    return { col: chosen.col, row: chosen.row, x: chosen.x, y: chosen.y };
  }

  candidates.sort((a, b) => b.minTankDist - a.minTankDist);
  const top = candidates[0];
  return { col: top.col, row: top.row, x: top.x, y: top.y };
}
