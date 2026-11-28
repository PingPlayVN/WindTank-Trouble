import Phaser from 'phaser';
import { mobileOrientationManager } from '../managers/MobileOrientationManager';
import { settingsManager } from '../managers/SettingsManager';
import type { BuiltArenaLayout, TankColorPalette } from '../types/gameTypes';
import {
  emitArmorHitImpactEffect,
  emitCratePickupEffect,
  emitCrateSpawnEffect,
  emitCriticalHullDamageTickEffect,
  emitExhaustPuffEffect,
  emitGatlingMuzzleEffect,
  emitMuzzleFlashEffect,
  emitShellExpireEffect,
  emitSuitRevertEffect,
  emitTankExplosionEffect,
  emitTntBarrelExplosionEffect,
  emitWallBounceEffect,
  stampTreadMarkEffect,
} from './effects/combatEffects';
import type { EffectsRenderContext } from './effects/effectsContext';
import { emitLaserBeamBlastEffect, emitLaserChargeTickEffect } from './effects/laserEffects';
import {
  emitBarrierDeployEffect,
  emitBarrierImpactRippleEffect,
  emitBarrierShatterEffect,
  emitBulletIncineratedEffect,
  emitCryoMuzzleEffect,
  emitCryoOrbFlightTickEffect,
  emitCryoShatterEffect,
  emitDrillTrailEffect,
  emitEmpBlastEffect,
  emitEmpJammedTickEffect,
  emitEmpMuzzleEffect,
  emitEmpOrbFlightTickEffect,
  emitFlameMuzzleEffect,
  emitFlameStreamEmberEffect,
  emitIceBlockShatterEffect,
  emitIceDriftSprayEffect,
  emitMineDeployEffect,
  emitMineExplosionEffect,
  emitMissileIgnitionEffect,
  emitMissileTrailEffect,
  emitPhantomActivateEffect,
  emitPhantomAfterimageEffect,
  emitPhantomExitEffect,
  emitReaperSparkEffect,
  emitReaperUnfurlBurstEffect,
  emitReaperWindupTickEffect,
  emitScatterMuzzleEffect,
  emitShieldActivateEffect,
  emitShieldDeflectEffect,
  emitSpikeDetonationEffect,
  emitTankFrozenEffect,
  emitWallDrilledEffect,
  emitWarpBeaconPlantEffect,
  emitWarpTeleportEffect,
} from './effects/skillEffects';

/**
 * High-impact arcade VFX engine orchestrating pooled particle emitters,
 * floor RenderTexture decals, and trauma-driven camera shake across specialized ES6 effect modules.
 */
export class EffectsSystem implements EffectsRenderContext {
  readonly scene: Phaser.Scene;
  readonly floorDecalRT: Phaser.GameObjects.RenderTexture;
  readonly treadStamp: Phaser.GameObjects.Image;
  readonly scorchStamp: Phaser.GameObjects.Image;

  readonly smokeEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly sparkEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly shardEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly starEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly woodEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  readonly flameEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  readonly arenaOriginX: number;
  readonly arenaOriginY: number;
  readonly arenaWidth: number;
  readonly arenaHeight: number;
  readonly scaleRatio: number;

  private trauma = 0;
  private shakeClock = 0;

