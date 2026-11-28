import type { PlayerKeyBindings } from '../types/gameTypes';

export const BASE_GAMEPLAY = {
  referenceCellSize: 84,
  wallThickness: 8,
  tankForwardSpeed: 163.8,
  tankBackwardSpeed: 117,
  tankTurnSpeedRad: 3.65,
  tankVelocityLerp: 18,
  tankRadius: 14.5,
  tankBarrelLength: 21,
  projectileSpeed: 296,
  projectileRadius: 4.5,
  maxProjectilesPerTank: 10,
  projectileLifetimeSec: 11.5,
  projectileMaxBounces: 14,
  fireCooldownSec: 0.14,
  fireBufferWindowSec: 0.12,
  selfHitGraceSec: 0.065,
  roundCountdownSec: 1.5,
  roundAftermathSec: 1.75,
  roundEndBannerSec: 1.35,
} as const;

export const POWERUP_CONFIG = {
  spawnIntervalSec: 20,
  maxCratesOnFloor: 4,
  crateRadius: 13,
  // 1. Laser
  laserChargeSec: 2.0,
  laserAutoAimConeDeg: 15,
  laserBeamHalfWidth: 5.5,
  // 2. Spike
  spikeFlightDetonateSec: 3.0,
  spikeRadiusMultiplier: 1.28,
  spikeSpeedMultiplier: 0.82,
  spikeShrapnelCount: 16,
  spikeShrapnelSpeedMultiplier: 1.22,
  spikeShrapnelLifetimeSec: 0.55,
  spikeGroundDurationSec: 5.0,
  spikeGroundRadius: 36,
  spikeGroundNodeCount: 14,
  spikeGroundNodeRadius: 4.8,
  // 3. Gatling
  gatlingAmmo: 20,
  gatlingCooldownSec: 0.068,
  gatlingRadiusMultiplier: 0.72,
  gatlingSpeedMultiplier: 1.36,
  gatlingMaxBounces: 10,
  gatlingLifetimeSec: 8.5,
  gatlingRecoilImpulse: 22,
  gatlingSpreadRad: 0.068,
  // 4. Homing
  homingBallisticSec: 2.5,
  homingTotalLifetimeSec: 16.5,
  homingRadiusMultiplier: 1.08,
  homingBallisticSpeedMultiplier: 0.78,
  homingSeekSpeedMultiplier: 0.94,
  homingTurnRateRad: 10.8,
  // 5. Scatter
  scatterAmmo: 3,
  scatterPelletCount: 5,
  scatterSpreadStepRad: 0.155,
  scatterSpeedMultiplier: 1.16,
  scatterRadiusMultiplier: 0.84,
  scatterMaxBounces: 7,
  scatterLifetimeSec: 5.2,
  scatterCooldownSec: 0.42,
  scatterRecoilImpulse: 45,
  // 6. Mine
  mineAmmo: 3,
  mineCooldownSec: 0.3,
  mineArmingSec: 1.6,
  mineDurationSec: 28.0,
  mineTriggerRadius: 26,
  mineBlastRadius: 46,
  // 7. Flame
  flameAmmo: 80,
  flameCooldownSec: 0.024,
  flameSpreadRad: 0.16,
  flameSpeedMultiplier: 1.96,
  flameLifetimeSec: 1.38,
  flameStartRadius: 5.0,
  flameEndRadius: 18.5,
  flameDragPerSec: 0.78,
  // 8. Drill
  drillAmmo: 2,
  drillWallsPerShot: 4,
  drillSpeedMultiplier: 1.18,
  drillRadiusMultiplier: 1.16,
  drillCooldownSec: 0.36,
  drillLifetimeSec: 9.0,
  // 9. Shield
  shieldDurationSec: 5.5,
  shieldRadiusFactor: 1.68,
  shieldReflectSpeedBoost: 1.18,
  // 10. Reaper
  reaperWindupSec: 0.68,
  reaperShaftExtendSec: 0.26,
  reaperCrescentUnfurlSec: 0.22,
  reaperSpinSpeedRad: 0.8375,
  reaperSpinDurationSec: Math.PI / 0.8375,
  reaperBladeCellsLength: 4.7,
  reaperBladeHalfWidth: 7.5,
  // 11. EMP Storm Nova
  empAmmo: 2,
  empCooldownSec: 0.82,
  empBlastCellsRadius: 3.05,
  empZapCellsRadius: 1.5,
  empBulletReflectSpeedBoost: 1.32,
  empJamDurationSec: 2.5,
  empMisfireIntervalSec: 0.65,
  empMoveSpeedMultiplier: 1.0,
  // 12. Phantom Phase
  phantomDurationSec: 3.5,
  phantomSpeedMultiplier: 1.2,
  // 13. Cryo Cannon
  cryoAmmo: 2,
  cryoCooldownSec: 0.34,
  cryoOrbSpeedMultiplier: 0.92,
  cryoOrbRadiusMultiplier: 1.18,
  cryoOrbMaxBounces: 4,
  cryoOrbLifetimeSec: 4.5,
  cryoFreezeDurationSec: 1.85,
  cryoZoneDurationSec: 6.0,
  cryoZoneCellsRadius: 1.48,
  cryoDriftVelocityLerp: 4.2,
  cryoDriftTurnMultiplier: 0.55,
  cryoDriftSpeedMultiplier: 0.5,
  cryoChillToFreezeSec: 1.25,
  cryoChillDecayPerSec: 1.55,
  cryoRefreezeImmunitySec: 0.85,
  // 14. Energy Barrier
  barrierAmmo: 3,
  barrierCooldownSec: 0.28,
  barrierDurationSec: 8.0,
  // 15. Spatial Warp Beacon
  warpBeaconDurationSec: 12.0,
  warpBlastRadius: 46,
} as const;

