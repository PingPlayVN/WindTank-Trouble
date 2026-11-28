import type {
  CryoZoneState,
  GroundSpikeZone,
  MysteryCrateState,
  ProximityMineState,
  WarpBeaconState,
} from '../../skills/types';
import type {
  AIDifficulty,
  AITacticId,
  BuiltArenaLayout,
  GridCell,
  PlayerIndex,
  ProjectileKinematics,
  SkillId,
  TankKinematics,
} from '../../types/gameTypes';
import type { TntBarrelState } from '../BattleModeSim';

export interface AIDifficultyProfile {
  maxBounces: number;
  rayScanAngles: number;
  aimJitterRad: number;
  fireIntervalSec: number;
  dodgeWeight: number;
  cratePriority: number;
  turnDeadbandRad: number;
  throttleDutyCycle: number;
  predictiveLead: boolean;
  predictBounceThreats: boolean;
  detonateTntTraps: boolean;
}

export const AI_DIFFICULTY_PROFILES: Record<AIDifficulty, AIDifficultyProfile> = {
  easy: {
    maxBounces: 0,
    rayScanAngles: 0,
    aimJitterRad: 0.16,
    fireIntervalSec: 0.92,
    dodgeWeight: 0,
    cratePriority: 0.25,
    turnDeadbandRad: 0.14,
    throttleDutyCycle: 0.72,
    predictiveLead: false,
    predictBounceThreats: false,
    detonateTntTraps: false,
  },
  normal: {
    maxBounces: 1,
    rayScanAngles: 22,
    aimJitterRad: 0.055,
    fireIntervalSec: 0.44,
    dodgeWeight: 0.85,
    cratePriority: 0.85,
    turnDeadbandRad: 0.075,
    throttleDutyCycle: 1.0,
    predictiveLead: false,
    predictBounceThreats: false,
    detonateTntTraps: false,
  },
  hard: {
    maxBounces: 2,
    rayScanAngles: 38,
    aimJitterRad: 0.015,
    fireIntervalSec: 0.22,
    dodgeWeight: 1.35,
    cratePriority: 1.25,
    turnDeadbandRad: 0.042,
    throttleDutyCycle: 1.0,
    predictiveLead: false,
    predictBounceThreats: true,
    detonateTntTraps: true,
  },
  super_hard: {
    maxBounces: 3,
    rayScanAngles: 64,
    aimJitterRad: 0,
    fireIntervalSec: 0.12,
    dodgeWeight: 1.9,
    cratePriority: 1.55,
    turnDeadbandRad: 0.024,
    throttleDutyCycle: 1.0,
    predictiveLead: true,
    predictBounceThreats: true,
    detonateTntTraps: true,
  },
};

export interface AISlotMemory {
  playerIndex: PlayerIndex;
  clock: number;
  fireCooldownTimer: number;
  cachedAimAngle: number | null;
  aimHoldTimer: number;
  gatlingSuppressTimer: number;
  mineClearTimer: number;
  homingRetreatTimer: number;
  stuckTimer: number;
  unstuckTimer: number;
  unstuckTargetAngle: number | null;
  unstuckUseForward: boolean;
  lastProgressX: number;
  lastProgressY: number;
  wanderCell: GridCell | null;
}

export function createAISlotMemory(playerIndex: PlayerIndex): AISlotMemory {
  return {
    playerIndex,
    clock: 0,
    fireCooldownTimer: 0,
    cachedAimAngle: null,
    aimHoldTimer: 0,
    gatlingSuppressTimer: 0,
    mineClearTimer: 0,
    homingRetreatTimer: 0,
    stuckTimer: 0,
    unstuckTimer: 0,
    unstuckTargetAngle: null,
    unstuckUseForward: false,
    lastProgressX: 0,
    lastProgressY: 0,
    wanderCell: null,
  };
}

export interface BallisticTraceResult {
  hitsEnemy: boolean;
  selfHitRisk: boolean;
  targetIndex: PlayerIndex | null;
  bouncesUsed: number;
  travelDist: number;
}

export interface DangerAssessment {
  threatLevel: number;
  dodgeX: number;
  dodgeY: number;
  imminentBulletTimeSec: number;
  bulletInFrontCone: boolean;
}

export interface MazeDistanceField {
  cols: number;
  rows: number;
  startIdx: number;
  dist: Int16Array;
  parent: Int16Array;
}

export interface AIWorldContext {
  difficulty: AIDifficulty;
  tactic?: AITacticId;
  dt: number;
  self: TankKinematics;
  selfSkill: SkillId | null;
  selfSkillAmmo: number;
  selfAmmo: number;
  selfShielded: boolean;
  selfPhantom?: boolean;
  selfWarpBeaconPlaced?: boolean;
  hasActiveEmpOrb?: boolean;
  selfReaperSweeping: boolean;
  selfChargingLaser: boolean;
  canFire: boolean;
  tanks: readonly TankKinematics[];
  shieldedTankIndices: ReadonlySet<PlayerIndex>;
  reaperTankIndices: ReadonlySet<PlayerIndex>;
  laserChargingTankIndices?: ReadonlySet<PlayerIndex>;
  projectiles: readonly ProjectileKinematics[];
  crates: readonly MysteryCrateState[];
  spikeZones: readonly GroundSpikeZone[];
  mines: readonly ProximityMineState[];
  cryoZones?: readonly CryoZoneState[];
  warpBeacons?: readonly WarpBeaconState[];
  barrels?: readonly TntBarrelState[];
  arena: BuiltArenaLayout;
}