  constructor(scene: Phaser.Scene, arena: BuiltArenaLayout) {
    this.scene = scene;
    this.arenaOriginX = arena.originX;
    this.arenaOriginY = arena.originY;
    this.arenaWidth = arena.width;
    this.arenaHeight = arena.height;
    this.scaleRatio = arena.scaleRatio;

    this.floorDecalRT = scene.add
      .renderTexture(arena.originX, arena.originY, arena.width, arena.height)
      .setOrigin(0, 0)
      .setDepth(4);

    this.treadStamp = scene.make
      .image({ key: 'decal_tread', add: false })
      .setOrigin(0.5, 0.5)
      .setScale(arena.scaleRatio);

    this.scorchStamp = scene.make
      .image({ key: 'decal_scorch', add: false })
      .setOrigin(0.5, 0.5)
      .setScale(arena.scaleRatio);

    this.smokeEmitter = scene.add
      .particles(0, 0, 'vfx_circle', {
        emitting: false,
        lifespan: { min: 260, max: 580 },
        speed: { min: 18, max: 76 },
        scale: { start: 0.42 * arena.scaleRatio, end: 1.15 * arena.scaleRatio },
        alpha: { start: 0.48, end: 0 },
        tint: [0x9aa0a8, 0xb8bec6, 0x5f646b],
      })
      .setDepth(18);

    this.sparkEmitter = scene.add
      .particles(0, 0, 'vfx_circle', {
        emitting: false,
        lifespan: { min: 140, max: 320 },
        speed: { min: 65, max: 240 },
        scale: { start: 0.34 * arena.scaleRatio, end: 0.04 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        tint: [0xffee58, 0xff9800, 0xff5722, 0xffffff],
      })
      .setDepth(21);

    this.shardEmitter = scene.add
      .particles(0, 0, 'vfx_shard', {
        emitting: false,
        lifespan: { min: 420, max: 820 },
        speed: { min: 75, max: 265 },
        rotate: { min: 0, max: 360 },
        scale: { start: 0.95 * arena.scaleRatio, end: 0.25 * arena.scaleRatio },
        alpha: { start: 1, end: 0 },
      })
      .setDepth(20);

    this.starEmitter = scene.add
      .particles(0, 0, 'vfx_star', {
        emitting: false,
        lifespan: { min: 220, max: 480 },
        speed: { min: 45, max: 210 },
        rotate: { min: -180, max: 180 },
        scale: { start: 0.95 * arena.scaleRatio, end: 0.1 },
        alpha: { start: 1, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
      })
      .setDepth(23);

    this.woodEmitter = scene.add
      .particles(0, 0, 'vfx_wood', {
        emitting: false,
        lifespan: { min: 340, max: 660 },
        speed: { min: 60, max: 195 },
        rotate: { min: 0, max: 360 },
        scale: { start: 1.0 * arena.scaleRatio, end: 0.35 * arena.scaleRatio },
        alpha: { start: 1, end: 0 },
        tint: [0xdda15e, 0xbc6c25, 0xffe0b2],
      })
      .setDepth(20);

    this.flameEmitter = scene.add
      .particles(0, 0, 'vfx_circle', {
        emitting: false,
        lifespan: { min: 130, max: 280 },
        speed: { min: 22, max: 85 },
        scale: { start: 0.55 * arena.scaleRatio, end: 0.08 },
        alpha: { start: 0.95, end: 0 },
        blendMode: Phaser.BlendModes.ADD,
        tint: [0xffffff, 0xffea00, 0xff6d00, 0xd50000],
      })
      .setDepth(20);
  }

  stampTreadMark(worldX: number, worldY: number, angleRad: number): void {
    stampTreadMarkEffect(this, worldX, worldY, angleRad);
  }

  emitExhaustPuff(worldX: number, worldY: number): void {
    emitExhaustPuffEffect(this, worldX, worldY);
  }

  emitMuzzleFlash(worldX: number, worldY: number, angleRad: number): void {
    emitMuzzleFlashEffect(this, worldX, worldY, angleRad);
  }

  emitGatlingMuzzle(worldX: number, worldY: number, angleRad: number): void {
    emitGatlingMuzzleEffect(this, worldX, worldY, angleRad);
  }

  emitWallBounce(worldX: number, worldY: number): void {
    emitWallBounceEffect(this, worldX, worldY);
  }

  emitShellExpire(worldX: number, worldY: number): void {
    emitShellExpireEffect(this, worldX, worldY);
  }

  emitCrateSpawn(worldX: number, worldY: number): void {
    emitCrateSpawnEffect(this, worldX, worldY);
  }

  emitCratePickup(
    worldX: number,
    worldY: number,
    skillName: string,
    accentHex: string,
    accentColor: number,
  ): void {
    emitCratePickupEffect(this, worldX, worldY, skillName, accentHex, accentColor);
  }

  emitSuitRevert(worldX: number, worldY: number): void {
    emitSuitRevertEffect(this, worldX, worldY);
  }

  emitLaserChargeTick(muzzleX: number, muzzleY: number, progress01: number): void {
    emitLaserChargeTickEffect(this, muzzleX, muzzleY, progress01);
  }

  emitLaserBeamBlast(
    points: ReadonlyArray<{ x: number; y: number }>,
    victimPositions: ReadonlyArray<{ x: number; y: number }> = [],
  ): void {
    emitLaserBeamBlastEffect(this, points, victimPositions);
  }

  emitSpikeDetonation(worldX: number, worldY: number): void {
    emitSpikeDetonationEffect(this, worldX, worldY);
  }

  emitMissileIgnition(worldX: number, worldY: number): void {
    emitMissileIgnitionEffect(this, worldX, worldY);
  }

  emitShieldActivate(worldX: number, worldY: number): void {
    emitShieldActivateEffect(this, worldX, worldY);
  }

  emitShieldDeflect(worldX: number, worldY: number): void {
    emitShieldDeflectEffect(this, worldX, worldY);
  }

  emitWallDrilled(worldX: number, worldY: number): void {
    emitWallDrilledEffect(this, worldX, worldY);
  }

  emitMineDeploy(worldX: number, worldY: number): void {
    emitMineDeployEffect(this, worldX, worldY);
  }

  emitMineExplosion(worldX: number, worldY: number): void {
    emitMineExplosionEffect(this, worldX, worldY);
  }

  emitBulletIncinerated(worldX: number, worldY: number): void {
    emitBulletIncineratedEffect(this, worldX, worldY);
  }

  emitScatterMuzzle(worldX: number, worldY: number, angleRad: number): void {
    emitScatterMuzzleEffect(this, worldX, worldY, angleRad);
  }

  emitFlameMuzzle(worldX: number, worldY: number, angleRad: number): void {
    emitFlameMuzzleEffect(this, worldX, worldY, angleRad);
  }

  emitFlameStreamEmber(worldX: number, worldY: number, lifeFrac: number): void {
    emitFlameStreamEmberEffect(this, worldX, worldY, lifeFrac);
  }

  emitDrillTrail(worldX: number, worldY: number, angleRad: number): void {
    emitDrillTrailEffect(this, worldX, worldY, angleRad);
  }

  emitReaperWindupTick(worldX: number, worldY: number, progress01: number): void {
    emitReaperWindupTickEffect(this, worldX, worldY, progress01);
  }

  emitReaperUnfurlBurst(worldX: number, worldY: number): void {
    emitReaperUnfurlBurstEffect(this, worldX, worldY);
  }

  emitReaperSpark(worldX: number, worldY: number): void {
    emitReaperSparkEffect(this, worldX, worldY);
  }

  emitMissileTrail(worldX: number, worldY: number, angleRad: number, seeking: boolean): void {
    emitMissileTrailEffect(this, worldX, worldY, angleRad, seeking);
  }

  emitTankExplosion(worldX: number, worldY: number, palette: TankColorPalette): void {
    emitTankExplosionEffect(this, worldX, worldY, palette);
  }

  emitArmorHitImpact(
    worldX: number,
    worldY: number,
    accentColor: number,
    remainingRatio: number,
  ): void {
    emitArmorHitImpactEffect(this, worldX, worldY, accentColor, remainingRatio);
  }

  emitCriticalHullDamageTick(worldX: number, worldY: number, hpRatio: number): void {
    emitCriticalHullDamageTickEffect(this, worldX, worldY, hpRatio);
  }

  emitTntBarrelExplosion(worldX: number, worldY: number, blastRadius: number): void {
    emitTntBarrelExplosionEffect(this, worldX, worldY, blastRadius);
  }

  emitEmpMuzzle(worldX: number, worldY: number, angleRad: number): void {
    emitEmpMuzzleEffect(this, worldX, worldY, angleRad);
  }

  emitEmpOrbFlightTick(worldX: number, worldY: number): void {
    emitEmpOrbFlightTickEffect(this, worldX, worldY);
  }

  emitEmpJammedTick(worldX: number, worldY: number): void {
    emitEmpJammedTickEffect(this, worldX, worldY);
  }

  emitEmpBlast(worldX: number, worldY: number, blastRadius: number): void {
    emitEmpBlastEffect(this, worldX, worldY, blastRadius);
  }

  emitPhantomActivate(worldX: number, worldY: number): void {
    emitPhantomActivateEffect(this, worldX, worldY);
  }

  emitPhantomAfterimage(
    worldX: number,
    worldY: number,
    angleRad: number,
    paletteId: string,
  ): void {
    emitPhantomAfterimageEffect(this, worldX, worldY, angleRad, paletteId);
  }

  emitPhantomExit(worldX: number, worldY: number): void {
    emitPhantomExitEffect(this, worldX, worldY);
  }

  emitCryoMuzzle(worldX: number, worldY: number, angleRad: number): void {
    emitCryoMuzzleEffect(this, worldX, worldY, angleRad);
  }

  emitCryoOrbFlightTick(worldX: number, worldY: number): void {
    emitCryoOrbFlightTickEffect(this, worldX, worldY);
  }

  emitIceDriftSpray(worldX: number, worldY: number, angleRad: number): void {
    emitIceDriftSprayEffect(this, worldX, worldY, angleRad);
  }

  emitCryoShatter(worldX: number, worldY: number, zoneRadius: number): void {
    emitCryoShatterEffect(this, worldX, worldY, zoneRadius);
  }

  emitTankFrozen(worldX: number, worldY: number): void {
    emitTankFrozenEffect(this, worldX, worldY);
  }

  emitIceBlockShatter(worldX: number, worldY: number): void {
    emitIceBlockShatterEffect(this, worldX, worldY);
  }

  emitBarrierDeploy(x0: number, y0: number, x1: number, y1: number): void {
    emitBarrierDeployEffect(this, x0, y0, x1, y1);
  }

  emitBarrierImpactRipple(worldX: number, worldY: number): void {
    emitBarrierImpactRippleEffect(this, worldX, worldY);
  }

  emitBarrierShatter(x0: number, y0: number, x1: number, y1: number): void {
    emitBarrierShatterEffect(this, x0, y0, x1, y1);
  }

  emitWarpBeaconPlant(worldX: number, worldY: number): void {
    emitWarpBeaconPlantEffect(this, worldX, worldY);
  }

  emitWarpTeleport(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    blastRadius: number,
  ): void {
    emitWarpTeleportEffect(this, fromX, fromY, toX, toY, blastRadius);
  }

  addTrauma(amount: number): void {
    if (!settingsManager.getSettings().screenShake) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number): void {
    const cam = this.scene.cameras.main;
    const baseScrollX = mobileOrientationManager.getViewLeft();
    if (!settingsManager.getSettings().screenShake || this.trauma <= 0.001) {
      if (this.trauma !== 0) {
        this.trauma = 0;
        cam.setScroll(baseScrollX, 0);
      }
      return;
    }

    this.trauma = Math.max(0, this.trauma - dt * 2.3);
    const shake = this.trauma * this.trauma;
    this.shakeClock += dt * 44;
    const maxPx = 8.0;
    const ox = Math.sin(this.shakeClock * 1.7) * maxPx * shake;
    const oy = Math.cos(this.shakeClock * 2.3) * maxPx * shake;
    cam.setScroll(baseScrollX + ox, oy);

    if (this.trauma <= 0.001) {
      this.trauma = 0;
      cam.setScroll(baseScrollX, 0);
    }
  }

  getActiveParticleCount(): number {
    return (
      this.smokeEmitter.getAliveParticleCount() +
      this.sparkEmitter.getAliveParticleCount() +
      this.shardEmitter.getAliveParticleCount() +
      this.starEmitter.getAliveParticleCount() +
      this.woodEmitter.getAliveParticleCount() +
      this.flameEmitter.getAliveParticleCount()
    );
  }

  destroy(): void {
    this.scene.cameras.main?.setScroll(0, 0);
    this.floorDecalRT.destroy();
    this.treadStamp.destroy();
    this.scorchStamp.destroy();
    this.smokeEmitter.destroy();
    this.sparkEmitter.destroy();
    this.shardEmitter.destroy();
    this.starEmitter.destroy();
    this.woodEmitter.destroy();
    this.flameEmitter.destroy();
  }
}