export const DEFAULT_PLAYER_BINDINGS: [
  PlayerKeyBindings,
  PlayerKeyBindings,
  PlayerKeyBindings,
  PlayerKeyBindings,
] = [
  { forward: 'KeyW', backward: 'KeyS', left: 'KeyA', right: 'KeyD', fire: 'Space' },
  { forward: 'ArrowUp', backward: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', fire: 'Enter' },
  { forward: 'KeyI', backward: 'KeyK', left: 'KeyJ', right: 'KeyL', fire: 'KeyU' },
  { forward: 'Numpad8', backward: 'Numpad5', left: 'Numpad4', right: 'Numpad6', fire: 'Numpad0' },
];

export const WINNING_SCORE_OPTIONS = [0, 3, 5, 7, 10, 15, 25] as const;

export function normalizeWinningScore(raw: number): number {
  if (!Number.isFinite(raw)) return 5;
  const rounded = Math.round(raw);
  if (rounded <= 0) return 0;
  return Math.min(999, rounded);
}

export function parseCustomScoreInput(rawBuffer: string, fallbackScore: number): number {
  const trimmed = rawBuffer.trim();
  if (!trimmed) return normalizeWinningScore(fallbackScore);
  if (!/^\d+$/.test(trimmed)) return normalizeWinningScore(fallbackScore);
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return normalizeWinningScore(fallbackScore);
  if (parsed <= 0) return 0;
  return Math.min(999, parsed);
}

export function stepWinningScore(current: number, delta: 1 | -1): number {
  const cur = normalizeWinningScore(current);
  if (delta < 0) {
    if (cur === 1) return 0;
    if (cur === 0) return 99;
    return cur - 1;
  }
  if (cur === 0) return 1;
  if (cur >= 999) return 0;
  return cur + 1;
}

export function formatWinningScoreLabel(score: number, compact = false): string {
  const norm = normalizeWinningScore(score);
  if (norm === 0) {
    return compact ? '∞ VÔ TẬN' : 'ĐIỂM THẮNG: ∞ VÔ TẬN';
  }
  return compact ? `THẮNG: ${norm} ĐIỂM` : `ĐẠT TRƯỚC: ${norm} ĐIỂM`;
}

export function normalizeCrateSpawnInterval(raw: number): number {
  if (!Number.isFinite(raw)) return 20;
  const rounded = Math.round(raw);
  if (rounded <= 0) return 0;
  return Math.min(300, rounded);
}

export function parseCustomIntervalInput(rawBuffer: string, fallbackSec: number): number {
  const trimmed = rawBuffer.trim();
  if (!trimmed) return normalizeCrateSpawnInterval(fallbackSec);
  if (!/^\d+$/.test(trimmed)) return normalizeCrateSpawnInterval(fallbackSec);
  const parsed = Number.parseInt(trimmed, 10);
  if (!Number.isFinite(parsed)) return normalizeCrateSpawnInterval(fallbackSec);
  if (parsed <= 0) return 0;
  return Math.min(300, parsed);
}

export function stepCrateSpawnInterval(current: number, delta: 1 | -1): number {
  const cur = normalizeCrateSpawnInterval(current);
  if (delta < 0) {
    if (cur === 1) return 0;
    if (cur === 0) return 120;
    return cur - 1;
  }
  if (cur === 0) return 1;
  if (cur >= 300) return 0;
  return cur + 1;
}

export function formatCrateSpawnIntervalLabel(sec: number, compact = false): string {
  const norm = normalizeCrateSpawnInterval(sec);
  if (norm === 0) {
    return compact ? 'THÙNG: TẮT' : 'THÙNG GỖ: TẮT';
  }
  return compact ? `THÙNG: ${norm}s` : `THÙNG RƠI: ${norm} GIÂY`;
}

export function normalizeMaxCrates(raw: number): number {
  if (!Number.isFinite(raw)) return 4;
  return Math.max(1, Math.min(12, Math.round(raw)));
}

export function formatKeyCodeLabel(code: string): string {
  if (!code) return '?';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) {
    const rest = code.slice(6);
    const shortMap: Record<string, string> = {
      Add: 'Num+',
      Subtract: 'Num-',
      Multiply: 'Num*',
      Divide: 'Num/',
      Decimal: 'Num.',
      Enter: 'NumEnt',
    };
    return shortMap[rest] ?? `Num${rest}`;
  }
  const map: Record<string, string> = {
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Space: 'Space',
    Enter: 'Enter',
    ShiftLeft: 'LShift',
    ShiftRight: 'RShift',
    ControlLeft: 'LCtrl',
    ControlRight: 'RCtrl',
    AltLeft: 'LAlt',
    AltRight: 'RAlt',
    Comma: ',',
    Period: '.',
    Slash: '/',
    Semicolon: ';',
    Quote: "'",
    BracketLeft: '[',
    BracketRight: ']',
    Backslash: '\\',
    Minus: '-',
    Equal: '=',
    Backquote: '`',
    Tab: 'Tab',
  };
  return map[code] ?? code;
}
