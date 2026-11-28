import { ALL_SKILL_IDS } from '../skills/registry';
import type { GameSettings } from '../types/gameTypes';
import { DEFAULT_PLAYER_BINDINGS, POWERUP_CONFIG } from './gameplayConfig';

export const DEFAULT_SETTINGS: GameSettings = {
  playerCount: 2,
  winningScore: 5,
  mapMode: 'mix',
  battleMode: 'classic',
  maxArmorHp: 100,
  tntBarrelsOption: 'auto',
  aiTactic: 'balanced',
  powerUpSpawnIntervalSec: POWERUP_CONFIG.spawnIntervalSec,
  maxCratesOnFloor: POWERUP_CONFIG.maxCratesOnFloor,
  enabledSkills: [...ALL_SKILL_IDS],
  skillsPoolVersion: 2,
  playerIsAI: [false, false, false, false],
  playerAIDifficulty: ['normal', 'normal', 'normal', 'normal'],
  touchScheme: 'vector_stick',
  touchSensitivity: 1.0,
  touchAimZone: 0.42,
  touchButtonScale: 1.0,
  touchFloatingStick: true,
  touchSwapHands: false,
  soundEnabled: true,
  masterVolume: 0.75,
  screenShake: true,
  playerColors: ['red', 'green', 'blue', 'gold'],
  playerSkins: ['classic', 'classic', 'classic', 'classic'],
  skinStatsEnabled: true,
  playerBindings: [
    { ...DEFAULT_PLAYER_BINDINGS[0] },
    { ...DEFAULT_PLAYER_BINDINGS[1] },
    { ...DEFAULT_PLAYER_BINDINGS[2] },
    { ...DEFAULT_PLAYER_BINDINGS[3] },
  ],
};
