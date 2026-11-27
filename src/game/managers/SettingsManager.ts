import {
  AI_DIFFICULTY_ORDER,
  AI_TACTIC_ORDER,
  ALL_SKILL_IDS,
  BATTLE_MODE_ORDER,
  DEFAULT_PLAYER_BINDINGS,
  DEFAULT_SETTINGS,
  isTouchDeviceDetected,
  normalizeCrateSpawnInterval,
  normalizeMaxCrates,
  normalizeWinningScore,
  TANK_PALETTES,
} from '../config/constants';
import { VALID_MAP_MODE_IDS } from '../maps/mapDefinitions';
import type {
  AIDifficulty,
  AITacticId,
  BattleModeId,
  ControlAction,
  GameSettings,
  MapModeId,
  PlayerIndex,
  PlayerKeyBindings,
  SkillId,
  TntBarrelsOption,
  TouchScheme,
} from '../types/gameTypes';

const STORAGE_KEY = 'windtank_settings_v1';

const RESERVED_KEYS = new Set(['Escape', 'F5', 'F11', 'F12']);
const VALID_AI_DIFFS = new Set<AIDifficulty>(AI_DIFFICULTY_ORDER);
const VALID_SKILLS = new Set<SkillId>(ALL_SKILL_IDS);
const VALID_BATTLE_MODES = new Set<BattleModeId>(BATTLE_MODE_ORDER);
const VALID_AI_TACTICS = new Set<AITacticId>(AI_TACTIC_ORDER);

export interface KeyConflictInfo {
  playerIndex: PlayerIndex;
  action: ControlAction;
}

export class SettingsManager {
  private settings: GameSettings;

  constructor() {
    this.settings = this.load();
  }

  getSettings(): GameSettings {
    return this.settings;
  }

  setPlayerCount(count: 2 | 3 | 4): void {
    const clamped: 2 | 3 | 4 = this.isTouchControlsActive() ? 2 : count;
    this.settings.playerCount = clamped;
    this.ensureDistinctColors();
    this.save();
  }

  setWinningScore(score: number): void {
    this.settings.winningScore = normalizeWinningScore(score);
    this.save();
  }

  setMapMode(mode: MapModeId): void {
    this.settings.mapMode = mode;
    this.save();
  }

  setBattleMode(mode: BattleModeId): void {
    if (!VALID_BATTLE_MODES.has(mode)) return;
    this.settings.battleMode = mode;
    this.save();
  }

  cycleBattleMode(direction: 1 | -1 = 1): BattleModeId {
    const cur = this.settings.battleMode ?? 'classic';
    const idx = Math.max(0, BATTLE_MODE_ORDER.indexOf(cur));
    const next =
      BATTLE_MODE_ORDER[(idx + direction + BATTLE_MODE_ORDER.length) % BATTLE_MODE_ORDER.length];
    this.settings.battleMode = next;
    this.save();
    return next;
  }

  setMaxArmorHp(hp: number): void {
    const allowed = [100, 150, 200];
    const nearest = allowed.includes(hp) ? hp : 100;
    this.settings.maxArmorHp = nearest;
    this.save();
  }

  cycleMaxArmorHp(): number {
    const steps = [100, 150, 200];
    const idx = steps.indexOf(this.settings.maxArmorHp);
    const next = steps[(idx + 1) % steps.length];
    this.settings.maxArmorHp = next;
    this.save();
    return next;
  }

  setTntBarrelsOption(opt: TntBarrelsOption): void {
    this.settings.tntBarrelsOption = opt;
    this.save();
  }

  cycleTntBarrelsOption(): TntBarrelsOption {
    const order: TntBarrelsOption[] = ['auto', 'on', 'off'];
    const idx = order.indexOf(this.settings.tntBarrelsOption);
    const next = order[(idx + 1) % order.length];
    this.settings.tntBarrelsOption = next;
    this.save();
    return next;
  }

