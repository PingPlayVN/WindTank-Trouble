export type PlayerIndex = 0 | 1 | 2 | 3;

export type ControlAction = 'forward' | 'backward' | 'left' | 'right' | 'fire';

export type AIDifficulty = 'easy' | 'normal' | 'hard' | 'super_hard';

export type BattleModeId = 'classic' | 'armored_tnt' | 'night_ops' | 'night_armored';

export type AITacticId = 'balanced' | 'rusher' | 'sniper' | 'camper';

export type TntBarrelsOption = 'auto' | 'on' | 'off';

export type TouchScheme = 'vector_stick' | 'dual_pad';

export type NetworkRole = 'offline' | 'host' | 'guest';

export interface PlayerKeyBindings {
  forward: string;
  backward: string;
  left: string;
  right: string;
  fire: string;
}

export interface TankColorPalette {
  id: string;
  name: string;
  primary: number;
  primaryHex: string;
  highlight: number;
  highlightHex: string;
  shadow: number;
  shadowHex: string;
  tread: number;
  outline: number;
}

export interface PlayerConfig {
  index: PlayerIndex;
  name: string;
  active: boolean;
  colorId: string;
  bindings: PlayerKeyBindings;
  isAI: boolean;
  aiDifficulty: AIDifficulty;
}

export interface PlayerInputState {
  forward: boolean;
  backward: boolean;
  left: boolean;
  right: boolean;
  firePressed: boolean;
  fireHeld?: boolean;
  fireBufferedUntil: number;
}

export type MapModeId =
  | 'mix'
  | 'procedural_classic'
  | 'procedural_large'
  | 'procedural_mega'
  | 'procedural_colossal'
  | 'procedural_titan'
  | 'classic_duel'
  | 'crossfire_chambers'
  | 'four_corners'
  | 'ricochet_alley'
  | 'twin_courtyards'
  | 'grand_labyrinth'
  | 'citadel_wargrounds'
  | 'titan_stronghold';

export type SkillId =
  | 'laser'
  | 'spike'
  | 'gatling'
  | 'homing'
  | 'shield'
  | 'mine'
  | 'drill'
  | 'flame'
  | 'scatter'
  | 'reaper';

export type ProjectileVariant =
  | 'standard'
  | 'gatling'
  | 'spike_ball'
  | 'spike_shard'
  | 'homing_missile'
  | 'scatter'
  | 'drill'
  | 'flame';

export type BounceBehavior = 'reflect' | 'shatter' | 'slide' | 'drill';

export interface GridCell {
  col: number;
  row: number;
}

export interface SpawnPoint {
  col: number;
  row: number;
  x: number;
  y: number;
  angle: number;
}

export interface MazeGridData {
  id: string;
  name: string;
  cols: number;
  rows: number;
  /** (rows + 1) x cols boolean matrix of horizontal walls */
  hWalls: boolean[][];
  /** rows x (cols + 1) boolean matrix of vertical walls */
  vWalls: boolean[][];
  seed: number;
}

export interface WallRect {
  x: number;
  y: number;
  width: number;
  height: number;
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface BuiltArenaLayout {
  grid: MazeGridData;
  cellSize: number;
  wallThickness: number;
  originX: number;
  originY: number;
  width: number;
  height: number;
  scaleRatio: number;
  walls: WallRect[];
  spawns: SpawnPoint[];
}

export type RoundPhase = 'countdown' | 'playing' | 'aftermath' | 'round_end' | 'match_over';

export interface GameSettings {
  playerCount: 2 | 3 | 4;
  winningScore: number;
  mapMode: MapModeId;
  battleMode: BattleModeId;
  maxArmorHp: number; // 100 | 150 | 200
  tntBarrelsOption: TntBarrelsOption;
  aiTactic: AITacticId;
  powerUpSpawnIntervalSec: number; // 0 = OFF, 1..300 seconds
  maxCratesOnFloor: number; // 1..12
  enabledSkills: SkillId[];
  playerIsAI: [boolean, boolean, boolean, boolean];
  playerAIDifficulty: [AIDifficulty, AIDifficulty, AIDifficulty, AIDifficulty];
  touchScheme: TouchScheme;
  touchSensitivity: number; // 0.6 .. 1.5 (1.0 = 100% standard)
  touchAimZone: number; // 0.22 .. 0.60 (0.42 = 42% precision aim zone)
  touchButtonScale: number; // 0.80 .. 1.25 (1.0 = 100% button size)
  touchFloatingStick: boolean;
  touchSwapHands: boolean;
  soundEnabled: boolean;
  masterVolume: number;
  screenShake: boolean;
  playerColors: [string, string, string, string];
  playerBindings: [PlayerKeyBindings, PlayerKeyBindings, PlayerKeyBindings, PlayerKeyBindings];
}

export interface RoundResultSummary {
  roundNumber: number;
  winnerIndex: PlayerIndex | null; // null = tie / double KO
  scores: number[];
  ties: number;
  matchWinnerIndex: PlayerIndex | null;
}

export interface TankKinematics {
  index: PlayerIndex;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  radius: number;
  alive: boolean;
}

export interface ProjectileKinematics {
  id: number;
  ownerIndex: PlayerIndex;
  x: number;
  y: number;
  prevX: number;
  prevY: number;
  vx: number;
  vy: number;
  radius: number;
  age: number;
  maxLifetime: number;
  bounces: number;
  maxBounces: number;
  graceTimer: number;
  active: boolean;
  variant?: ProjectileVariant;
  bounceBehavior?: BounceBehavior;
  drillsLeft?: number;
}

export interface WallBounceEvent {
  projectileId: number;
  x: number;
  y: number;
  nx: number;
  ny: number;
  bounces: number;
}

export interface ProjectileHitEvent {
  projectileId: number;
  ownerIndex: PlayerIndex;
  victimIndex: PlayerIndex;
  x: number;
  y: number;
}
