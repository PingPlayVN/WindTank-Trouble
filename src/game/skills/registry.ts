import type { SkillId } from '../types/gameTypes';
import { BARRIER_SKILL_DESCRIPTOR, fireBarrierSkill } from './items/barrierSkill';
import { CRYO_SKILL_DESCRIPTOR, fireCryoSkill } from './items/cryoSkill';
import { DRILL_SKILL_DESCRIPTOR, fireDrillSkill } from './items/drillSkill';
import { EMP_SKILL_DESCRIPTOR, fireEmpSkill } from './items/empSkill';
import { FLAME_SKILL_DESCRIPTOR, fireFlameSkill } from './items/flameSkill';
import { GATLING_SKILL_DESCRIPTOR, fireGatlingSkill } from './items/gatlingSkill';
import { HOMING_SKILL_DESCRIPTOR, fireHomingSkill } from './items/homingSkill';
import { LASER_SKILL_DESCRIPTOR, fireLaserSkill } from './items/laserSkill';
import { MINE_SKILL_DESCRIPTOR, fireMineSkill } from './items/mineSkill';
import { PHANTOM_SKILL_DESCRIPTOR, firePhantomSkill } from './items/phantomSkill';
import { REAPER_SKILL_DESCRIPTOR, fireReaperSkill } from './items/reaperSkill';
import { SCATTER_SKILL_DESCRIPTOR, fireScatterSkill } from './items/scatterSkill';
import { SHIELD_SKILL_DESCRIPTOR, fireShieldSkill } from './items/shieldSkill';
import { SPIKE_SKILL_DESCRIPTOR, fireSpikeSkill } from './items/spikeSkill';
import { WARP_SKILL_DESCRIPTOR, fireWarpSkill } from './items/warpSkill';
import type { SkillDescriptor, SkillFireHandler } from './types';

export const SKILL_DESCRIPTORS: readonly SkillDescriptor[] = [
  SCATTER_SKILL_DESCRIPTOR,
  GATLING_SKILL_DESCRIPTOR,
  MINE_SKILL_DESCRIPTOR,
  CRYO_SKILL_DESCRIPTOR,
  FLAME_SKILL_DESCRIPTOR,
  BARRIER_SKILL_DESCRIPTOR,
  SPIKE_SKILL_DESCRIPTOR,
  EMP_SKILL_DESCRIPTOR,
  DRILL_SKILL_DESCRIPTOR,
  SHIELD_SKILL_DESCRIPTOR,
  PHANTOM_SKILL_DESCRIPTOR,
  HOMING_SKILL_DESCRIPTOR,
  WARP_SKILL_DESCRIPTOR,
  LASER_SKILL_DESCRIPTOR,
  REAPER_SKILL_DESCRIPTOR,
] as const;

export const ALL_SKILL_IDS: readonly SkillId[] = SKILL_DESCRIPTORS.map((s) => s.id);

export function getSkillDescriptor(id: SkillId): SkillDescriptor {
  return SKILL_DESCRIPTORS.find((s) => s.id === id) ?? SKILL_DESCRIPTORS[0];
}

export const SKILL_FIRE_HANDLERS: Readonly<Record<SkillId, SkillFireHandler>> = {
  scatter: fireScatterSkill,
  gatling: fireGatlingSkill,
  mine: fireMineSkill,
  cryo: fireCryoSkill,
  flame: fireFlameSkill,
  barrier: fireBarrierSkill,
  spike: fireSpikeSkill,
  emp: fireEmpSkill,
  drill: fireDrillSkill,
  shield: fireShieldSkill,
  phantom: firePhantomSkill,
  homing: fireHomingSkill,
  warp: fireWarpSkill,
  laser: fireLaserSkill,
  reaper: fireReaperSkill,
};

export type { SkillDescriptor };