  setAITactic(tactic: AITacticId): void {
    if (!VALID_AI_TACTICS.has(tactic)) return;
    this.settings.aiTactic = tactic;
    this.save();
  }

  cycleAITactic(direction: 1 | -1 = 1): AITacticId {
    const cur = this.settings.aiTactic ?? 'balanced';
    const idx = Math.max(0, AI_TACTIC_ORDER.indexOf(cur));
    const next =
      AI_TACTIC_ORDER[(idx + direction + AI_TACTIC_ORDER.length) % AI_TACTIC_ORDER.length];
    this.settings.aiTactic = next;
    this.save();
    return next;
  }

  setPowerUpSpawnIntervalSec(sec: number): void {
    this.settings.powerUpSpawnIntervalSec = normalizeCrateSpawnInterval(sec);
    this.save();
  }

  setMaxCratesOnFloor(max: number): void {
    this.settings.maxCratesOnFloor = normalizeMaxCrates(max);
    this.save();
  }

  toggleSkillEnabled(skillId: SkillId): boolean {
    const idx = this.settings.enabledSkills.indexOf(skillId);
    let enabled: boolean;
    if (idx >= 0) {
      this.settings.enabledSkills.splice(idx, 1);
      enabled = false;
    } else {
      this.settings.enabledSkills.push(skillId);
      enabled = true;
    }
    this.save();
    return enabled;
  }

  setAllSkillsEnabled(enabled: boolean): void {
    this.settings.enabledSkills = enabled ? [...ALL_SKILL_IDS] : [];
    this.save();
  }

  setPlayerIsAI(playerIndex: PlayerIndex, isAI: boolean): void {
    this.settings.playerIsAI[playerIndex] = isAI;
    this.save();
  }

  togglePlayerIsAI(playerIndex: PlayerIndex): boolean {
    const next = !this.settings.playerIsAI[playerIndex];
    this.settings.playerIsAI[playerIndex] = next;
    this.save();
    return next;
  }

  setPlayerAIDifficulty(playerIndex: PlayerIndex, diff: AIDifficulty): void {
    if (!VALID_AI_DIFFS.has(diff)) return;
    this.settings.playerAIDifficulty[playerIndex] = diff;
    this.save();
  }

  cyclePlayerAIDifficulty(playerIndex: PlayerIndex, direction: 1 | -1 = 1): AIDifficulty {
    const cur = this.settings.playerAIDifficulty[playerIndex] ?? 'normal';
    const idx = Math.max(0, AI_DIFFICULTY_ORDER.indexOf(cur));
    const next =
      AI_DIFFICULTY_ORDER[(idx + direction + AI_DIFFICULTY_ORDER.length) % AI_DIFFICULTY_ORDER.length];
    this.settings.playerAIDifficulty[playerIndex] = next;
    this.save();
    return next;
  }

  setSoundEnabled(enabled: boolean): void {
    this.settings.soundEnabled = enabled;
    this.save();
  }

  setMasterVolume(vol: number): void {
    this.settings.masterVolume = Math.max(0, Math.min(1, vol));
    this.save();
  }

  setScreenShake(enabled: boolean): void {
    this.settings.screenShake = enabled;
    this.save();
  }

  setTouchScheme(scheme: TouchScheme): void {
    this.settings.touchScheme = scheme;
    this.save();
  }

  toggleTouchScheme(): TouchScheme {
    const next: TouchScheme =
      this.settings.touchScheme === 'vector_stick' ? 'dual_pad' : 'vector_stick';
    this.settings.touchScheme = next;
    this.save();
    return next;
  }

  setTouchSensitivity(val: number): void {
    const clamped = Math.round(Math.max(0.6, Math.min(1.5, val)) * 100) / 100;
    this.settings.touchSensitivity = clamped;
    this.save();
  }

  stepTouchSensitivity(delta: number): number {
    const next = Math.round(Math.max(0.6, Math.min(1.5, this.settings.touchSensitivity + delta)) * 100) / 100;
    this.settings.touchSensitivity = next;
    this.save();
    return next;
  }

