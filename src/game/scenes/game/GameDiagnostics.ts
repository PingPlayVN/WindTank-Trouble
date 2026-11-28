import Phaser from 'phaser';
import type { Tank } from '../../entities/Tank';
import type { ScoreManager } from '../../managers/ScoreManager';
import { settingsManager } from '../../managers/SettingsManager';
import { peerMultiplayer } from '../../network/PeerMultiplayerManager';
import type { EffectiveBattleModeRules } from '../../systems/BattleModeSim';
import type { EffectsSystem } from '../../systems/EffectsSystem';
import type { NightVisionSystem } from '../../systems/NightVisionSystem';
import type { PowerUpSystem } from '../../systems/PowerUpSystem';
import type { ProjectileSystem } from '../../systems/ProjectileSystem';
import type { TntBarrelSystem } from '../../systems/TntBarrelSystem';
import type { BuiltArenaLayout, NetworkRole, RoundPhase } from '../../types/gameTypes';

export interface GameDiagnosticsProbe {
  scene: Phaser.Scene;
  getPhase: () => RoundPhase;
  getNetworkRole: () => NetworkRole;
  getArena: () => BuiltArenaLayout | undefined;
  getIsPaused: () => boolean;
  getScoreManager: () => ScoreManager | undefined;
  getBattleRules: () => EffectiveBattleModeRules | undefined;
  getNightVisionSystem: () => NightVisionSystem | undefined;
  getTntBarrelSystem: () => TntBarrelSystem | undefined;
  getPowerUpSystem: () => PowerUpSystem | undefined;
  getProjectileSystem: () => ProjectileSystem | undefined;
  getEffectsSystem: () => EffectsSystem | undefined;
  getTanks: () => readonly Tank[];
}

export function attachGameDiagnostics(probe: GameDiagnosticsProbe): void {
  const { scene } = probe;
  (window as unknown as { __PHASER_GAME_DIAGNOSTICS__?: unknown }).__PHASER_GAME_DIAGNOSTICS__ = {
    get fps() {
      return Math.round(scene.game.loop.actualFps);
    },
    get renderer() {
      return scene.game.renderer.type === Phaser.WEBGL ? 'WEBGL' : 'CANVAS';
    },
    get phase() {
      return probe.getPhase();
    },
    get networkRole() {
      return probe.getNetworkRole();
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
      const arena = probe.getArena();
      return {
        originX: arena?.originX ?? 0,
        originY: arena?.originY ?? 0,
        width: arena?.width ?? 0,
        height: arena?.height ?? 0,
      };
    },
    get paused() {
      return probe.getIsPaused();
    },
    get round() {
      return probe.getScoreManager()?.getRoundNumber() ?? 1;
    },
    get mapId() {
      return probe.getArena()?.grid.id ?? '';
    },
    get battleMode() {
      return probe.getBattleRules()?.mode ?? 'classic';
    },
    get hasArmorHp() {
      return Boolean(probe.getBattleRules()?.hasArmorHp);
    },
    get isNightOps() {
      return Boolean(probe.getNightVisionSystem()?.isEnabled());
    },
    get activeBarrels() {
      return probe.getTntBarrelSystem()?.getActiveCount() ?? 0;
    },
    get wallCount() {
      return probe.getArena()?.walls.length ?? 0;
    },
    get crateIntervalSec() {
      return probe.getPowerUpSystem()?.getSpawnIntervalSec() ?? 0;
    },
    get crateTimerRemainingSec() {
      return Number((probe.getPowerUpSystem()?.getRemainingSpawnTimer() ?? 0).toFixed(2));
    },
    get activeProjectiles() {
      return probe.getProjectileSystem()?.getTotalActiveCount() ?? 0;
    },
    get activeCrates() {
      return probe.getPowerUpSystem()?.getCrateCount() ?? 0;
    },
    get groundHazards() {
      return probe.getPowerUpSystem()?.getGroundHazardCount() ?? 0;
    },
    get activeMines() {
      return probe.getPowerUpSystem()?.getMineCount() ?? 0;
    },
    get activeParticles() {
      return probe.getEffectsSystem()?.getActiveParticleCount() ?? 0;
    },
    get displayObjects() {
      return scene.children.length;
    },
    get tweens() {
      return scene.tweens.getTweens().length;
    },
    get texturesCount() {
      return Object.keys(scene.textures.list).length;
    },
    get players() {
      const s = settingsManager.getSettings();
      const isOnline = probe.getNetworkRole() !== 'offline';
      const scoreManager = probe.getScoreManager();
      const projectileSystem = probe.getProjectileSystem();
      return probe.getTanks().map((t) => ({
        index: t.index,
        isAI: isOnline ? false : Boolean(s.playerIsAI[t.index]),
        aiDifficulty: s.playerAIDifficulty[t.index] ?? 'normal',
        x: Math.round(t.kinematics.x),
        y: Math.round(t.kinematics.y),
        angle: Number(t.kinematics.angle.toFixed(2)),
        alive: t.kinematics.alive,
        hp: t.getHp(),
        maxHp: t.getMaxHp(),
        score: scoreManager ? scoreManager.getScore(t.index) : 0,
        ammo: projectileSystem ? projectileSystem.getRemainingAmmo(t.index) : 10,
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
