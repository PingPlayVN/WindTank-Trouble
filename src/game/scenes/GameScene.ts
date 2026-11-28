import Phaser from 'phaser';
import {
  ARENA_VIEWPORT,
  DEFAULT_PLAYER_BINDINGS,
  getSkillDescriptor,
  POWERUP_CONFIG,
  resolveOnlineArenaViewport,
  UI_COLORS,
} from '../config/constants';
import { Tank } from '../entities/Tank';
import { audioManager } from '../managers/AudioManager';
import { mobileOrientationManager } from '../managers/MobileOrientationManager';
import { PlayerManager } from '../managers/PlayerManager';
import { ScoreManager } from '../managers/ScoreManager';
import { settingsManager } from '../managers/SettingsManager';
import { resolveMazeForRound } from '../maps/mapDefinitions';
import { buildArenaLayout } from '../maps/MazeBuilder';
import {
  peerMultiplayer,
  type NetGameEvent,
  type OnlineMatchConfig,
} from '../network/PeerMultiplayerManager';
import { AISystem } from '../systems/AISystem';
import {
  computeWeaponDamage,
  resolveEffectiveBattleModeRules,
  type DamageSourceKind,
  type EffectiveBattleModeRules,
} from '../systems/BattleModeSim';
import { resolveAllTankCollisions } from '../systems/CollisionSystem';
import { EffectsSystem } from '../systems/EffectsSystem';
import { InputSystem } from '../systems/InputSystem';
import { MatchSystem } from '../systems/MatchSystem';
import { isMazeValidAndConnected } from '../systems/MazeSystem';
import { NightVisionSystem } from '../systems/NightVisionSystem';
import {
  computeArenaPerimeterWalls,
  drillMazeWallAtPoint,
  ejectTankFromInteriorWalls,
} from '../systems/PowerUpSim';
import { PowerUpSystem } from '../systems/PowerUpSystem';
import { ProjectileSystem } from '../systems/ProjectileSystem';
import { TntBarrelSystem } from '../systems/TntBarrelSystem';
import type {
  AIDifficulty,
  BattleModeId,
  BuiltArenaLayout,
  NetworkRole,
  PlayerConfig,
  PlayerIndex,
  PlayerInputState,
  RoundPhase,
  RoundResultSummary,
  SkillId,
} from '../types/gameTypes';
import type { UIScene } from './UIScene';

export interface HudSnapshot {
  roundNumber: number;
  mapName: string;
  battleMode: BattleModeId;
  hasArmorHp: boolean;
  isNightOps: boolean;
  winningScore: number;
  ties: number;
  crateIntervalSec: number;
  players: Array<{
    index: PlayerIndex;
    name: string;
    colorId: string;
    isAI: boolean;
    aiDifficulty: AIDifficulty;
    score: number;
    ammo: number;
    hp: number;
    maxHp: number;
    alive: boolean;
    skill: SkillId | null;
    visualSuit: SkillId | null;
    skillAmmo: number;
    laserChargeProgress: number | null;
    shieldRemaining: number;
    phantomRemaining?: number;
    reaperActive: boolean;
    warpBeaconPlaced?: boolean;
    empOrbActive?: boolean;
  }>;
}

export class GameScene extends Phaser.Scene {
  private scoreManager!: ScoreManager;
  private matchBaseSeed = 1;
  private matchCrateTimerSec: number = POWERUP_CONFIG.spawnIntervalSec;
  private currentRoundSeed = 1;

  private networkRole: NetworkRole = 'offline';
  private onlineConfig: OnlineMatchConfig | null = null;
  private hostSnapshotAccumulator = 0;
  private guestRoundPhase: RoundPhase = 'countdown';
  private localKeyboardFireSeq = 0;

  private arena!: BuiltArenaLayout;
  private perimeterWalls: BuiltArenaLayout['walls'] = [];
  private arenaGraphics!: Phaser.GameObjects.Graphics;
  private wallLayerGraphics!: Phaser.GameObjects.Graphics;
  private roster: PlayerConfig[] = [];
  private activePlayers: PlayerConfig[] = [];
  private tanks: Tank[] = [];

  private inputSystem!: InputSystem;
  private aiSystem!: AISystem;
  private projectileSystem!: ProjectileSystem;
  private effectsSystem!: EffectsSystem;
  private powerUpSystem!: PowerUpSystem;
  private tntBarrelSystem!: TntBarrelSystem;
  private nightVisionSystem!: NightVisionSystem;
  private battleRules!: EffectiveBattleModeRules;
  private matchSystem!: MatchSystem;

  private isPaused = false;
  private countdownPulse = 0;
  private lastFrameTimeMs = 0;

  constructor() {
    super('GameScene');
  }

  init(data?: {
    freshMatch?: boolean;
    seed?: number;
    onlineMatch?: OnlineMatchConfig;
    guestRoundNumber?: number;
  }): void {
    const s = settingsManager.getSettings();
    mobileOrientationManager.syncLayout();
    if (settingsManager.isTouchControlsActive() && s.playerCount > 2) {
      settingsManager.setPlayerCount(2);
    }
    this.networkRole = peerMultiplayer.isOnlineSession() ? peerMultiplayer.getRole() : 'offline';
    this.onlineConfig =
      this.networkRole !== 'offline'
        ? (data?.onlineMatch ?? peerMultiplayer.getActiveMatchConfig())
        : null;

    if (!this.scoreManager || data?.freshMatch) {
      if (this.onlineConfig) {
        this.scoreManager = new ScoreManager(2, this.onlineConfig.winningScore);
        this.matchBaseSeed = this.onlineConfig.matchSeed || 4829;
        this.matchCrateTimerSec =
          this.onlineConfig.powerUpSpawnIntervalSec > 0
            ? this.onlineConfig.powerUpSpawnIntervalSec
            : POWERUP_CONFIG.spawnIntervalSec;
      } else {
        this.scoreManager = new ScoreManager(s.playerCount, s.winningScore);
        this.matchBaseSeed = (data?.seed ?? ((Date.now() ^ 0x9e3779b9) >>> 0)) || 1337;
        this.matchCrateTimerSec =
          s.powerUpSpawnIntervalSec > 0 ? s.powerUpSpawnIntervalSec : POWERUP_CONFIG.spawnIntervalSec;
      }
      this.localKeyboardFireSeq = 0;
    }

    this.hostSnapshotAccumulator = 0;
    this.guestRoundPhase = 'countdown';
    this.isPaused = false;
    this.countdownPulse = 0;
    this.lastFrameTimeMs = 0;
  }