  setTouchAimZone(val: number): void {
    const clamped = Math.round(Math.max(0.22, Math.min(0.6, val)) * 100) / 100;
    this.settings.touchAimZone = clamped;
    this.save();
  }

  stepTouchAimZone(delta: number): number {
    const next = Math.round(Math.max(0.22, Math.min(0.6, this.settings.touchAimZone + delta)) * 100) / 100;
    this.settings.touchAimZone = next;
    this.save();
    return next;
  }

  setTouchButtonScale(val: number): void {
    const clamped = Math.round(Math.max(0.8, Math.min(1.35, val)) * 100) / 100;
    this.settings.touchButtonScale = clamped;
    this.save();
  }

  stepTouchButtonScale(delta: number): number {
    const next = Math.round(Math.max(0.8, Math.min(1.35, this.settings.touchButtonScale + delta)) * 100) / 100;
    this.settings.touchButtonScale = next;
    this.save();
    return next;
  }

  setTouchFloatingStick(enabled: boolean): void {
    this.settings.touchFloatingStick = enabled;
    this.save();
  }

  setTouchSwapHands(swapped: boolean): void {
    this.settings.touchSwapHands = swapped;
    this.save();
  }

  resetTouchSettingsToDefault(): void {
    this.settings.touchScheme = DEFAULT_SETTINGS.touchScheme;
    this.settings.touchSensitivity = DEFAULT_SETTINGS.touchSensitivity;
    this.settings.touchAimZone = DEFAULT_SETTINGS.touchAimZone;
    this.settings.touchButtonScale = DEFAULT_SETTINGS.touchButtonScale;
    this.settings.touchFloatingStick = DEFAULT_SETTINGS.touchFloatingStick;
    this.settings.touchSwapHands = DEFAULT_SETTINGS.touchSwapHands;
    this.save();
  }

  /**
   * 100% automatic platform detection: Mobile/Touch devices get Mobile UI & Touch Controls;
   * Desktop PCs get Keyboard UI & Controls without asking the user to toggle modes!
   */
  isTouchControlsActive(): boolean {
    return isTouchDeviceDetected();
  }

  cyclePlayerColor(playerIndex: PlayerIndex, direction: 1 | -1 = 1): string {
    const currentId = this.settings.playerColors[playerIndex];
    const usedByActiveOthers = new Set<string>();
    for (let i = 0; i < this.settings.playerCount; i++) {
      if (i !== playerIndex) {
        usedByActiveOthers.add(this.settings.playerColors[i]);
      }
    }

    const startIdx = Math.max(
      0,
      TANK_PALETTES.findIndex((p) => p.id === currentId),
    );
    for (let step = 1; step <= TANK_PALETTES.length; step++) {
      const nextIdx = (startIdx + direction * step + TANK_PALETTES.length * 4) % TANK_PALETTES.length;
      const candidate = TANK_PALETTES[nextIdx].id;
      if (!usedByActiveOthers.has(candidate)) {
        this.settings.playerColors[playerIndex] = candidate;
        for (let j = this.settings.playerCount; j < 4; j++) {
          const jIdx = j as PlayerIndex;
          if (this.settings.playerColors[jIdx] === candidate) {
            this.settings.playerColors[jIdx] = currentId;
          }
        }
        this.save();
        return candidate;
      }
    }
    return currentId;
  }

  findKeyConflict(
    code: string,
    ignorePlayer: PlayerIndex,
    ignoreAction: ControlAction,
  ): KeyConflictInfo | null {
    const actions: ControlAction[] = ['forward', 'backward', 'left', 'right', 'fire'];
    for (let p = 0; p < 4; p++) {
      const pIdx = p as PlayerIndex;
      const bind = this.settings.playerBindings[pIdx];
      for (const act of actions) {
        if (pIdx === ignorePlayer && act === ignoreAction) continue;
        if (bind[act] === code) {
          return { playerIndex: pIdx, action: act };
        }
      }
    }
    return null;
  }

