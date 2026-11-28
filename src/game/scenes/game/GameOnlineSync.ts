import type Phaser from 'phaser';
import { POWERUP_CONFIG } from '../../config/gameplayConfig';
import type { Tank } from '../../entities/Tank';
import { audioManager } from '../../managers/AudioManager';
import type { ScoreManager } from '../../managers/ScoreManager';
import { buildArenaLayout } from '../../maps/MazeBuilder';
import {
  peerMultiplayer,
  type NetGameEvent,
  type OnlineMatchConfig,
} from '../../network/PeerMultiplayerManager';
import { drillMazeWallAtPoint, getSkillDescriptor } from '../../skills';
import type { EffectsSystem } from '../../systems/EffectsSystem';
import type { MatchSystem } from '../../systems/MatchSystem';
import type { NightVisionSystem } from '../../systems/NightVisionSystem';
import type { PowerUpSystem } from '../../systems/PowerUpSystem';
import type { ProjectileSystem } from '../../systems/ProjectileSystem';
import type { TntBarrelSystem } from '../../systems/TntBarrelSystem';
import type {
  BuiltArenaLayout,
  NetworkRole,
  PlayerConfig,
  RoundPhase,
} from '../../types/gameTypes';

export function broadcastHostWorldSnapshot(params: {
  networkRole: NetworkRole;
  arena: BuiltArenaLayout;
  scoreManager: ScoreManager;
  matchSystem: MatchSystem;
  tanks: readonly Tank[];
  projectileSystem: ProjectileSystem;
  powerUpSystem: PowerUpSystem;
  tntBarrelSystem: TntBarrelSystem;
}): void {
  const {
    networkRole,
    arena,
    scoreManager,
    matchSystem,
    tanks,
    projectileSystem,
    powerUpSystem,
    tntBarrelSystem,
  } = params;
  if (networkRole !== 'host' || !peerMultiplayer.isActive()) return;

  const entities = powerUpSystem.getNetworkWorldEntities();
  const activeProjs = projectileSystem
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
    roundNumber: scoreManager.getRoundNumber(),
    arenaKey: `${arena.grid.cols}x${arena.grid.rows}@${arena.originX},${arena.originY},${arena.cellSize}`,
    phase: matchSystem.getPhase(),
    scores: [scoreManager.getScore(0), scoreManager.getScore(1)],
    ties: scoreManager.getTies(),
    crateTimerSec: Math.round(powerUpSystem.getRemainingSpawnTimer() * 10) / 10,
    tanks: tanks.map((t) => {
      const sk = t.getSkillState();
      return {
        index: t.index,
        x: Math.round(t.kinematics.x * 10) / 10,
        y: Math.round(t.kinematics.y * 10) / 10,
        vx: Math.round(t.kinematics.vx * 10) / 10,
        vy: Math.round(t.kinematics.vy * 10) / 10,
        angle: Math.round(t.kinematics.angle * 1000) / 1000,
        alive: t.kinematics.alive,
        ammo: projectileSystem.getRemainingAmmo(t.index),
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
    barrels: tntBarrelSystem.getNetworkSnapshots(),
  });
}

export interface GuestNetEventContext {
  scene: Phaser.Scene;
  arena: BuiltArenaLayout;
  currentRoundSeed: number;
  onlineConfig: OnlineMatchConfig | null;
  activePlayers: readonly PlayerConfig[];
  tanks: readonly Tank[];
  scoreManager: ScoreManager;
  effectsSystem: EffectsSystem;
  powerUpSystem: PowerUpSystem;
  nightVisionSystem: NightVisionSystem;
  setGuestRoundPhase: (phase: RoundPhase) => void;
  setMatchCrateTimerSec: (sec: number) => void;
  redrawWallLayer: () => void;
  emitHudSync: () => void;
}

export function handleGuestNetEvent(ev: NetGameEvent, ctx: GuestNetEventContext): boolean {
  const {
    scene,
    arena,
    currentRoundSeed,
    onlineConfig,
    activePlayers,
    tanks,
    scoreManager,
    effectsSystem,
    powerUpSystem,
    nightVisionSystem,
    setGuestRoundPhase,
    setMatchCrateTimerSec,
    redrawWallLayer,
    emitHudSync,
  } = ctx;

  switch (ev.kind) {
    case 'countdown_step':
      scene.events.emit('countdown-step', ev.label);
      return false;

    case 'fight_start':
      setGuestRoundPhase('playing');
      for (const t of tanks) t.setCountdownHighlight(false);
      scene.events.emit('fight-start');
      return false;

    case 'muzzle_fx':
      if (ev.variant === 'gatling') {
        audioManager.playGatlingFire();
        effectsSystem.emitGatlingMuzzle(ev.x, ev.y, ev.angle);
      } else if (ev.variant === 'flame') {
        audioManager.playFlameSpray();
        effectsSystem.emitFlameMuzzle(ev.x, ev.y, ev.angle);
      } else if (ev.variant === 'scatter') {
        audioManager.playScatterShot();
        effectsSystem.emitScatterMuzzle(ev.x, ev.y, ev.angle);
      } else if (ev.variant === 'emp_orb') {
        audioManager.playEmpLaunch();
        effectsSystem.emitEmpMuzzle(ev.x, ev.y, ev.angle);
      } else if (ev.variant === 'cryo_orb') {
        audioManager.playCryoShot();
        effectsSystem.emitCryoMuzzle(ev.x, ev.y, ev.angle);
      } else {
        audioManager.playFire();
        effectsSystem.emitMuzzleFlash(ev.x, ev.y, ev.angle);
      }
      return false;

    case 'wall_bounce':
      audioManager.playWallBounce(ev.bounces);
      effectsSystem.emitWallBounce(ev.x, ev.y);
      nightVisionSystem.triggerFlareBounceFlash(ev.x, ev.y);
      return false;

    case 'wall_drilled': {
      const res = drillMazeWallAtPoint(arena, ev.hitX, ev.hitY);
      if (res.carved) {
        audioManager.playWallDrill();
        effectsSystem.emitWallDrilled(res.breakX, res.breakY);
        redrawWallLayer();
      }
      return false;
    }

    case 'laser_blast':
      audioManager.playLaserBlast();
      effectsSystem.emitLaserBeamBlast(ev.points, ev.victims);
      nightVisionSystem.triggerLaserFlashCorridor(ev.points);
      return false;

    case 'armor_hit': {
      const victim = tanks.find((t) => t.index === ev.victimIndex);
      audioManager.playWallBounce(2);
      effectsSystem.emitArmorHitImpact(
        ev.x,
        ev.y,
        victim ? victim.palette.primary : 0xffca28,
        ev.hpRatio,
      );
      nightVisionSystem.triggerMuzzleFlashLight(ev.x, ev.y, false);
      return false;
    }

    case 'barrel_blast':
      audioManager.playTankExplosion();
      effectsSystem.emitTntBarrelExplosion(ev.x, ev.y, ev.blastRadius);
      nightVisionSystem.triggerExplosionFlash(ev.x, ev.y, ev.blastRadius * 2.2);
      return false;

    case 'shield_fx':
      if (ev.sub === 'activate') {
        audioManager.playShieldActivate();
        effectsSystem.emitShieldActivate(ev.x, ev.y);
      } else {
        audioManager.playShieldDeflect();
        effectsSystem.emitShieldDeflect(ev.x, ev.y);
      }
      return false;

    case 'crate_fx':
      if (ev.sub === 'spawn') {
        audioManager.playCrateSpawn();
        effectsSystem.emitCrateSpawn(ev.x, ev.y);
      } else if (ev.skillId) {
        const desc = getSkillDescriptor(ev.skillId);
        audioManager.playPowerUpEquip();
        effectsSystem.emitCratePickup(
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
        effectsSystem.emitSpikeDetonation(ev.x, ev.y);
      } else if (ev.sub === 'mine_deploy') {
        audioManager.playMineDeploy();
        effectsSystem.emitMineDeploy(ev.x, ev.y);
      } else if (ev.sub === 'mine_blast') {
        audioManager.playTankExplosion();
        effectsSystem.emitMineExplosion(ev.x, ev.y);
      } else if (ev.sub === 'reaper_unfurl') {
        effectsSystem.emitReaperUnfurlBurst(ev.x, ev.y);
      } else if (ev.sub === 'bullet_burned') {
        effectsSystem.emitBulletIncinerated(ev.x, ev.y);
      } else if (ev.sub === 'emp_blast') {
        const r = ev.radius ?? arena.cellSize * POWERUP_CONFIG.empBlastCellsRadius;
        audioManager.playEmpBlast();
        effectsSystem.emitEmpBlast(ev.x, ev.y, r);
        powerUpSystem.triggerEmpCataclysmVisual(ev.x, ev.y, r);
        nightVisionSystem.triggerExplosionFlash(ev.x, ev.y, 240);
      } else if (ev.sub === 'phantom_activate') {
        audioManager.playPhantomActivate();
        effectsSystem.emitPhantomActivate(ev.x, ev.y);
      } else if (ev.sub === 'cryo_shatter') {
        audioManager.playCryoShatter();
        effectsSystem.emitCryoShatter(
          ev.x,
          ev.y,
          ev.radius ?? arena.cellSize * POWERUP_CONFIG.cryoZoneCellsRadius,
        );
      } else if (ev.sub === 'barrier_deploy') {
        audioManager.playBarrierDeploy();
        effectsSystem.emitBarrierDeploy(ev.x, ev.y, ev.x2 ?? ev.x, ev.y2 ?? ev.y);
      } else if (ev.sub === 'barrier_shatter') {
        audioManager.playCryoShatter();
        effectsSystem.emitBarrierShatter(ev.x, ev.y, ev.x2 ?? ev.x, ev.y2 ?? ev.y);
      } else if (ev.sub === 'warp_plant') {
        audioManager.playWarpBeacon();
        effectsSystem.emitWarpBeaconPlant(ev.x, ev.y);
      } else if (ev.sub === 'warp_teleport') {
        const br = ev.radius ?? POWERUP_CONFIG.warpBlastRadius * arena.scaleRatio;
        const tx = ev.x2 ?? ev.x;
        const ty = ev.y2 ?? ev.y;
        audioManager.playWarpTeleport();
        audioManager.playTankExplosion();
        effectsSystem.emitWarpTeleport(ev.x, ev.y, tx, ty, br);
        powerUpSystem.triggerWarpCataclysmVisual(ev.x, ev.y, tx, ty, br);
        nightVisionSystem.triggerExplosionFlash(ev.x, ev.y, 210);
        nightVisionSystem.triggerExplosionFlash(tx, ty, 210);
      }
      return false;

    case 'tank_eliminated': {
      const victim = tanks.find((t) => t.index === ev.victimIndex);
      if (victim) {
        victim.eliminate();
        audioManager.playTankExplosion();
        effectsSystem.emitTankExplosion(ev.x, ev.y, victim.palette);
        emitHudSync();
      }
      return false;
    }

    case 'round_resolved':
      setGuestRoundPhase('round_end');
      scoreManager.syncFromNetwork(
        ev.summary.scores,
        ev.summary.ties,
        ev.summary.roundNumber,
      );
      emitHudSync();
      scene.events.emit('round-resolved', ev.summary);
      return false;

    case 'advance_round':
      while (scoreManager.getRoundNumber() < ev.roundNumber) {
        scoreManager.advanceToNextRound();
      }
      setMatchCrateTimerSec(ev.crateTimerSec);
      if (onlineConfig) {
        if (ev.grid) {
          onlineConfig.authoritativeRound = ev.roundNumber;
          onlineConfig.authoritativeGrid = ev.grid;
        }
        if (ev.viewport) {
          onlineConfig.authoritativeViewport = ev.viewport;
        }
      }
      scene.scene.restart({
        freshMatch: false,
        onlineMatch: onlineConfig ?? undefined,
      });
      return true;

    case 'arena_resync': {
      const curLocalKey = `${arena.grid.cols}x${arena.grid.rows}@${arena.originX},${arena.originY},${arena.cellSize}`;
      const syncedLayout = buildArenaLayout(ev.grid, 2, currentRoundSeed, ev.viewport);
      const syncedKey = `${syncedLayout.grid.cols}x${syncedLayout.grid.rows}@${syncedLayout.originX},${syncedLayout.originY},${syncedLayout.cellSize}`;
      if (curLocalKey === syncedKey) return false;
      while (scoreManager.getRoundNumber() < ev.roundNumber) {
        scoreManager.advanceToNextRound();
      }
      if (onlineConfig) {
        onlineConfig.authoritativeRound = ev.roundNumber;
        onlineConfig.authoritativeGrid = ev.grid;
        onlineConfig.authoritativeViewport = ev.viewport;
      }
      scene.scene.restart({
        freshMatch: false,
        onlineMatch: onlineConfig ?? undefined,
      });
      return true;
    }

    case 'match_victory':
      setGuestRoundPhase('match_over');
      scene.scene.stop('UIScene');
      scene.scene.start('ResultScene', {
        summary: ev.summary,
        players: [...activePlayers],
      });
      return true;

    case 'rematch_start':
      scene.scene.restart({
        freshMatch: true,
        seed: ev.config.matchSeed,
        onlineMatch: ev.config,
      });
      return true;
  }
}
