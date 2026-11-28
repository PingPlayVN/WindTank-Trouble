import type Phaser from 'phaser';
import type { Tank } from '../../entities/Tank';
import type {
  CryoZoneState,
  EnergyBarrierState,
  GroundSpikeZone,
  MysteryCrateState,
  ProximityMineState,
  WarpBeaconState,
} from '../../skills/types';
import type { BuiltArenaLayout, PlayerIndex } from '../../types/gameTypes';

export interface CrateVisualEntry {
  state: MysteryCrateState;
  sprite: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Arc;
}

export interface SpikeZoneVisualEntry {
  state: GroundSpikeZone;
  sprites: Phaser.GameObjects.Image[];
  warningRing: Phaser.GameObjects.Arc;
}

export interface MineVisualEntry {
  state: ProximityMineState;
  sprite: Phaser.GameObjects.Image;
  armRing: Phaser.GameObjects.Arc;
}

export interface CryoZoneVisualEntry {
  state: CryoZoneState;
  disc: Phaser.GameObjects.Arc;
}

export interface WarpBeaconVisualEntry {
  state: WarpBeaconState;
  sprite: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Arc;
}

export interface ActiveEmpCataclysm {
  x: number;
  y: number;
  radius: number;
  arcTargets: Array<{ x: number; y: number; lethal?: boolean }>;
  age: number;
  duration: number;
}

export interface ActiveWarpCataclysm {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  blastRadius: number;
  age: number;
  duration: number;
}

export interface PowerUpFieldRenderContext {
  dt: number;
  animClock: number;
  arena: BuiltArenaLayout;
  tanks: readonly Tank[];
  crates: readonly CrateVisualEntry[];
  spikeZones: readonly SpikeZoneVisualEntry[];
  mines: readonly MineVisualEntry[];
  cryoZones: readonly CryoZoneVisualEntry[];
  barriers: readonly EnergyBarrierState[];
  warpBeacons: readonly WarpBeaconVisualEntry[];
  activeEmpCataclysms: ActiveEmpCataclysm[];
  activeWarpCataclysms: ActiveWarpCataclysm[];
  huntedTargetIndices: ReadonlySet<PlayerIndex>;
  zoneGraphics: Phaser.GameObjects.Graphics;
  barrierGraphics: Phaser.GameObjects.Graphics;
  holoGraphics: Phaser.GameObjects.Graphics;
  reticleGraphics: Phaser.GameObjects.Graphics;
  reaperShadowGraphics: Phaser.GameObjects.Graphics;
  reaperGraphics: Phaser.GameObjects.Graphics;
}
