import type { Tank } from '../entities/Tank';
import type { AudioManager } from '../managers/AudioManager';
import type { SeededRng } from '../systems/MazeSystem';
import type { EffectsSystem } from '../systems/EffectsSystem';
import type { ProjectileSystem } from '../systems/ProjectileSystem';
import type { NetGameEvent } from '../network/PeerMultiplayerManager';
import type {
  BuiltArenaLayout,
  PlayerIndex,
  SkillId,
  TankKinematics,
  WallRect,
} from '../types/gameTypes';

export interface SkillDescriptor {
  id: SkillId;
  name: string;
  hudShort: string;
  suitTitle: string;
  weight: number;
  dropPercent: number;
  ammo: number;
  ammoLabel: string;
  accentColor: number;
  accentHex: string;
  summary: string;
  traits: readonly string[];
}

export interface MysteryCrateState {
  id: number;
  col: number;
  row: number;
  x: number;
  y: number;
  radius: number;
  spawnAge: number;
}

export interface GroundSpikeNode {
  x: number;
  y: number;
  radius: number;
  angle: number;
}

export interface GroundSpikeZone {
  id: number;
  ownerIndex: PlayerIndex;
  x: number;
  y: number;
  age: number;
  duration: number;
  nodes: GroundSpikeNode[];
}

export interface PlayerSkillState {
  skill: SkillId | null;
  ammo: number;
  chargingLaserRemaining: number;
  reaperWindupRemaining?: number;
  reaperDeployRemaining?: number;
  reaperSpinRemaining?: number;
  warpBeaconPlaced?: boolean;
}

export interface ProximityMineState {
  id: number;
  ownerIndex: PlayerIndex;
  x: number;
  y: number;
  age: number;
  armingSec: number;
  duration: number;
  triggerRadius: number;
  blastRadius: number;
}

export interface CryoZoneState {
  id: number;
  ownerIndex: PlayerIndex;
  x: number;
  y: number;
  radius: number;
  age: number;
  duration: number;
}

export interface EnergyBarrierState {
  id: number;
  ownerIndex: PlayerIndex;
  kind: 'h' | 'v';
  r: number;
  c: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  age: number;
  duration: number;
}

export interface WarpBeaconState {
  id: number;
  ownerIndex: PlayerIndex;
  x: number;
  y: number;
  age: number;
  maxDuration: number;
}

export interface SkillFireContext {
  tank: Tank;
  walls: readonly WallRect[];
  allTanks: readonly Tank[];
  arena: BuiltArenaLayout;
  scale: number;
  rng: SeededRng;
  isHeldFire: boolean;
  consumeBufferedPress: () => boolean;
  projectileSystem: ProjectileSystem;
  effectsSystem: EffectsSystem;
  audioManager: AudioManager;
  emitNetEvent: (ev: NetGameEvent) => void;
  allocateEntityId: () => number;
  deployMineVisual: (state: ProximityMineState) => void;
  registerBarrier: (barrier: EnergyBarrierState) => void;
  queueEmpBlast: (x: number, y: number, ownerIndex: PlayerIndex) => void;
  executeWarpAction: (tank: Tank) => { fired: boolean; hudDirty: boolean };
}

export type SkillFireHandler = (ctx: SkillFireContext) => { fired: boolean; hudDirty: boolean };

export type { TankKinematics };