  rebindKey(
    playerIndex: PlayerIndex,
    action: ControlAction,
    code: string,
  ): { ok: boolean; swappedWith?: KeyConflictInfo; reason?: string } {
    if (!code || RESERVED_KEYS.has(code)) {
      return { ok: false, reason: 'Reserved system key' };
    }

    const prevCode = this.settings.playerBindings[playerIndex][action];
    const conflict = this.findKeyConflict(code, playerIndex, action);
    if (conflict) {
      this.settings.playerBindings[conflict.playerIndex][conflict.action] = prevCode;
    }
    this.settings.playerBindings[playerIndex][action] = code;
    this.save();
    return { ok: true, swappedWith: conflict ?? undefined };
  }

  resetBindingsToDefault(): void {
    this.settings.playerBindings = [
      { ...DEFAULT_PLAYER_BINDINGS[0] },
      { ...DEFAULT_PLAYER_BINDINGS[1] },
      { ...DEFAULT_PLAYER_BINDINGS[2] },
      { ...DEFAULT_PLAYER_BINDINGS[3] },
    ];
    this.save();
  }

  private ensureDistinctColors(): void {
    const seen = new Set<string>();
    for (let i = 0; i < 4; i++) {
      let c = this.settings.playerColors[i];
      if (!TANK_PALETTES.some((p) => p.id === c) || seen.has(c)) {
        const fallback =
          TANK_PALETTES.find((p) => !seen.has(p.id))?.id ??
          TANK_PALETTES[i % TANK_PALETTES.length].id;
        c = fallback;
        this.settings.playerColors[i] = c;
      }
      seen.add(c);
    }
  }