  create(): void {
    const s = settingsManager.getSettings();

    if (this.onlineConfig && this.networkRole !== 'offline') {
      this.roster = [
        {
          index: 0,
          name: 'Xe 1 (Chủ Phòng)',
          active: true,
          colorId: this.onlineConfig.hostColorId,
          bindings: { ...s.playerBindings[0] },
          isAI: false,
          aiDifficulty: 'normal',
        },
        {
          index: 1,
          name: 'Xe 2 (Khách)',
          active: true,
          colorId: this.onlineConfig.guestColorId,
          bindings: { ...s.playerBindings[1] },
          isAI: false,
          aiDifficulty: 'normal',
        },
        {
          index: 2,
          name: 'Xe 3',
          active: false,
          colorId: 'blue',
          bindings: { ...DEFAULT_PLAYER_BINDINGS[2] },
          isAI: false,
          aiDifficulty: 'normal',
        },
        {
          index: 3,
          name: 'Xe 4',
          active: false,
          colorId: 'gold',
          bindings: { ...DEFAULT_PLAYER_BINDINGS[3] },
          isAI: false,
          aiDifficulty: 'normal',
        },
      ];
      this.activePlayers = this.roster.slice(0, 2);
    } else {
      this.roster = PlayerManager.buildRoster(s);
      this.activePlayers = this.roster.filter((p) => p.active);
    }

    const roundNumber = this.scoreManager.getRoundNumber();
    const roundSeed = (this.matchBaseSeed + Math.imul(roundNumber, 0x85ebca6b)) >>> 0;
    this.currentRoundSeed = roundSeed;

    const mapMode = this.onlineConfig ? this.onlineConfig.mapMode : s.mapMode;
    const effectiveCount = (this.onlineConfig ? 2 : s.playerCount) as 2 | 3 | 4;

    let mazeGrid: ReturnType<typeof resolveMazeForRound>;
    if (
      this.onlineConfig &&
      this.onlineConfig.authoritativeGrid &&
      this.onlineConfig.authoritativeRound === roundNumber
    ) {
      mazeGrid = {
        ...this.onlineConfig.authoritativeGrid,
        hWalls: this.onlineConfig.authoritativeGrid.hWalls.map((row) => row.slice()),
        vWalls: this.onlineConfig.authoritativeGrid.vWalls.map((row) => row.slice()),
      };
    } else {
      mazeGrid = resolveMazeForRound(mapMode, roundNumber, effectiveCount, roundSeed);
      if (!isMazeValidAndConnected(mazeGrid)) {
        mazeGrid = resolveMazeForRound('procedural_large', roundNumber, effectiveCount, roundSeed ^ 7);
      }
      if (this.onlineConfig && this.networkRole === 'host') {
        this.onlineConfig.authoritativeRound = roundNumber;
        this.onlineConfig.authoritativeGrid = {
          ...mazeGrid,
          hWalls: mazeGrid.hWalls.map((row) => row.slice()),
          vWalls: mazeGrid.vWalls.map((row) => row.slice()),
        };
      }
    }

    const viewport = this.onlineConfig
      ? (this.onlineConfig.authoritativeViewport ??
        resolveOnlineArenaViewport(
          Boolean(this.onlineConfig.hostTouchActive ?? this.onlineConfig.useMobileViewport),
          Boolean(this.onlineConfig.guestTouchActive ?? this.onlineConfig.useMobileViewport),
        ))
      : settingsManager.isTouchControlsActive()
        ? mobileOrientationManager.getLocalMobileArenaViewport()
        : ARENA_VIEWPORT;

    this.arena = buildArenaLayout(mazeGrid, this.activePlayers.length, roundSeed, viewport);
    this.drawArenaEnvironment();

    this.effectsSystem = new EffectsSystem(this, this.arena);
    this.projectileSystem = new ProjectileSystem(this, this.arena.scaleRatio);

    const ruleSpawnSec = this.onlineConfig
      ? this.onlineConfig.powerUpSpawnIntervalSec
      : s.powerUpSpawnIntervalSec;
    const ruleMaxCrates = this.onlineConfig
      ? this.onlineConfig.maxCratesOnFloor
      : s.maxCratesOnFloor;
    const ruleSkills = this.onlineConfig ? this.onlineConfig.enabledSkills : s.enabledSkills;

    this.powerUpSystem = new PowerUpSystem(
      this,
      this.arena,
      this.projectileSystem,
      this.effectsSystem,
      roundSeed,
      this.matchCrateTimerSec,
      () => this.redrawWallLayer(),
      {
        spawnIntervalSec: ruleSpawnSec,
        maxCratesOnFloor: ruleMaxCrates,
        enabledSkills: ruleSkills,
      },
    );

    if (this.networkRole === 'host') {
      this.powerUpSystem.setNetEventSink((ev) => peerMultiplayer.sendEvent(ev));
    }

    const effectiveBattleMode = this.onlineConfig
      ? (this.onlineConfig.battleMode ?? 'classic')
      : s.battleMode;
    const effectiveMaxHp = this.onlineConfig
      ? (this.onlineConfig.maxArmorHp ?? 100)
      : s.maxArmorHp;
    const effectiveTntOpt = this.onlineConfig
      ? (this.onlineConfig.tntBarrelsOption ?? 'auto')
      : s.tntBarrelsOption;
    this.battleRules = resolveEffectiveBattleModeRules(
      effectiveBattleMode,
      effectiveMaxHp,
      effectiveTntOpt,
    );

    this.tanks = this.activePlayers.map((pCfg, idx) => {
      const spawn = this.arena.spawns[idx % this.arena.spawns.length];
      const tank = new Tank(this, pCfg, spawn, this.arena.scaleRatio);
      tank.configureArmorMode(this.battleRules.hasArmorHp, this.battleRules.maxHp);
      return tank;
    });
    resolveAllTankCollisions(
      this.tanks.map((t) => t.kinematics),
      this.arena.walls,
    );

    this.tntBarrelSystem = new TntBarrelSystem(this, this.arena, this.effectsSystem, () =>
      this.redrawWallLayer(),
    );
    if (this.battleRules.hasTntBarrels && this.networkRole !== 'guest') {
      this.tntBarrelSystem.spawnInitialBarrels(this.tanks, roundSeed);
    }

    this.nightVisionSystem = new NightVisionSystem(this, this.arena, this.battleRules.isNightOps);
    this.aiSystem = new AISystem(this.activePlayers, roundSeed);

    for (const t of this.tanks) t.syncVisuals();
    this.nightVisionSystem.updateAndRender(
      0,
      this.getNightVisionViewerTanks(),
      this.projectileSystem.getKinematicsList(),
      this.powerUpSystem.getCrateStates(),
      this.tntBarrelSystem.getBarrelStates(),
      this.tanks,
    );
    this.inputSystem = new InputSystem(this.roster);
    this.inputSystem.attach();
    this.inputSystem.onPauseRequested(() => {
      if (this.getEffectivePhase() !== 'match_over') {
        this.setPaused(!this.isPaused);
      }
    });

    this.matchSystem = new MatchSystem(this.scoreManager, {
      onCountdownStep: (label) => {
        this.events.emit('countdown-step', label);
        if (this.networkRole === 'host') {
          peerMultiplayer.sendEvent({ kind: 'countdown_step', label });
        }
      },
      onFightStart: () => {
        for (const t of this.tanks) t.setCountdownHighlight(false);
        this.events.emit('fight-start');
        if (this.networkRole === 'host') {
          peerMultiplayer.sendEvent({ kind: 'fight_start' });
          this.broadcastHostWorldSnapshot();
        }
      },
      onRoundResolved: (summary: RoundResultSummary) => {
        this.emitHudSync();
        this.events.emit('round-resolved', summary);
        if (this.networkRole === 'host') {
          peerMultiplayer.sendEvent({ kind: 'round_resolved', summary });
          this.broadcastHostWorldSnapshot();
        }
      },
      onAdvanceNextRound: () => {
        const rem = this.powerUpSystem.getRemainingSpawnTimer();
        const fallbackSec = this.onlineConfig
          ? this.onlineConfig.powerUpSpawnIntervalSec
          : settingsManager.getSettings().powerUpSpawnIntervalSec;
        this.matchCrateTimerSec = rem > 0 ? rem : Math.max(1, fallbackSec || 20);
        if (this.networkRole === 'host' && this.onlineConfig) {
          const nextRound = this.scoreManager.getRoundNumber();
          const nextGrid = peerMultiplayer.buildAuthoritativeRoundGrid(
            this.onlineConfig.mapMode,
            nextRound,
            this.matchBaseSeed,
          );
          const nextViewport =
            this.onlineConfig.authoritativeViewport ??
            resolveOnlineArenaViewport(
              Boolean(this.onlineConfig.hostTouchActive),
              Boolean(this.onlineConfig.guestTouchActive),
            );
          this.onlineConfig.authoritativeRound = nextRound;
          this.onlineConfig.authoritativeGrid = nextGrid;
          this.onlineConfig.authoritativeViewport = { ...nextViewport };
          peerMultiplayer.sendEvent({
            kind: 'advance_round',
            roundNumber: nextRound,
            crateTimerSec: this.matchCrateTimerSec,
            grid: nextGrid,
            viewport: { ...nextViewport },
          });
        }
        this.scene.restart({
          freshMatch: false,
          onlineMatch: this.onlineConfig ?? undefined,
        });
      },
      onMatchVictory: (summary: RoundResultSummary) => {
        if (this.networkRole === 'host') {
          peerMultiplayer.sendEvent({ kind: 'match_victory', summary });
        }
        this.scene.stop('UIScene');
        this.scene.start('ResultScene', {
          summary,
          players: this.activePlayers,
        });
      },
    });

    if (!this.scene.isActive('UIScene')) {
      this.scene.launch('UIScene');
    }
    this.scene.bringToTop('UIScene');

    this.time.delayedCall(0, () => {
      this.emitHudSync();
      if (this.networkRole !== 'guest') {
        this.matchSystem.startRoundCountdown();
        if (this.networkRole === 'host') {
          this.broadcastHostWorldSnapshot();
        }
      } else {
        this.guestRoundPhase = 'countdown';
      }
    });

    this.registerDiagnostics();

    if (this.networkRole === 'host') {
      peerMultiplayer.setHostArenaSyncResponder((requestedRound) => {
        if (requestedRound !== this.scoreManager.getRoundNumber() || !this.arena) return;
        const vp = this.onlineConfig?.authoritativeViewport ?? {
          maxWidth: this.arena.width + 24,
          maxHeight: this.arena.height + 20,
          centerX: Math.round(this.arena.originX + this.arena.width / 2),
          centerY: Math.round(this.arena.originY + this.arena.height / 2),
        };
        peerMultiplayer.sendEvent({
          kind: 'arena_resync',
          roundNumber: this.scoreManager.getRoundNumber(),
          grid: this.arena.grid,
          viewport: vp,
        });
      });
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      if (this.networkRole === 'host') {
        peerMultiplayer.setHostArenaSyncResponder(null);
      }
      this.cleanupSceneResources();
    });
  }

  private getEffectivePhase(): RoundPhase {
    return this.networkRole === 'guest' ? this.guestRoundPhase : this.matchSystem.getPhase();
  }

  private getTouchOverlay() {
    if (!this.scene.isActive('UIScene')) return null;
    return (this.scene.get('UIScene') as UIScene).getTouchOverlay();
  }

  private readMergedLocalHumanInput(
    tank: Tank,
    primarySlot: PlayerIndex,
    allowSecondaryKeys: boolean,
    touchSlot: 0 | 1 | null = 0,
  ): PlayerInputState {
    const kb1 = this.inputSystem.readPlayerState(primarySlot);
    let forward = kb1.forward;
    let backward = kb1.backward;
    let left = kb1.left;
    let right = kb1.right;
    let firePressed = kb1.firePressed;
    let fireHeld = Boolean(kb1.fireHeld);
    let fireBufferedUntil = kb1.fireBufferedUntil;

    if (allowSecondaryKeys) {
      const altSlot: PlayerIndex = primarySlot === 0 ? 1 : 0;
      const kb2 = this.inputSystem.readPlayerState(altSlot);
      forward = forward || kb2.forward;
      backward = backward || kb2.backward;
      left = left || kb2.left;
      right = right || kb2.right;
      firePressed = firePressed || kb2.firePressed;
      fireHeld = fireHeld || Boolean(kb2.fireHeld);
      fireBufferedUntil = Math.max(fireBufferedUntil, kb2.fireBufferedUntil);
    }

    if (firePressed) {
      this.localKeyboardFireSeq++;
    }

    const touch = this.getTouchOverlay();
    if (touch && touch.isVisible() && touchSlot !== null) {
      const tState = touch.readPlayerInput(touchSlot, tank.kinematics.angle);
      forward = forward || tState.forward;
      backward = backward || tState.backward;
      left = left || tState.left;
      right = right || tState.right;
      firePressed = firePressed || tState.firePressed;
      fireHeld = fireHeld || Boolean(tState.fireHeld);
      fireBufferedUntil = Math.max(fireBufferedUntil, tState.fireBufferedUntil);
    }

    return {
      forward,
      backward,
      left,
      right,
      firePressed,
      fireHeld,
      fireBufferedUntil,
    };
  }

  private consumeMergedLocalFire(
    primarySlot: PlayerIndex,
    allowSecondaryKeys: boolean,
    touchSlot: 0 | 1 | null = 0,
  ): boolean {
    if (this.inputSystem.consumeBufferedFire(primarySlot)) return true;
    if (allowSecondaryKeys) {
      const altSlot: PlayerIndex = primarySlot === 0 ? 1 : 0;
      if (this.inputSystem.consumeBufferedFire(altSlot)) return true;
    }
    const touch = this.getTouchOverlay();
    if (touch && touch.isVisible() && touchSlot !== null && touch.consumePlayerBufferedFire(touchSlot)) {
      return true;
    }
    return false;
  }

  private eliminateTankWithExplosion(victim: Tank): boolean {
    if (!victim.kinematics.alive || victim.isShielded()) return false;
    victim.eliminate();
    audioManager.playTankExplosion();
    this.effectsSystem.emitTankExplosion(
      victim.kinematics.x,
      victim.kinematics.y,
      victim.palette,
    );
    this.nightVisionSystem?.triggerExplosionFlash(victim.kinematics.x, victim.kinematics.y, 280);
    if (this.networkRole === 'host') {
      peerMultiplayer.sendEvent({
        kind: 'tank_eliminated',
        victimIndex: victim.index,
        x: victim.kinematics.x,
        y: victim.kinematics.y,
      });
    }
    return true;
  }

  private applyCombatHitToTank(
    victim: Tank,
    source: DamageSourceKind,
    hitX: number,
    hitY: number,
    explicitDamage?: number,
  ): boolean {
    if (!victim.kinematics.alive || victim.isShielded()) return false;
    // EMP & Cryo are non-lethal tactical disables in Classic 1-hit mode (shooter finishes them off!)
    if (
      !victim.hasArmorHpEnabled() &&
      (source === 'emp_orb' || source === 'emp_blast' || source === 'cryo_orb')
    ) {
      return false;
    }
    const dmg = explicitDamage ?? computeWeaponDamage(source);
    const continuous =
      source === 'flame'
        ? 'flame'
        : source === 'reaper'
          ? 'reaper'
          : source === 'ground_spike'
            ? 'ground_spike'
            : undefined;
    const res = victim.applyArmorDamage(dmg, continuous);
    if (!res.applied) return false;

    if (res.lethal) {
      return this.eliminateTankWithExplosion(victim);
    }

    audioManager.playWallBounce(2);
    const ratio = victim.getHpRatio();
    this.effectsSystem.emitArmorHitImpact(hitX, hitY, victim.palette.primary, ratio);
    this.nightVisionSystem?.triggerMuzzleFlashLight(hitX, hitY, false);
    if (this.networkRole === 'host') {
      peerMultiplayer.sendEvent({
        kind: 'armor_hit',
        victimIndex: victim.index,
        x: Math.round(hitX),
        y: Math.round(hitY),
        hpRatio: Number(ratio.toFixed(2)),
      });
    }
    return true;
  }

  update(_time: number, deltaMs: number): void {
    const nowMs = performance.now();
    if (this.lastFrameTimeMs === 0) {
      this.lastFrameTimeMs = nowMs;
    }
    const wallElapsedSec = (nowMs - this.lastFrameTimeMs) / 1000;
    this.lastFrameTimeMs = nowMs;

    // In offline mode, pause freezes simulation; in online mode, P2P world keeps ticking smoothly!
    if (this.isPaused && this.networkRole === 'offline') {
      this.inputSystem.endFrame();
      return;
    }

    const rawSec = wallElapsedSec > 0 ? wallElapsedSec : deltaMs / 1000;
    const totalDt = Math.min(Math.max(rawSec, 1 / 240), 0.085);
    this.inputSystem.advanceClock(totalDt);
    this.getTouchOverlay()?.advanceClock(totalDt);

    if (this.networkRole === 'guest') {
      this.updateOnlineGuestFrame(totalDt);
      this.effectsSystem.update(totalDt);
      this.inputSystem.endFrame();
      return;
    }

    const phase = this.matchSystem.getPhase();
    if (phase === 'countdown') {
      this.countdownPulse += totalDt;
      for (const t of this.tanks) {
        t.setCountdownHighlight(true, this.countdownPulse);
      }
    }

    const humanCountOffline =
      this.networkRole === 'offline'
        ? this.activePlayers.filter((p) => !p.isAI).length
        : 1;

    if (this.matchSystem.isSimulationActive()) {
      let hudDirty = false;

      const touch = this.getTouchOverlay();
      const dualOppositeTouch = Boolean(
        this.networkRole === 'offline' && touch?.isVisible() && touch.isDualOppositeMode(),
      );

      const frameInputs: PlayerInputState[] = this.tanks.map((t) => {
        if (this.networkRole === 'host') {
          return t.index === 0
            ? this.readMergedLocalHumanInput(t, 0, true, 0)
            : peerMultiplayer.readGuestInputOnHost();
        }
        if (this.aiSystem.isAIControlled(t.index)) {
          return this.aiSystem.computeInputForTank(
            t,
            totalDt,
            phase,
            this.tanks,
            this.arena,
            this.projectileSystem,
            this.powerUpSystem,
            this.tntBarrelSystem.getBarrelStates(),
          );
        }
        if (dualOppositeTouch && (t.index === 0 || t.index === 1)) {
          return this.readMergedLocalHumanInput(t, t.index, false, t.index);
        }
        const isLocalTouchTarget = t.index === 0 || humanCountOffline === 1;
        return isLocalTouchTarget
          ? this.readMergedLocalHumanInput(t, t.index, humanCountOffline === 1, 0)
          : this.inputSystem.readPlayerState(t.index);
      });

      for (let i = 0; i < this.tanks.length; i++) {
        const tank = this.tanks[i];
        const isBot = this.networkRole === 'offline' && this.aiSystem.isAIControlled(tank.index);
        const fireRes = this.powerUpSystem.tryHandlePlayerFire(
          tank,
          this.arena.walls,
          Boolean(frameInputs[i].fireHeld),
          () => {
            if (this.networkRole === 'host') {
              return tank.index === 0
                ? this.consumeMergedLocalFire(0, true, 0)
                : peerMultiplayer.consumeGuestBufferedFireOnHost();
            }
            if (isBot) {
              return this.aiSystem.consumeBufferedFire(tank.index);
            }
            if (dualOppositeTouch && (tank.index === 0 || tank.index === 1)) {
              return this.consumeMergedLocalFire(tank.index, false, tank.index);
            }
            const isLocalTouchTarget = tank.index === 0 || humanCountOffline === 1;
            return isLocalTouchTarget
              ? this.consumeMergedLocalFire(tank.index, humanCountOffline === 1, 0)
              : this.inputSystem.consumeBufferedFire(tank.index);
          },
          this.tanks,
        );
        if (fireRes.fired) {
          const muzzle = tank.getMuzzleWorldPos();
          this.nightVisionSystem.triggerMuzzleFlashLight(
            muzzle.x,
            muzzle.y,
            Boolean(tank.getEquippedSkill()),
          );
        }
        if (fireRes.hudDirty) {
          hudDirty = true;
        }
      }

      const prevTotalProjectiles = this.projectileSystem.getTotalActiveCount();
      const maxSubStep = 1 / 60;
      const steps = Math.max(1, Math.ceil(totalDt / maxSubStep));
      const subDt = totalDt / steps;

      for (let step = 0; step < steps; step++) {
        for (let i = 0; i < this.tanks.length; i++) {
          const tank = this.tanks[i];
          if (!tank.kinematics.alive) continue;
          if (
            tank.isChargingLaser() ||
            tank.isShielded() ||
            tank.isPhantom() ||
            tank.isReaperSweeping()
          ) {
            hudDirty = true;
          }
          const stateChanges = tank.updateMovement(
            frameInputs[i],
            subDt,
            (tx, ty, ang) => this.effectsSystem.stampTreadMark(tx, ty, ang),
            (ex, ey) => this.effectsSystem.emitExhaustPuff(ex, ey),
          );
          if (stateChanges.emitCriticalDamage) {
            this.effectsSystem.emitCriticalHullDamageTick(
              tank.kinematics.x,
              tank.kinematics.y,
              tank.getHpRatio(),
            );
          }
          if (stateChanges.frozeFromCryoZone) {
            audioManager.playCryoShatter();
            this.effectsSystem.emitTankFrozen(tank.kinematics.x, tank.kinematics.y);
            hudDirty = true;
          }
          if (stateChanges.frozenJustExpired) {
            audioManager.playCryoShatter();
            this.effectsSystem.emitIceBlockShatter(tank.kinematics.x, tank.kinematics.y);
            hudDirty = true;
          }
          if (
            this.matchSystem.getPhase() === 'playing' &&
            tank.consumeEmpMisfireTrigger() &&
            this.projectileSystem.getRemainingAmmo(tank.index) > 0
          ) {
            const shot = this.projectileSystem.tryFireFromTank(tank, this.arena.walls);
            if (shot.fired) {
              audioManager.playFire();
              this.effectsSystem.emitMuzzleFlash(shot.muzzleX, shot.muzzleY, tank.kinematics.angle);
              this.effectsSystem.emitEmpJammedTick(shot.muzzleX, shot.muzzleY);
              if (this.networkRole === 'host') {
                peerMultiplayer.sendEvent({
                  kind: 'muzzle_fx',
                  variant: 'standard',
                  x: shot.muzzleX,
                  y: shot.muzzleY,
                  angle: tank.kinematics.angle,
                });
              }
              hudDirty = true;
            }
          }
          if (stateChanges.phantomJustExpired) {
            ejectTankFromInteriorWalls(tank.kinematics, this.arena);
            this.effectsSystem.emitPhantomExit(tank.kinematics.x, tank.kinematics.y);
          }
          if (
            stateChanges.shieldJustExpired ||
            stateChanges.phantomJustExpired ||
            stateChanges.reaperJustEnded
          ) {
            this.effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
            hudDirty = true;
          }
        }

        if (this.perimeterWalls.length === 0) {
          this.perimeterWalls = computeArenaPerimeterWalls(this.arena);
        }
        const phantomIndices = new Set<number>(
          this.tanks.filter((t) => t.isPhantom()).map((t) => t.index),
        );
        resolveAllTankCollisions(
          this.tanks.map((t) => t.kinematics),
          this.arena.walls,
          phantomIndices,
          this.perimeterWalls,
        );
        this.tntBarrelSystem.resolveTankCollisions(this.tanks);

        const preRes = this.powerUpSystem.preProjectileSubStep(
          subDt,
          this.tanks,
          this.matchSystem.getPhase(),
          (victim, source) => {
            if (this.applyCombatHitToTank(victim, source, victim.kinematics.x, victim.kinematics.y)) {
              hudDirty = true;
            }
          },
          (beamPts) => {
            this.nightVisionSystem.triggerLaserFlashCorridor(beamPts);
            for (let pIdx = 0; pIdx < beamPts.length - 1; pIdx++) {
              this.tntBarrelSystem.triggerBarrelsAlongSegment(
                beamPts[pIdx].x,
                beamPts[pIdx].y,
                beamPts[pIdx + 1].x,
                beamPts[pIdx + 1].y,
                this.tanks,
                (vIdx, dmg) => {
                  const vt = this.tanks.find((t) => t.index === vIdx);
                  if (vt && this.applyCombatHitToTank(vt, 'tnt_barrel', vt.kinematics.x, vt.kinematics.y, dmg)) {
                    hudDirty = true;
                  }
                },
                (bx, by, br) => {
                  this.nightVisionSystem.triggerExplosionFlash(bx, by, br * 2.2);
                  if (this.networkRole === 'host') {
                    peerMultiplayer.sendEvent({ kind: 'barrel_blast', x: bx, y: by, blastRadius: br });
                  }
                },
              );
            }
          },
        );
        if (preRes.hudDirty) hudDirty = true;

        const simEvents = this.projectileSystem.update(
          subDt,
          this.tanks,
          this.arena.walls,
          (px, py, variant, ownerIndex) => {
            this.effectsSystem.emitShellExpire(px, py);
            this.nightVisionSystem.triggerFlareExpireEmber(px, py);
            this.powerUpSystem.handleProjectileExpired(px, py, variant, ownerIndex, this.tanks);
          },
          (proj, hx, hy) => this.powerUpSystem.handleDrillWallImpact(proj, hx, hy),
        );

        for (const b of simEvents.bounces) {
          audioManager.playWallBounce(b.bounces);
          this.effectsSystem.emitWallBounce(b.x, b.y);
          this.powerUpSystem.checkBarrierBounceRipple(b.x, b.y);
          this.nightVisionSystem.triggerFlareBounceFlash(b.x, b.y);
          if (this.networkRole === 'host') {
            peerMultiplayer.sendEvent({
              kind: 'wall_bounce',
              x: Math.round(b.x),
              y: Math.round(b.y),
              bounces: b.bounces,
            });
          }
        }

        for (const hit of simEvents.hits) {
          const victim = this.tanks.find((t) => t.index === hit.victimIndex);
          const proj = this.projectileSystem.getProjectileById(hit.projectileId);
          const variant = proj?.kinematics.variant ?? 'standard';
          if (victim) {
            if (victim.isShielded()) {
              audioManager.playShieldDeflect();
              this.effectsSystem.emitShieldDeflect(hit.x, hit.y);
            } else if (this.applyCombatHitToTank(victim, variant, hit.x, hit.y)) {
              hudDirty = true;
            }
          }
        }

        if (
          this.tntBarrelSystem.updateSubStep(
            subDt,
            this.tanks,
            this.projectileSystem,
            (vIdx, dmg) => {
              const vt = this.tanks.find((t) => t.index === vIdx);
              if (vt && this.applyCombatHitToTank(vt, 'tnt_barrel', vt.kinematics.x, vt.kinematics.y, dmg)) {
                hudDirty = true;
              }
            },
            (bx, by, br) => {
              this.nightVisionSystem.triggerExplosionFlash(bx, by, br * 2.2);
              if (this.networkRole === 'host') {
                peerMultiplayer.sendEvent({ kind: 'barrel_blast', x: bx, y: by, blastRadius: br });
              }
            },
          )
        ) {
          hudDirty = true;
        }

        if (
          this.powerUpSystem.postProjectileSubStep(
            subDt,
            this.tanks,
            simEvents.hits,
            (victim, source) => {
              if (this.applyCombatHitToTank(victim, source, victim.kinematics.x, victim.kinematics.y)) {
                hudDirty = true;
              }
            },
          )
        ) {
          hudDirty = true;
        }
      }

      for (const t of this.tanks) t.syncVisuals();
      this.powerUpSystem.syncVisuals(totalDt, this.tanks);

      if (this.projectileSystem.getTotalActiveCount() !== prevTotalProjectiles) {
        hudDirty = true;
      }

      if (hudDirty) {
        this.emitHudSync();
      }
    } else if (phase === 'round_end') {
      const steps = Math.max(1, Math.ceil(totalDt / (1 / 60)));
      const subDt = totalDt / steps;
      for (let step = 0; step < steps; step++) {
        const simEvents = this.projectileSystem.update(
          subDt,
          this.tanks,
          this.arena.walls,
          (px, py) => this.effectsSystem.emitShellExpire(px, py),
          (proj, hx, hy) => this.powerUpSystem.handleDrillWallImpact(proj, hx, hy),
        );
        for (const b of simEvents.bounces) {
          audioManager.playWallBounce(b.bounces);
          this.effectsSystem.emitWallBounce(b.x, b.y);
        }
      }
      this.powerUpSystem.syncVisuals(totalDt, this.tanks);
    }

    this.tntBarrelSystem.syncVisuals(totalDt);
    this.nightVisionSystem.updateAndRender(
      totalDt,
      this.getNightVisionViewerTanks(),
      this.projectileSystem.getKinematicsList(),
      this.powerUpSystem.getCrateStates(),
      this.tntBarrelSystem.getBarrelStates(),
      this.tanks,
      {
        cryoZones: this.powerUpSystem.getCryoZoneStates(),
        barriers: this.powerUpSystem.getBarrierStates(),
        warpBeacons: this.powerUpSystem.getWarpBeaconStates(),
      },
    );
    this.matchSystem.update(totalDt, this.tanks);
    this.effectsSystem.update(totalDt);

    if (this.networkRole === 'host') {
      this.hostSnapshotAccumulator += totalDt;
      if (this.hostSnapshotAccumulator >= 1 / 30) {
        this.hostSnapshotAccumulator = 0;
        this.broadcastHostWorldSnapshot();
      }
    }

    this.inputSystem.endFrame();
  }

  private broadcastHostWorldSnapshot(): void {
    if (this.networkRole !== 'host' || !peerMultiplayer.isActive()) return;
    const entities = this.powerUpSystem.getNetworkWorldEntities();
    const activeProjs = this.projectileSystem
      .getPool()
      .filter((p) => p.kinematics.active)
      .map((p) => {
        const k = p.kinematics;
        return {
          id: k.id,
          ownerIndex: k.ownerIndex,
          x: Math.round(k.x * 10) / 10,
          y: Math.round(k.y * 10) / 10,
          vx: Math.round(k.vx * 10) / 10,
          vy: Math.round(k.vy * 10) / 10,
          radius: Math.round(k.radius * 10) / 10,
          age: Math.round(k.age * 100) / 100,
          maxLifetime: k.maxLifetime,
          variant: k.variant ?? 'standard',
        };
      });

    peerMultiplayer.sendWorldSnapshot({
      roundNumber: this.scoreManager.getRoundNumber(),
      arenaKey: `${this.arena.grid.cols}x${this.arena.grid.rows}@${this.arena.originX},${this.arena.originY},${this.arena.cellSize}`,
      phase: this.matchSystem.getPhase(),
      scores: [this.scoreManager.getScore(0), this.scoreManager.getScore(1)],
      ties: this.scoreManager.getTies(),
      crateTimerSec: Math.round(this.powerUpSystem.getRemainingSpawnTimer() * 10) / 10,
      tanks: this.tanks.map((t) => {
        const sk = t.getSkillState();
        return {
          index: t.index,
          x: Math.round(t.kinematics.x * 10) / 10,
          y: Math.round(t.kinematics.y * 10) / 10,
          vx: Math.round(t.kinematics.vx * 10) / 10,
          vy: Math.round(t.kinematics.vy * 10) / 10,
          angle: Math.round(t.kinematics.angle * 1000) / 1000,
          alive: t.kinematics.alive,
          ammo: this.projectileSystem.getRemainingAmmo(t.index),
          hp: t.getHp(),
          maxHp: t.getMaxHp(),
          hasArmor: t.hasArmorHpEnabled(),
          skill: sk.skill,
          skillAmmo: sk.ammo,
          chargingLaserRemaining: Math.round(sk.chargingLaserRemaining * 100) / 100,
          reaperWindupRemaining: Math.round((sk.reaperWindupRemaining ?? 0) * 100) / 100,
          reaperDeployRemaining: Math.round((sk.reaperDeployRemaining ?? 0) * 100) / 100,
          reaperSpinRemaining: Math.round((sk.reaperSpinRemaining ?? 0) * 100) / 100,
          shieldRemaining: Math.round(t.getShieldRemainingSec() * 100) / 100,
          phantomRemaining: Math.round(t.getPhantomRemainingSec() * 100) / 100,
          empJamRemaining: Math.round(t.getEmpJamRemainingSec() * 100) / 100,
          frozenRemaining: Math.round(t.getFrozenRemainingSec() * 100) / 100,
          cryoChillRatio: Math.round(t.getCryoChillRatio() * 100) / 100,
          onIceFloor: t.isOnIceFloor(),
          warpBeaconPlaced: Boolean(sk.warpBeaconPlaced),
        };
      }),
      projectiles: activeProjs,
      crates: entities.crates,
      mines: entities.mines,
      spikeZones: entities.spikeZones,
      cryoZones: entities.cryoZones,
      barriers: entities.barriers,
      warpBeacons: entities.warpBeacons,
      barrels: this.tntBarrelSystem.getNetworkSnapshots(),
    });
  }

  private updateOnlineGuestFrame(dt: number): void {
    // 1. Stream Guest (`XE 2`) input to Host (`WASD + Space`, `Arrows + Enter`, and Mobile Touch!)
    const guestTank = this.tanks[1] ?? this.tanks[0];
    if (guestTank && !this.isPaused) {
      const merged = this.readMergedLocalHumanInput(guestTank, 1, true);
      const touchFireCount = this.getTouchOverlay()?.getFirePressCount() ?? 0;
      peerMultiplayer.sendGuestInput({
        forward: merged.forward,
        backward: merged.backward,
        left: merged.left,
        right: merged.right,
        fireHeld: Boolean(merged.fireHeld),
        firePressCount: this.localKeyboardFireSeq + touchFireCount,
      });
    }

    // 2. Process discrete reliable Host events (explosions, laser, carved walls, round advance, rematch)
    const events = peerMultiplayer.drainPendingEventsOnGuest();
    for (const ev of events) {
      if (this.handleGuestNetEvent(ev)) {
        // Scene restarted or transitioned!
        return;
      }
    }

    // 3. Reconcile latest Host WorldSnapshot (or smoothly dead-reckon between snapshots)
    const snap = peerMultiplayer.consumeLatestSnapshotOnGuest();
    if (snap) {
      if (snap.roundNumber !== this.scoreManager.getRoundNumber()) {
        while (this.scoreManager.getRoundNumber() < snap.roundNumber) {
          this.scoreManager.advanceToNextRound();
        }
        this.scene.restart({
          freshMatch: false,
          onlineMatch: this.onlineConfig ?? undefined,
        });
        return;
      }

      if (snap.arenaKey) {
        const localKey = `${this.arena.grid.cols}x${this.arena.grid.rows}@${this.arena.originX},${this.arena.originY},${this.arena.cellSize}`;
        if (snap.arenaKey !== localKey) {
          peerMultiplayer.requestArenaSyncFromHost(snap.roundNumber);
        }
      }

      this.guestRoundPhase = snap.phase;
      this.scoreManager.syncFromNetwork(snap.scores, snap.ties, snap.roundNumber);

      for (const tSnap of snap.tanks) {
        const tank = this.tanks.find((t) => t.index === tSnap.index);
        if (tank) {
          tank.applyNetworkSnapshot(tSnap, dt);
        }
      }
      this.projectileSystem.applyNetworkProjectiles(snap.projectiles, dt);
      this.powerUpSystem.applyNetworkWorldEntities(
        snap.crates,
        snap.mines,
        snap.spikeZones,
        snap.cryoZones,
        snap.barriers,
        snap.warpBeacons,
      );
      if (snap.barrels) {
        this.tntBarrelSystem.applyNetworkSnapshots(snap.barrels);
      }
      this.emitHudSync();
    } else {
      for (const t of this.tanks) t.stepGuestDeadReckoning(dt);
      this.projectileSystem.stepGuestExtrapolation(dt);
    }

    if (this.guestRoundPhase === 'countdown') {
      this.countdownPulse += dt;
      for (const t of this.tanks) t.setCountdownHighlight(true, this.countdownPulse);
    } else {
      for (const t of this.tanks) t.setCountdownHighlight(false);
    }

    for (const t of this.tanks) t.syncVisuals();
    this.powerUpSystem.syncVisuals(dt, this.tanks);
    this.tntBarrelSystem.syncVisuals(dt);
    this.nightVisionSystem.updateAndRender(
      dt,
      this.getNightVisionViewerTanks(),
      this.projectileSystem.getKinematicsList(),
      this.powerUpSystem.getCrateStates(),
      this.tntBarrelSystem.getBarrelStates(),
      this.tanks,
      {
        cryoZones: this.powerUpSystem.getCryoZoneStates(),
        barriers: this.powerUpSystem.getBarrierStates(),
        warpBeacons: this.powerUpSystem.getWarpBeaconStates(),
      },
    );
  }

  private getNightVisionViewerTanks(): Tank[] {
    if (this.networkRole === 'host') {
      return this.tanks.filter((t) => t.index === 0);
    }
    if (this.networkRole === 'guest') {
      return this.tanks.filter((t) => t.index === 1);
    }
    const humanTanks = this.tanks.filter((t) => !this.aiSystem.isAIControlled(t.index));
    return humanTanks.length > 0 ? humanTanks : this.tanks;
  }

  private handleGuestNetEvent(ev: NetGameEvent): boolean {
    switch (ev.kind) {
      case 'countdown_step':
        this.events.emit('countdown-step', ev.label);
        return false;

      case 'fight_start':
        this.guestRoundPhase = 'playing';
        for (const t of this.tanks) t.setCountdownHighlight(false);
        this.events.emit('fight-start');
        return false;

      case 'muzzle_fx':
        if (ev.variant === 'gatling') {
          audioManager.playGatlingFire();
          this.effectsSystem.emitGatlingMuzzle(ev.x, ev.y, ev.angle);
        } else if (ev.variant === 'flame') {
          audioManager.playFlameSpray();
          this.effectsSystem.emitFlameMuzzle(ev.x, ev.y, ev.angle);
        } else if (ev.variant === 'scatter') {
          audioManager.playScatterShot();
          this.effectsSystem.emitScatterMuzzle(ev.x, ev.y, ev.angle);
        } else if (ev.variant === 'emp_orb') {
          audioManager.playEmpLaunch();
          this.effectsSystem.emitEmpMuzzle(ev.x, ev.y, ev.angle);
        } else if (ev.variant === 'cryo_orb') {
          audioManager.playCryoShot();
          this.effectsSystem.emitCryoMuzzle(ev.x, ev.y, ev.angle);
        } else {
          audioManager.playFire();
          this.effectsSystem.emitMuzzleFlash(ev.x, ev.y, ev.angle);
        }
        return false;

      case 'wall_bounce':
        audioManager.playWallBounce(ev.bounces);
        this.effectsSystem.emitWallBounce(ev.x, ev.y);
        this.nightVisionSystem.triggerFlareBounceFlash(ev.x, ev.y);
        return false;

      case 'wall_drilled': {
        const res = drillMazeWallAtPoint(this.arena, ev.hitX, ev.hitY);
        if (res.carved) {
          audioManager.playWallDrill();
          this.effectsSystem.emitWallDrilled(res.breakX, res.breakY);
          this.redrawWallLayer();
        }
        return false;
      }

      case 'laser_blast':
        audioManager.playLaserBlast();
        this.effectsSystem.emitLaserBeamBlast(ev.points, ev.victims);
        this.nightVisionSystem.triggerLaserFlashCorridor(ev.points);
        return false;

      case 'armor_hit': {
        const victim = this.tanks.find((t) => t.index === ev.victimIndex);
        audioManager.playWallBounce(2);
        this.effectsSystem.emitArmorHitImpact(
          ev.x,
          ev.y,
          victim ? victim.palette.primary : 0xffca28,
          ev.hpRatio,
        );
        this.nightVisionSystem.triggerMuzzleFlashLight(ev.x, ev.y, false);
        return false;
      }

      case 'barrel_blast':
        audioManager.playTankExplosion();
        this.effectsSystem.emitTntBarrelExplosion(ev.x, ev.y, ev.blastRadius);
        this.nightVisionSystem.triggerExplosionFlash(ev.x, ev.y, ev.blastRadius * 2.2);
        return false;

      case 'shield_fx':
        if (ev.sub === 'activate') {
          audioManager.playShieldActivate();
          this.effectsSystem.emitShieldActivate(ev.x, ev.y);
        } else {
          audioManager.playShieldDeflect();
          this.effectsSystem.emitShieldDeflect(ev.x, ev.y);
        }
        return false;

      case 'crate_fx':
        if (ev.sub === 'spawn') {
          audioManager.playCrateSpawn();
          this.effectsSystem.emitCrateSpawn(ev.x, ev.y);
        } else if (ev.skillId) {
          const desc = getSkillDescriptor(ev.skillId);
          audioManager.playPowerUpEquip();
          this.effectsSystem.emitCratePickup(
            ev.x,
            ev.y,
            desc.name,
            desc.accentHex,
            desc.accentColor,
          );
        }
        return false;

      case 'hazard_fx':
        if (ev.sub === 'spike_burst') {
          audioManager.playSpikeBurst();
          this.effectsSystem.emitSpikeDetonation(ev.x, ev.y);
        } else if (ev.sub === 'mine_deploy') {
          audioManager.playMineDeploy();
          this.effectsSystem.emitMineDeploy(ev.x, ev.y);
        } else if (ev.sub === 'mine_blast') {
          audioManager.playTankExplosion();
          this.effectsSystem.emitMineExplosion(ev.x, ev.y);
        } else if (ev.sub === 'reaper_unfurl') {
          this.effectsSystem.emitReaperUnfurlBurst(ev.x, ev.y);
        } else if (ev.sub === 'bullet_burned') {
          this.effectsSystem.emitBulletIncinerated(ev.x, ev.y);
        } else if (ev.sub === 'emp_blast') {
          const r = ev.radius ?? this.arena.cellSize * POWERUP_CONFIG.empBlastCellsRadius;
          audioManager.playEmpBlast();
          this.effectsSystem.emitEmpBlast(ev.x, ev.y, r);
          this.powerUpSystem.triggerEmpCataclysmVisual(ev.x, ev.y, r);
          this.nightVisionSystem.triggerExplosionFlash(ev.x, ev.y, 240);
        } else if (ev.sub === 'phantom_activate') {
          audioManager.playPhantomActivate();
          this.effectsSystem.emitPhantomActivate(ev.x, ev.y);
        } else if (ev.sub === 'cryo_shatter') {
          audioManager.playCryoShatter();
          this.effectsSystem.emitCryoShatter(
            ev.x,
            ev.y,
            ev.radius ?? this.arena.cellSize * POWERUP_CONFIG.cryoZoneCellsRadius,
          );
        } else if (ev.sub === 'barrier_deploy') {
          audioManager.playBarrierDeploy();
          this.effectsSystem.emitBarrierDeploy(ev.x, ev.y, ev.x2 ?? ev.x, ev.y2 ?? ev.y);
        } else if (ev.sub === 'barrier_shatter') {
          audioManager.playCryoShatter();
          this.effectsSystem.emitBarrierShatter(ev.x, ev.y, ev.x2 ?? ev.x, ev.y2 ?? ev.y);
        } else if (ev.sub === 'warp_plant') {
          audioManager.playWarpBeacon();
          this.effectsSystem.emitWarpBeaconPlant(ev.x, ev.y);
        } else if (ev.sub === 'warp_teleport') {
          const br = ev.radius ?? POWERUP_CONFIG.warpBlastRadius * this.arena.scaleRatio;
          const tx = ev.x2 ?? ev.x;
          const ty = ev.y2 ?? ev.y;
          audioManager.playWarpTeleport();
          audioManager.playTankExplosion();
          this.effectsSystem.emitWarpTeleport(ev.x, ev.y, tx, ty, br);
          this.powerUpSystem.triggerWarpCataclysmVisual(ev.x, ev.y, tx, ty, br);
          this.nightVisionSystem.triggerExplosionFlash(ev.x, ev.y, 210);
          this.nightVisionSystem.triggerExplosionFlash(tx, ty, 210);
        }
        return false;

      case 'tank_eliminated': {
        const victim = this.tanks.find((t) => t.index === ev.victimIndex);
        if (victim) {
          victim.eliminate();
          audioManager.playTankExplosion();
          this.effectsSystem.emitTankExplosion(ev.x, ev.y, victim.palette);
          this.emitHudSync();
        }
        return false;
      }

      case 'round_resolved':
        this.guestRoundPhase = 'round_end';
        this.scoreManager.syncFromNetwork(
          ev.summary.scores,
          ev.summary.ties,
          ev.summary.roundNumber,
        );
        this.emitHudSync();
        this.events.emit('round-resolved', ev.summary);
        return false;

      case 'advance_round':
        while (this.scoreManager.getRoundNumber() < ev.roundNumber) {
          this.scoreManager.advanceToNextRound();
        }
        this.matchCrateTimerSec = ev.crateTimerSec;
        if (this.onlineConfig) {
          if (ev.grid) {
            this.onlineConfig.authoritativeRound = ev.roundNumber;
            this.onlineConfig.authoritativeGrid = ev.grid;
          }
          if (ev.viewport) {
            this.onlineConfig.authoritativeViewport = ev.viewport;
          }
        }
        this.scene.restart({
          freshMatch: false,
          onlineMatch: this.onlineConfig ?? undefined,
        });
        return true;

      case 'arena_resync': {
        const curLocalKey = `${this.arena.grid.cols}x${this.arena.grid.rows}@${this.arena.originX},${this.arena.originY},${this.arena.cellSize}`;
        const syncedLayout = buildArenaLayout(ev.grid, 2, this.currentRoundSeed, ev.viewport);
        const syncedKey = `${syncedLayout.grid.cols}x${syncedLayout.grid.rows}@${syncedLayout.originX},${syncedLayout.originY},${syncedLayout.cellSize}`;
        if (curLocalKey === syncedKey) return false;
        while (this.scoreManager.getRoundNumber() < ev.roundNumber) {
          this.scoreManager.advanceToNextRound();
        }
        if (this.onlineConfig) {
          this.onlineConfig.authoritativeRound = ev.roundNumber;
          this.onlineConfig.authoritativeGrid = ev.grid;
          this.onlineConfig.authoritativeViewport = ev.viewport;
        }
        this.scene.restart({
          freshMatch: false,
          onlineMatch: this.onlineConfig ?? undefined,
        });
        return true;
      }

      case 'match_victory':
        this.guestRoundPhase = 'match_over';
        this.scene.stop('UIScene');
        this.scene.start('ResultScene', {
          summary: ev.summary,
          players: this.activePlayers,
        });
        return true;

      case 'rematch_start':
        this.scene.restart({
          freshMatch: true,
          seed: ev.config.matchSeed,
          onlineMatch: ev.config,
        });
        return true;
    }
  }

  setPaused(paused: boolean): void {
    if (this.isPaused === paused) return;
    this.isPaused = paused;
    this.lastFrameTimeMs = 0;
    this.inputSystem.clearAllInputs();
    this.getTouchOverlay()?.clearAllTouches();
    if (this.networkRole === 'offline') {
      if (paused) {
        this.tweens.pauseAll();
      } else {
        this.tweens.resumeAll();
      }
    }
    this.events.emit('pause-changed', paused);
  }

  getIsPaused(): boolean {
    return this.isPaused;
  }

  refreshBindingsFromSettings(): void {
    const s = settingsManager.getSettings();
    this.inputSystem.updateBindings(s.playerBindings);
    if (this.networkRole !== 'guest') {
      this.refreshMatchRulesFromSettings();
    }
  }

  refreshMatchRulesFromSettings(): void {
    const s = settingsManager.getSettings();
    this.scoreManager.setWinningScore(s.winningScore);
    this.powerUpSystem.applyLiveMatchRules({
      spawnIntervalSec: s.powerUpSpawnIntervalSec,
      maxCratesOnFloor: s.maxCratesOnFloor,
      enabledSkills: s.enabledSkills,
    });
    if (this.networkRole === 'host') {
      peerMultiplayer.syncHostSettingsFromManager();
      if (this.onlineConfig) {
        this.onlineConfig.mapMode = s.mapMode;
        this.onlineConfig.battleMode = s.battleMode;
        this.onlineConfig.maxArmorHp = s.maxArmorHp;
        this.onlineConfig.tntBarrelsOption = s.tntBarrelsOption;
        this.onlineConfig.winningScore = s.winningScore;
        this.onlineConfig.powerUpSpawnIntervalSec = s.powerUpSpawnIntervalSec;
        this.onlineConfig.maxCratesOnFloor = s.maxCratesOnFloor;
        this.onlineConfig.enabledSkills = [...s.enabledSkills];
      }
    } else if (this.networkRole === 'offline') {
      this.roster = PlayerManager.buildRoster(s);
      this.activePlayers = this.roster.filter((p) => p.active);
      this.aiSystem.updateSlotConfigs(this.activePlayers, this.currentRoundSeed);
      const updatedRules = resolveEffectiveBattleModeRules(
        s.battleMode,
        s.maxArmorHp,
        s.tntBarrelsOption,
      );
      this.battleRules.mode = updatedRules.mode;
      this.battleRules.isNightOps = updatedRules.isNightOps;
      this.nightVisionSystem?.setEnabled(updatedRules.isNightOps);
    }
    this.emitHudSync();
  }

  dropMysteryCrateNow(): boolean {
    if (this.networkRole === 'guest') return false;
    const spawned = this.powerUpSystem.spawnMysteryCrate(
      undefined,
      undefined,
      this.tanks.map((t) => t.kinematics),
    );
    if (spawned && this.networkRole === 'host') {
      this.broadcastHostWorldSnapshot();
    }
    return spawned !== null;
  }

  restartWholeMatch(): void {
    this.setPaused(false);
    if (this.networkRole === 'host') {
      const cfg = peerMultiplayer.hostTriggerRematch();
      if (cfg) {
        this.scene.restart({ freshMatch: true, seed: cfg.matchSeed, onlineMatch: cfg });
        return;
      }
    }
    this.scene.restart({ freshMatch: true });
  }

  exitToMainMenu(): void {
    this.setPaused(false);
    this.scene.stop('UIScene');
    this.scene.start('MenuScene');
  }

  getHudSnapshot(): HudSnapshot {
    const s = settingsManager.getSettings();
    const isOnline = this.networkRole !== 'offline';
    const crateSec = this.onlineConfig
      ? this.onlineConfig.powerUpSpawnIntervalSec
      : s.powerUpSpawnIntervalSec;
    return {
      roundNumber: this.scoreManager.getRoundNumber(),
      mapName: this.arena.grid.name,
      battleMode: this.battleRules.mode,
      hasArmorHp: this.battleRules.hasArmorHp,
      isNightOps: this.battleRules.isNightOps,
      winningScore: this.scoreManager.getWinningScore(),
      ties: this.scoreManager.getTies(),
      crateIntervalSec: crateSec,
      players: this.tanks.map((t) => ({
        index: t.index,
        name: t.config.name,
        colorId: t.config.colorId,
        isAI: isOnline ? false : Boolean(s.playerIsAI[t.index]),
        aiDifficulty: s.playerAIDifficulty[t.index] ?? 'normal',
        score: this.scoreManager.getScore(t.index),
        ammo: this.projectileSystem ? this.projectileSystem.getRemainingAmmo(t.index) : 10,
        hp: t.getHp(),
        maxHp: t.getMaxHp(),
        alive: t.kinematics.alive,
        skill: t.getEquippedSkill(),
        visualSuit: t.getActiveVisualSuit(),
        skillAmmo: t.getSkillAmmo(),
        laserChargeProgress: t.getLaserChargeProgress(),
        shieldRemaining: t.getShieldRemainingSec(),
        phantomRemaining: t.getPhantomRemainingSec(),
        reaperActive: t.isReaperWindingUp() || t.isReaperSweeping(),
        warpBeaconPlaced: t.isWarpBeaconPlaced(),
        empOrbActive: this.powerUpSystem ? this.powerUpSystem.hasActiveEmpOrb(t.index) : false,
      })),
    };
  }

  private emitHudSync(): void {
    this.events.emit('hud-sync', this.getHudSnapshot());
  }

  private drawArenaEnvironment(): void {
    this.cameras.main.setBackgroundColor(UI_COLORS.menuBg);

    const g = this.add.graphics().setDepth(2);
    this.arenaGraphics = g;

    const { originX, originY, width, height, cellSize } = this.arena;

    g.fillStyle(0x000000, 0.12);
    g.fillRoundedRect(originX - 6 + 4, originY - 6 + 6, width + 12, height + 12, 6);

    g.fillStyle(UI_COLORS.arenaFloor, 1);
    g.fillRect(originX, originY, width, height);

    g.lineStyle(1, UI_COLORS.arenaGridLine, 0.85);
    for (let c = 1; c < this.arena.grid.cols; c++) {
      const gx = originX + c * cellSize;
      g.lineBetween(gx, originY, gx, originY + height);
    }
    for (let r = 1; r < this.arena.grid.rows; r++) {
      const gy = originY + r * cellSize;
      g.lineBetween(originX, gy, originX + width, gy);
    }

    this.wallLayerGraphics = this.add.graphics().setDepth(10);
    this.perimeterWalls = computeArenaPerimeterWalls(this.arena);
    this.redrawWallLayer();
  }

  private redrawWallLayer(): void {
    const wallLayer = this.wallLayerGraphics;
    if (!wallLayer) return;
    wallLayer.clear();

    const { walls } = this.arena;

    wallLayer.fillStyle(0x000000, 0.14);
    for (const w of walls) {
      wallLayer.fillRect(w.minX + 2.5, w.minY + 3.5, w.width, w.height);
    }

    wallLayer.fillStyle(UI_COLORS.wallStroke, 1);
    for (const w of walls) {
      wallLayer.fillRect(w.minX, w.minY, w.width, w.height);
    }

    const borderInset = Math.max(1.2, 1.8 * this.arena.scaleRatio);
    wallLayer.fillStyle(UI_COLORS.wallFill, 1);
    for (const w of walls) {
      wallLayer.fillRect(
        w.minX + borderInset,
        w.minY + borderInset,
        Math.max(1, w.width - borderInset * 2),
        Math.max(1, w.height - borderInset * 2),
      );
    }

    wallLayer.fillStyle(UI_COLORS.wallHighlight, 0.65);
    for (const w of walls) {
      if (w.width > w.height) {
        wallLayer.fillRect(
          w.minX + borderInset,
          w.minY + borderInset,
          Math.max(1, w.width - borderInset * 2),
          1.4,
        );
      }
    }
  }

  private registerDiagnostics(): void {
    const self = this;
    (window as unknown as { __PHASER_GAME_DIAGNOSTICS__?: unknown }).__PHASER_GAME_DIAGNOSTICS__ = {
      get fps() {
        return Math.round(self.game.loop.actualFps);
      },
      get renderer() {
        return self.game.renderer.type === Phaser.WEBGL ? 'WEBGL' : 'CANVAS';
      },
      get phase() {
        return self.getEffectivePhase();
      },
      get networkRole() {
        return self.networkRole;
      },
      get roomCode() {
        return peerMultiplayer.getState().formattedCode;
      },
      get pingMs() {
        return peerMultiplayer.getPingMs();
      },
      get touchActive() {
        return settingsManager.isTouchControlsActive();
      },
      get arenaBounds() {
        return {
          originX: self.arena?.originX ?? 0,
          originY: self.arena?.originY ?? 0,
          width: self.arena?.width ?? 0,
          height: self.arena?.height ?? 0,
        };
      },
      get paused() {
        return self.isPaused;
      },
      get round() {
        return self.scoreManager?.getRoundNumber() ?? 1;
      },
      get mapId() {
        return self.arena?.grid.id ?? '';
      },
      get battleMode() {
        return self.battleRules?.mode ?? 'classic';
      },
      get hasArmorHp() {
        return Boolean(self.battleRules?.hasArmorHp);
      },
      get isNightOps() {
        return Boolean(self.nightVisionSystem?.isEnabled());
      },
      get activeBarrels() {
        return self.tntBarrelSystem?.getActiveCount() ?? 0;
      },
      get wallCount() {
        return self.arena?.walls.length ?? 0;
      },
      get crateIntervalSec() {
        return self.powerUpSystem?.getSpawnIntervalSec() ?? 0;
      },
      get crateTimerRemainingSec() {
        return Number((self.powerUpSystem?.getRemainingSpawnTimer() ?? 0).toFixed(2));
      },
      get activeProjectiles() {
        return self.projectileSystem?.getTotalActiveCount() ?? 0;
      },
      get activeCrates() {
        return self.powerUpSystem?.getCrateCount() ?? 0;
      },
      get groundHazards() {
        return self.powerUpSystem?.getGroundHazardCount() ?? 0;
      },
      get activeMines() {
        return self.powerUpSystem?.getMineCount() ?? 0;
      },
      get activeParticles() {
        return self.effectsSystem?.getActiveParticleCount() ?? 0;
      },
      get displayObjects() {
        return self.children.length;
      },
      get tweens() {
        return self.tweens.getTweens().length;
      },
      get texturesCount() {
        return Object.keys(self.textures.list).length;
      },
      get players() {
        const s = settingsManager.getSettings();
        const isOnline = self.networkRole !== 'offline';
        return self.tanks.map((t) => ({
          index: t.index,
          isAI: isOnline ? false : Boolean(s.playerIsAI[t.index]),
          aiDifficulty: s.playerAIDifficulty[t.index] ?? 'normal',
          x: Math.round(t.kinematics.x),
          y: Math.round(t.kinematics.y),
          angle: Number(t.kinematics.angle.toFixed(2)),
          alive: t.kinematics.alive,
          hp: t.getHp(),
          maxHp: t.getMaxHp(),
          score: self.scoreManager.getScore(t.index),
          ammo: self.projectileSystem.getRemainingAmmo(t.index),
          skill: t.getEquippedSkill(),
          visualSuit: t.getActiveVisualSuit(),
          skillAmmo: t.getSkillAmmo(),
          chargingLaser: t.isChargingLaser(),
          shielded: t.isShielded(),
          reaperSweeping: t.isReaperSweeping(),
        }));
      },
    };
  }

  private cleanupSceneResources(): void {
    this.inputSystem?.detach();
    this.nightVisionSystem?.destroy();
    this.tntBarrelSystem?.destroy();
    this.powerUpSystem?.destroy();
    this.projectileSystem?.destroy();
    this.effectsSystem?.destroy();
    for (const t of this.tanks) {
      t.destroy();
    }
    this.tanks = [];
    this.wallLayerGraphics?.destroy();
    this.arenaGraphics?.destroy();
  }
}