  private load(): GameSettings {
    const cloneDefaults = (): GameSettings => ({
      ...DEFAULT_SETTINGS,
      enabledSkills: [...DEFAULT_SETTINGS.enabledSkills],
      playerIsAI: [...DEFAULT_SETTINGS.playerIsAI] as [boolean, boolean, boolean, boolean],
      playerAIDifficulty: [...DEFAULT_SETTINGS.playerAIDifficulty] as [
        AIDifficulty,
        AIDifficulty,
        AIDifficulty,
        AIDifficulty,
      ],
      playerColors: [...DEFAULT_SETTINGS.playerColors] as [string, string, string, string],
      playerBindings: [
        { ...DEFAULT_PLAYER_BINDINGS[0] },
        { ...DEFAULT_PLAYER_BINDINGS[1] },
        { ...DEFAULT_PLAYER_BINDINGS[2] },
        { ...DEFAULT_PLAYER_BINDINGS[3] },
      ],
    });

    try {
      if (typeof window === 'undefined' || !window.localStorage) return cloneDefaults();
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return cloneDefaults();
      const parsed = JSON.parse(raw) as Partial<GameSettings>;
      const merged = cloneDefaults();

      if (parsed.playerCount === 2 || parsed.playerCount === 3 || parsed.playerCount === 4) {
        merged.playerCount = parsed.playerCount;
      }
      if (typeof parsed.winningScore === 'number' && parsed.winningScore >= 0 && parsed.winningScore <= 999) {
        merged.winningScore = normalizeWinningScore(parsed.winningScore);
      }
      if (typeof parsed.mapMode === 'string' && VALID_MAP_MODE_IDS.has(parsed.mapMode as MapModeId)) {
        merged.mapMode = parsed.mapMode as MapModeId;
      }
      if (typeof parsed.battleMode === 'string' && VALID_BATTLE_MODES.has(parsed.battleMode as BattleModeId)) {
        merged.battleMode = parsed.battleMode as BattleModeId;
      }
      if (parsed.maxArmorHp === 100 || parsed.maxArmorHp === 150 || parsed.maxArmorHp === 200) {
        merged.maxArmorHp = parsed.maxArmorHp;
      }
      if (
        parsed.tntBarrelsOption === 'auto' ||
        parsed.tntBarrelsOption === 'on' ||
        parsed.tntBarrelsOption === 'off'
      ) {
        merged.tntBarrelsOption = parsed.tntBarrelsOption;
      }
      if (typeof parsed.aiTactic === 'string' && VALID_AI_TACTICS.has(parsed.aiTactic as AITacticId)) {
        merged.aiTactic = parsed.aiTactic as AITacticId;
      }
      if (typeof parsed.powerUpSpawnIntervalSec === 'number') {
        merged.powerUpSpawnIntervalSec = normalizeCrateSpawnInterval(parsed.powerUpSpawnIntervalSec);
      }
      if (typeof parsed.maxCratesOnFloor === 'number') {
        merged.maxCratesOnFloor = normalizeMaxCrates(parsed.maxCratesOnFloor);
      }
      if (Array.isArray(parsed.enabledSkills)) {
        merged.enabledSkills = parsed.enabledSkills.filter((id): id is SkillId =>
          VALID_SKILLS.has(id as SkillId),
        );
      }
      if (Array.isArray(parsed.playerIsAI) && parsed.playerIsAI.length === 4) {
        merged.playerIsAI = parsed.playerIsAI.map((v) => Boolean(v)) as [
          boolean,
          boolean,
          boolean,
          boolean,
        ];
      }
      if (Array.isArray(parsed.playerAIDifficulty) && parsed.playerAIDifficulty.length === 4) {
        merged.playerAIDifficulty = parsed.playerAIDifficulty.map((d) =>
          VALID_AI_DIFFS.has(d as AIDifficulty) ? (d as AIDifficulty) : 'normal',
        ) as [AIDifficulty, AIDifficulty, AIDifficulty, AIDifficulty];
      }
      if (typeof parsed.soundEnabled === 'boolean') {
        merged.soundEnabled = parsed.soundEnabled;
      }
      if (typeof parsed.masterVolume === 'number') {
        merged.masterVolume = Math.max(0, Math.min(1, parsed.masterVolume));
      }
      if (typeof parsed.screenShake === 'boolean') {
        merged.screenShake = parsed.screenShake;
      }
      if (parsed.touchScheme === 'vector_stick' || parsed.touchScheme === 'dual_pad') {
        merged.touchScheme = parsed.touchScheme;
      }
      if (typeof parsed.touchSensitivity === 'number' && Number.isFinite(parsed.touchSensitivity)) {
        merged.touchSensitivity = Math.max(0.6, Math.min(1.5, parsed.touchSensitivity));
      }
      if (typeof parsed.touchAimZone === 'number' && Number.isFinite(parsed.touchAimZone)) {
        merged.touchAimZone = Math.max(0.22, Math.min(0.6, parsed.touchAimZone));
      }
      if (typeof parsed.touchButtonScale === 'number' && Number.isFinite(parsed.touchButtonScale)) {
        merged.touchButtonScale = Math.max(0.85, Math.min(1.25, parsed.touchButtonScale));
      }
      if (typeof parsed.touchFloatingStick === 'boolean') {
        merged.touchFloatingStick = parsed.touchFloatingStick;
      }
      if (typeof parsed.touchSwapHands === 'boolean') {
        merged.touchSwapHands = parsed.touchSwapHands;
      }
      if (Array.isArray(parsed.playerColors) && parsed.playerColors.length === 4) {
        merged.playerColors = [...parsed.playerColors] as [string, string, string, string];
      }
      if (Array.isArray(parsed.playerBindings) && parsed.playerBindings.length === 4) {
        merged.playerBindings = parsed.playerBindings.map((b, idx) => ({
          ...DEFAULT_PLAYER_BINDINGS[idx],
          ...(b ?? {}),
        })) as [PlayerKeyBindings, PlayerKeyBindings, PlayerKeyBindings, PlayerKeyBindings];
      }
      return merged;
    } catch {
      return cloneDefaults();
    }
  }

  private save(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
      }
    } catch {
      // Ignore storage quota / private mode errors
    }
  }
}

export const settingsManager = new SettingsManager();
