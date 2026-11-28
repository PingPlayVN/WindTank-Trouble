import Phaser from 'phaser';
import { AssetFactory } from '../art/AssetFactory';
import { BASE_GAMEPLAY, POWERUP_CONFIG } from '../config/gameplayConfig';
import { getPaletteById } from '../config/paletteConfig';
import type { NetTankSnapshot } from '../network/PeerMultiplayerManager';
import type { PlayerSkillState } from '../skills/types';
import {
  getTankSkinDescriptor,
  resolveEffectiveSkinStats,
  type TankSkinStats,
} from '../skins';
import type {
  PlayerConfig,
  PlayerIndex,
  PlayerInputState,
  SkillId,
  SpawnPoint,
  TankColorPalette,
  TankKinematics,
  TankSkinId,
} from '../types/gameTypes';
import { renderTankAurasAndOverlays } from './TankAuraRenderer';

export class Tank {
  readonly index: PlayerIndex;
  readonly config: PlayerConfig;
  readonly palette: TankColorPalette;
  readonly skinId: TankSkinId;
  readonly kinematics: TankKinematics;

  private readonly scene: Phaser.Scene;
  private readonly shadowSprite: Phaser.GameObjects.Image;
  private readonly auraGraphics: Phaser.GameObjects.Graphics;
  private readonly bodySprite: Phaser.GameObjects.Image;
  private readonly overlayGraphics: Phaser.GameObjects.Graphics;
  private readonly spawnRing: Phaser.GameObjects.Arc;
  private readonly scaleRatio: number;
  private visualScale: number;
  private skinStats: TankSkinStats;
  private readonly trailHistory: Array<{ x: number; y: number; angle: number }> = [];
  private trailSampleAccum = 0;

  private skillState: PlayerSkillState = {
    skill: null,
    ammo: 0,
    chargingLaserRemaining: 0,
    reaperWindupRemaining: 0,
    reaperDeployRemaining: 0,
    reaperSpinRemaining: 0,
    warpBeaconPlaced: false,
  };
  private shieldRemainingSec = 0;
  private phantomRemainingSec = 0;
  private empJamRemainingSec = 0;
  private empMisfireTimer = 0;
  private empPendingMisfire = false;
  private frozenRemainingSec = 0;
  private cryoChillExposureSec = 0;
  private cryoRefreezeImmunitySec = 0;
  private onIceFloor = false;
  private laserReadyToDischarge = false;
  private reaperGyroStartAngle = 0;
  private reaperGyroTotalDelta = Math.PI * 2.6;
  private reaperJustShotShaft = false;
  private reaperJustUnfurled = false;
  private auraPulseClock = 0;

  private fireCooldown = 0;
  private treadAccumulator = 0;
  private treadFrame = 0;
  private decalDistanceAccumulator = 0;
  private exhaustTimer = 0;
  private recoilOffset = 0;

  // Armor Durability (`Độ Bền Giáp HP`) state
  private hasArmorBar = false;
  private maxHp = 100;
  private hp = 100;
  private hitFlashTimer = 0;
  private criticalVfxTimer = 0;
  private flameHitCooldown = 0;
  private reaperHitCooldown = 0;
  private spikeHitCooldown = 0;

  constructor(
    scene: Phaser.Scene,
    config: PlayerConfig,
    spawn: SpawnPoint,
    scaleRatio: number,
    skinStatsEnabled = true,
  ) {
    this.scene = scene;
    this.index = config.index;
    this.config = config;
    this.palette = getPaletteById(config.colorId);
    this.skinId = config.skinId ?? 'classic';
    this.skinStats = resolveEffectiveSkinStats(this.skinId, skinStatsEnabled);
    this.scaleRatio = scaleRatio;
    this.visualScale = scaleRatio * this.skinStats.radiusScale;

    const radius = BASE_GAMEPLAY.tankRadius * scaleRatio * this.skinStats.radiusScale;
    this.kinematics = {
      index: config.index,
      x: spawn.x,
      y: spawn.y,
      vx: 0,
      vy: 0,
      angle: spawn.angle,
      radius,
      alive: true,
    };

    this.spawnRing = scene.add
      .circle(spawn.x, spawn.y, radius * 1.65)
      .setStrokeStyle(2.2, this.palette.primary, 0.7)
      .setFillStyle(this.palette.primary, 0.1)
      .setDepth(8);

    this.shadowSprite = scene.add
      .image(spawn.x + 2.5 * scaleRatio, spawn.y + 3.5 * scaleRatio, 'tank_shadow')
      .setOrigin(0.44, 0.5)
      .setScale(this.visualScale)
      .setRotation(spawn.angle)
      .setDepth(12);

    this.auraGraphics = scene.add.graphics().setDepth(13);

    const initialTexKey = AssetFactory.ensureTankTexture(
      scene,
      this.palette.id,
      this.skinId,
      null,
      0,
      false,
    );
    this.bodySprite = scene.add
      .image(spawn.x, spawn.y, initialTexKey)
      .setOrigin(0.44, 0.5)
      .setScale(this.visualScale)
      .setRotation(spawn.angle)
      .setDepth(14);

    this.overlayGraphics = scene.add.graphics().setDepth(14.8);
  }

  getSkinId(): TankSkinId {
    return this.skinId;
  }

  getSkinStats(): Readonly<TankSkinStats> {
    return this.skinStats;
  }

  getSkillState(): Readonly<PlayerSkillState> {
    return this.skillState;
  }

  configureArmorMode(enabled: boolean, maxHp = 100): void {
    this.hasArmorBar = enabled;
    this.maxHp = Math.max(20, Math.round(maxHp * this.skinStats.armorHpScale));
    this.hp = this.maxHp;
    this.hitFlashTimer = 0;
    this.criticalVfxTimer = 0;
    this.flameHitCooldown = 0;
    this.reaperHitCooldown = 0;
    this.spikeHitCooldown = 0;
  }

  hasArmorHpEnabled(): boolean {
    return this.hasArmorBar;
  }

  getHp(): number {
    return this.hp;
  }

  getMaxHp(): number {
    return this.maxHp;
  }

  getHpRatio(): number {
    return this.maxHp > 0 ? Math.max(0, Math.min(1, this.hp / this.maxHp)) : 1;
  }

  applyArmorDamage(
    damage: number,
    continuousKind?: 'flame' | 'reaper' | 'ground_spike',
  ): { applied: boolean; lethal: boolean } {
    if (!this.kinematics.alive || this.isShielded()) {
      return { applied: false, lethal: false };
    }
    if (continuousKind === 'flame') {
      if (this.flameHitCooldown > 0) return { applied: false, lethal: false };
      this.flameHitCooldown = 0.068;
    } else if (continuousKind === 'reaper') {
      if (this.reaperHitCooldown > 0) return { applied: false, lethal: false };
      this.reaperHitCooldown = 0.26;
    } else if (continuousKind === 'ground_spike') {
      if (this.spikeHitCooldown > 0) return { applied: false, lethal: false };
      this.spikeHitCooldown = 0.42;
    }

    if (!this.hasArmorBar) {
      this.hp = 0;
      return { applied: true, lethal: true };
    }

    this.hp = Math.max(0, this.hp - Math.max(1, Math.round(damage)));
    if (this.hp <= 0) {
      return { applied: true, lethal: true };
    }

    this.hitFlashTimer = 0.09;
    this.bodySprite.setTintFill(0xfff59d);
    return { applied: true, lethal: false };
  }

  getEquippedSkill(): SkillId | null {
    return this.skillState.skill;
  }

  getActiveVisualSuit(): SkillId | null {
    if (this.skillState.skill) return this.skillState.skill;
    if (this.shieldRemainingSec > 0) return 'shield';
    if (this.phantomRemainingSec > 0) return 'phantom';
    return null;
  }

  getSkillAmmo(): number {
    return this.skillState.ammo;
  }

  isShielded(): boolean {
    return this.kinematics.alive && this.shieldRemainingSec > 0;
  }

  getShieldRemainingSec(): number {
    return this.shieldRemainingSec;
  }

  isPhantom(): boolean {
    return this.kinematics.alive && this.phantomRemainingSec > 0;
  }

  getPhantomRemainingSec(): number {
    return this.phantomRemainingSec;
  }

  activatePhantom(durationSec = POWERUP_CONFIG.phantomDurationSec): void {
    this.phantomRemainingSec = durationSec;
    this.skillState = {
      skill: null,
      ammo: 0,
      chargingLaserRemaining: 0,
      reaperWindupRemaining: 0,
      reaperDeployRemaining: 0,
      reaperSpinRemaining: 0,
      warpBeaconPlaced: false,
    };
    this.refreshBodyTexture();
  }

  isEmpJammed(): boolean {
    return this.kinematics.alive && this.empJamRemainingSec > 0;
  }

  getEmpJamRemainingSec(): number {
    return this.empJamRemainingSec;
  }

  applyEmpJam(
    durationSec = POWERUP_CONFIG.empJamDurationSec,
  ): { brokeShield: boolean; interruptedChannel: boolean } {
    if (!this.kinematics.alive) {
      return { brokeShield: false, interruptedChannel: false };
    }
    const brokeShield = this.shieldRemainingSec > 0;
    this.shieldRemainingSec = 0;

    const interruptedChannel =
      this.skillState.chargingLaserRemaining > 0 ||
      this.isReaperWindingUp() ||
      this.isReaperSweeping();
    if (interruptedChannel) {
      this.clearSkill();
    }

    const scaledEmpDuration = durationSec * this.skinStats.ccDurationScale;
    this.empJamRemainingSec = Math.max(this.empJamRemainingSec, scaledEmpDuration);
    this.empMisfireTimer = 0.16;
    this.refreshBodyTexture();
    return { brokeShield, interruptedChannel };
  }

  consumeEmpMisfireTrigger(): boolean {
    if (!this.empPendingMisfire) return false;
    this.empPendingMisfire = false;
    return true;
  }

  isFrozen(): boolean {
    return this.kinematics.alive && this.frozenRemainingSec > 0;
  }

  getFrozenRemainingSec(): number {
    return this.frozenRemainingSec;
  }

  getCryoChillRatio(): number {
    return Math.max(
      0,
      Math.min(1, this.cryoChillExposureSec / POWERUP_CONFIG.cryoChillToFreezeSec),
    );
  }

  applyCryoFreeze(durationSec = POWERUP_CONFIG.cryoFreezeDurationSec): boolean {
    if (durationSec <= 0) {
      this.frozenRemainingSec = 0;
      this.cryoChillExposureSec = 0;
      if (this.hitFlashTimer <= 0) {
        this.bodySprite.clearTint();
      }
      return false;
    }
    if (!this.kinematics.alive || this.isShielded()) return false;
    const scaledFreeze = durationSec * this.skinStats.ccDurationScale;
    this.frozenRemainingSec = Math.max(this.frozenRemainingSec, scaledFreeze);
    this.cryoChillExposureSec = 0;
    this.kinematics.vx = 0;
    this.kinematics.vy = 0;
    if (this.hitFlashTimer <= 0) {
      this.bodySprite.setTint(0x9be7ff);
    }
    return true;
  }

  setOnIceFloor(onIce: boolean): void {
    this.onIceFloor = onIce;
  }

  isOnIceFloor(): boolean {
    return this.onIceFloor;
  }

  isWarpBeaconPlaced(): boolean {
    return this.skillState.skill === 'warp' && Boolean(this.skillState.warpBeaconPlaced);
  }

  setWarpBeaconPlaced(placed: boolean): void {
    if (this.skillState.skill === 'warp') {
      this.skillState.warpBeaconPlaced = placed;
    }
  }

  activateShield(durationSec = POWERUP_CONFIG.shieldDurationSec): void {
    this.shieldRemainingSec = durationSec;
    this.skillState = {
      skill: null,
      ammo: 0,
      chargingLaserRemaining: 0,
      reaperWindupRemaining: 0,
      reaperDeployRemaining: 0,
      reaperSpinRemaining: 0,
      warpBeaconPlaced: false,
    };
    this.refreshBodyTexture();
  }

  startReaperSweep(extraRandomAngleRad?: number): void {
    const randomOffset = extraRandomAngleRad ?? (0.35 + Math.random() * 1.55) * Math.PI;
    this.reaperGyroStartAngle = this.kinematics.angle;
    this.reaperGyroTotalDelta = Math.PI * 2 + randomOffset;

    this.skillState.reaperWindupRemaining = POWERUP_CONFIG.reaperWindupSec;
    this.skillState.reaperDeployRemaining =
      POWERUP_CONFIG.reaperShaftExtendSec + POWERUP_CONFIG.reaperCrescentUnfurlSec;
    this.skillState.reaperSpinRemaining = POWERUP_CONFIG.reaperSpinDurationSec;
    this.reaperJustShotShaft = false;
    this.reaperJustUnfurled = false;
    this.kinematics.vx = 0;
    this.kinematics.vy = 0;

    this.scene.tweens.killTweensOf(this.bodySprite);
    this.scene.tweens.add({
      targets: this.bodySprite,
      scaleX: this.visualScale * 1.18,
      scaleY: this.visualScale * 1.18,
      duration: POWERUP_CONFIG.reaperWindupSec * 1000 * 0.55,
      yoyo: true,
      ease: 'Sine.easeInOut',
    });
  }

  consumeReaperShaftLaunchEvent(): boolean {
    if (!this.reaperJustShotShaft) return false;
    this.reaperJustShotShaft = false;
    return true;
  }

  consumeReaperUnfurlEvent(): boolean {
    if (!this.reaperJustUnfurled) return false;
    this.reaperJustUnfurled = false;
    return true;
  }

  isReaperWindingUp(): boolean {
    return (this.skillState.reaperWindupRemaining ?? 0) > 0;
  }

  isReaperDeploying(): boolean {
    return (
      (this.skillState.reaperWindupRemaining ?? 0) <= 0 &&
      (this.skillState.reaperDeployRemaining ?? 0) > 0
    );
  }

  isReaperRotating(): boolean {
    return (
      (this.skillState.reaperWindupRemaining ?? 0) <= 0 &&
      (this.skillState.reaperDeployRemaining ?? 0) <= 0 &&
      (this.skillState.reaperSpinRemaining ?? 0) > 0
    );
  }

  getReaperWindupProgress(): number | null {
    const rem = this.skillState.reaperWindupRemaining ?? 0;
    if (rem <= 0) return null;
    return Math.max(0, Math.min(1, 1 - rem / POWERUP_CONFIG.reaperWindupSec));
  }

  isReaperSweeping(): boolean {
    return (
      (this.skillState.reaperWindupRemaining ?? 0) <= 0 &&
      ((this.skillState.reaperDeployRemaining ?? 0) > 0 ||
        (this.skillState.reaperSpinRemaining ?? 0) > 0)
    );
  }

  getReaperExtendProgress(): number {
    if ((this.skillState.reaperWindupRemaining ?? 0) > 0) return 0;

    const deployRem = this.skillState.reaperDeployRemaining ?? 0;
    if (deployRem > 0) {
      const totalDeploy =
        POWERUP_CONFIG.reaperShaftExtendSec + POWERUP_CONFIG.reaperCrescentUnfurlSec;
      const elapsed = Math.max(0, totalDeploy - deployRem);
      if (elapsed < POWERUP_CONFIG.reaperShaftExtendSec) {
        const u = elapsed / POWERUP_CONFIG.reaperShaftExtendSec;
        return 1 - Math.pow(1 - u, 3);
      }
      return 1.0;
    }

    const spinRem = this.skillState.reaperSpinRemaining ?? 0;
    if (spinRem <= 0) return 0;
    const retractWindow = 0.16;
    if (spinRem < retractWindow) {
      return Math.max(0.1, spinRem / retractWindow);
    }
    return 1.0;
  }

  getReaperCrescentProgress(): number {
    if ((this.skillState.reaperWindupRemaining ?? 0) > 0) return 0;

    const deployRem = this.skillState.reaperDeployRemaining ?? 0;
    if (deployRem > 0) {
      const totalDeploy =
        POWERUP_CONFIG.reaperShaftExtendSec + POWERUP_CONFIG.reaperCrescentUnfurlSec;
      const elapsed = Math.max(0, totalDeploy - deployRem);
      if (elapsed <= POWERUP_CONFIG.reaperShaftExtendSec) {
        return 0;
      }
      const u = Math.min(
        1,
        (elapsed - POWERUP_CONFIG.reaperShaftExtendSec) /
          Math.max(0.05, POWERUP_CONFIG.reaperCrescentUnfurlSec),
      );
      const c1 = 1.45;
      const c3 = c1 + 1;
      const back = 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
      return Math.max(0, Math.min(1.06, back));
    }

    const spinRem = this.skillState.reaperSpinRemaining ?? 0;
    if (spinRem <= 0) return 0;
    const retractWindow = 0.16;
    if (spinRem < retractWindow) {
      return Math.max(0, spinRem / retractWindow);
    }
    return 1.0;
  }

  isChargingLaser(): boolean {
    return this.skillState.chargingLaserRemaining > 0;
  }

  getLaserChargeProgress(): number | null {
    if (this.skillState.chargingLaserRemaining <= 0) return null;
    return Math.max(
      0,
      Math.min(1, 1 - this.skillState.chargingLaserRemaining / POWERUP_CONFIG.laserChargeSec),
    );
  }

  equipSkill(skill: SkillId, ammo: number): void {
    this.skillState = {
      skill,
      ammo,
      chargingLaserRemaining: 0,
      reaperWindupRemaining: 0,
      reaperDeployRemaining: 0,
      reaperSpinRemaining: 0,
      warpBeaconPlaced: false,
    };
    this.laserReadyToDischarge = false;
    this.refreshBodyTexture();

    this.scene.tweens.killTweensOf(this.bodySprite);
    this.bodySprite.setScale(this.visualScale * 1.26, this.visualScale * 1.26);
    this.scene.tweens.add({
      targets: this.bodySprite,
      scaleX: this.visualScale,
      scaleY: this.visualScale,
      duration: 210,
      ease: 'Back.easeOut',
    });
  }

  clearSkill(): void {
    this.skillState = {
      skill: null,
      ammo: 0,
      chargingLaserRemaining: 0,
      reaperWindupRemaining: 0,
      reaperDeployRemaining: 0,
      reaperSpinRemaining: 0,
      warpBeaconPlaced: false,
    };
    this.laserReadyToDischarge = false;
    this.refreshBodyTexture();
  }

  consumeSkillAmmo(amount = 1): { depleted: boolean } {
    if (!this.skillState.skill) return { depleted: true };
    this.skillState.ammo = Math.max(0, this.skillState.ammo - amount);
    if (this.skillState.ammo <= 0) {
      this.clearSkill();
      return { depleted: true };
    }
    return { depleted: false };
  }

  startLaserCharge(durationSec = POWERUP_CONFIG.laserChargeSec): void {
    this.skillState.chargingLaserRemaining = durationSec;
    this.laserReadyToDischarge = false;
    this.kinematics.vx = 0;
    this.kinematics.vy = 0;
  }

  consumeReadyLaserDischarge(): boolean {
    if (!this.laserReadyToDischarge) return false;
    this.laserReadyToDischarge = false;
    return true;
  }

  hasPendingLaserDischarge(): boolean {
    return this.laserReadyToDischarge;
  }

  applyRecoilImpulse(impulseSpeed: number): void {
    const effectiveImpulse = impulseSpeed * this.skinStats.recoilScale;
    this.kinematics.vx -= Math.cos(this.kinematics.angle) * effectiveImpulse;
    this.kinematics.vy -= Math.sin(this.kinematics.angle) * effectiveImpulse;
  }

  private refreshBodyTexture(): void {
    const suit = this.getActiveVisualSuit();
    const key = AssetFactory.ensureTankTexture(
      this.scene,
      this.palette.id,
      this.skinId,
      suit,
      this.treadFrame,
      false,
    );
    this.bodySprite.setTexture(key);
  }

  setCountdownHighlight(visible: boolean, pulsePhase = 0): void {
    if (!this.kinematics.alive) {
      this.spawnRing.setVisible(false);
      return;
    }
    this.spawnRing.setVisible(visible);
    if (visible) {
      const s = 1 + Math.sin(pulsePhase * 7) * 0.1;
      this.spawnRing.setPosition(this.kinematics.x, this.kinematics.y);
      this.spawnRing.setScale(s);
    }
  }

  updateMovement(
    input: PlayerInputState,
    dt: number,
    onTreadMark: (x: number, y: number, angle: number) => void,
    onExhaust: (x: number, y: number) => void,
  ): {
    shieldJustExpired: boolean;
    phantomJustExpired: boolean;
    reaperJustEnded: boolean;
    frozenJustExpired: boolean;
    frozeFromCryoZone: boolean;
    emitCriticalDamage: boolean;
  } {
    let shieldJustExpired = false;
    let phantomJustExpired = false;
    let reaperJustEnded = false;
    let frozenJustExpired = false;
    let frozeFromCryoZone = false;

    if (!this.kinematics.alive) {
      return {
        shieldJustExpired,
        phantomJustExpired,
        reaperJustEnded,
        frozenJustExpired,
        frozeFromCryoZone,
        emitCriticalDamage: false,
      };
    }

    this.auraPulseClock += dt;

    if (this.cryoRefreezeImmunitySec > 0) {
      this.cryoRefreezeImmunitySec = Math.max(0, this.cryoRefreezeImmunitySec - dt);
    }

    if (this.shieldRemainingSec > 0) {
      this.shieldRemainingSec = Math.max(0, this.shieldRemainingSec - dt);
      if (this.shieldRemainingSec <= 0) {
        shieldJustExpired = true;
        this.refreshBodyTexture();
      }
    }

    if (this.phantomRemainingSec > 0) {
      this.phantomRemainingSec = Math.max(0, this.phantomRemainingSec - dt);
      if (this.phantomRemainingSec <= 0) {
        phantomJustExpired = true;
        this.refreshBodyTexture();
      }
    }

    if (this.empJamRemainingSec > 0) {
      this.empJamRemainingSec = Math.max(0, this.empJamRemainingSec - dt);
      if (this.empJamRemainingSec > 0 && this.frozenRemainingSec <= 0) {
        this.empMisfireTimer -= dt;
        if (this.empMisfireTimer <= 0) {
          this.empMisfireTimer = POWERUP_CONFIG.empMisfireIntervalSec;
          this.empPendingMisfire = true;
        }
      } else if (this.empJamRemainingSec <= 0) {
        this.empPendingMisfire = false;
      }
    }

    if (this.frozenRemainingSec > 0) {
      this.frozenRemainingSec = Math.max(0, this.frozenRemainingSec - dt);
      if (this.frozenRemainingSec <= 0) {
        frozenJustExpired = true;
        this.cryoChillExposureSec = 0;
        this.cryoRefreezeImmunitySec = POWERUP_CONFIG.cryoRefreezeImmunitySec;
        if (this.hitFlashTimer <= 0) {
          this.bodySprite.clearTint();
        }
      }
    } else if (!this.isShielded()) {
      if (this.onIceFloor && this.cryoRefreezeImmunitySec <= 0) {
        const chillRate = Math.max(0.35, 1 - this.skinStats.iceResistRatio * 0.65);
        this.cryoChillExposureSec += dt * chillRate;
        if (this.cryoChillExposureSec >= POWERUP_CONFIG.cryoChillToFreezeSec) {
          if (this.applyCryoFreeze(POWERUP_CONFIG.cryoFreezeDurationSec)) {
            frozeFromCryoZone = true;
          }
        }
      } else if (!this.onIceFloor && this.cryoChillExposureSec > 0) {
        this.cryoChillExposureSec = Math.max(
          0,
          this.cryoChillExposureSec - dt * POWERUP_CONFIG.cryoChillDecayPerSec,
        );
      }
    } else {
      this.cryoChillExposureSec = 0;
    }

    if (this.fireCooldown > 0) {
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    }
    if (this.recoilOffset > 0.01) {
      this.recoilOffset = Math.max(0, this.recoilOffset - dt * 24);
    } else {
      this.recoilOffset = 0;
    }

    if (this.frozenRemainingSec > 0) {
      this.kinematics.vx = 0;
      this.kinematics.vy = 0;
      if (this.flameHitCooldown > 0) this.flameHitCooldown = Math.max(0, this.flameHitCooldown - dt);
      if (this.reaperHitCooldown > 0) {
        this.reaperHitCooldown = Math.max(0, this.reaperHitCooldown - dt);
      }
      if (this.spikeHitCooldown > 0) this.spikeHitCooldown = Math.max(0, this.spikeHitCooldown - dt);
      if (this.hitFlashTimer > 0) {
        this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
        if (this.hitFlashTimer <= 0 && this.kinematics.alive) {
          this.bodySprite.setTint(0x9be7ff);
        }
      }
      return {
        shieldJustExpired,
        phantomJustExpired,
        reaperJustEnded,
        frozenJustExpired,
        frozeFromCryoZone,
        emitCriticalDamage: false,
      };
    }

    if (this.skillState.chargingLaserRemaining > 0) {
      this.kinematics.vx = 0;
      this.kinematics.vy = 0;
      this.skillState.chargingLaserRemaining -= dt;
      if (this.skillState.chargingLaserRemaining <= 0) {
        this.skillState.chargingLaserRemaining = 0;
        this.laserReadyToDischarge = true;
      }
      return {
        shieldJustExpired,
        phantomJustExpired,
        reaperJustEnded,
        frozenJustExpired,
        frozeFromCryoZone,
        emitCriticalDamage: false,
      };
    }

    const windup = this.skillState.reaperWindupRemaining ?? 0;
    const deploy = this.skillState.reaperDeployRemaining ?? 0;
    const spinning = this.skillState.reaperSpinRemaining ?? 0;

    if (windup > 0 || deploy > 0 || spinning > 0) {
      this.kinematics.vx = 0;
      this.kinematics.vy = 0;

      if (windup > 0) {
        const nextWindup = Math.max(0, windup - dt);
        this.skillState.reaperWindupRemaining = nextWindup;
        const u = Math.max(0, Math.min(1, 1 - nextWindup / POWERUP_CONFIG.reaperWindupSec));
        const eased = 1 - Math.pow(1 - u, 3.6);
        this.kinematics.angle = Phaser.Math.Angle.Wrap(
          this.reaperGyroStartAngle + this.reaperGyroTotalDelta * eased,
        );
        if (nextWindup <= 0) {
          this.reaperJustShotShaft = true;
        }
      } else if (deploy > 0) {
        const totalDeploy =
          POWERUP_CONFIG.reaperShaftExtendSec + POWERUP_CONFIG.reaperCrescentUnfurlSec;
        const prevElapsed = totalDeploy - deploy;
        const nextDeploy = Math.max(0, deploy - dt);
        const nextElapsed = totalDeploy - nextDeploy;
        this.skillState.reaperDeployRemaining = nextDeploy;
        if (
          prevElapsed < POWERUP_CONFIG.reaperShaftExtendSec &&
          nextElapsed >= POWERUP_CONFIG.reaperShaftExtendSec
        ) {
          this.reaperJustUnfurled = true;
        }
      } else {
        this.kinematics.angle = Phaser.Math.Angle.Wrap(
          this.kinematics.angle + POWERUP_CONFIG.reaperSpinSpeedRad * dt,
        );
        this.skillState.reaperSpinRemaining = Math.max(0, spinning - dt);
        if (this.skillState.reaperSpinRemaining <= 0) {
          this.clearSkill();
          reaperJustEnded = true;
        }
      }

      if (this.flameHitCooldown > 0) this.flameHitCooldown = Math.max(0, this.flameHitCooldown - dt);
      if (this.reaperHitCooldown > 0) {
        this.reaperHitCooldown = Math.max(0, this.reaperHitCooldown - dt);
      }
      if (this.spikeHitCooldown > 0) this.spikeHitCooldown = Math.max(0, this.spikeHitCooldown - dt);
      if (this.hitFlashTimer > 0) {
        this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
        if (this.hitFlashTimer <= 0 && this.kinematics.alive) {
          this.bodySprite.clearTint();
        }
      }
      let emitCriticalDamage = false;
      if (this.hasArmorBar && this.kinematics.alive && this.hp < this.maxHp * 0.62) {
        this.criticalVfxTimer += dt;
        const ratio = this.getHpRatio();
        const interval = ratio <= 0.25 ? 0.075 : ratio <= 0.45 ? 0.13 : 0.22;
        if (this.criticalVfxTimer >= interval) {
          this.criticalVfxTimer = 0;
          emitCriticalDamage = true;
        }
      }
      return {
        shieldJustExpired,
        phantomJustExpired,
        reaperJustEnded,
        frozenJustExpired,
        frozeFromCryoZone,
        emitCriticalDamage,
      };
    }

    const rawTurnDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    const turnDir = this.empJamRemainingSec > 0 ? -rawTurnDir : rawTurnDir;
    const iceTurnMul =
      POWERUP_CONFIG.cryoDriftTurnMultiplier +
      (1 - POWERUP_CONFIG.cryoDriftTurnMultiplier) * this.skinStats.iceResistRatio;
    const turnMul = (this.onIceFloor ? iceTurnMul : 1.0) * this.skinStats.turnSpeedScale;
    if (turnDir !== 0) {
      this.kinematics.angle = Phaser.Math.Angle.Wrap(
        this.kinematics.angle + turnDir * BASE_GAMEPLAY.tankTurnSpeedRad * turnMul * dt,
      );
    }

    const iceSpeedMul =
      POWERUP_CONFIG.cryoDriftSpeedMultiplier +
      (1 - POWERUP_CONFIG.cryoDriftSpeedMultiplier) * this.skinStats.iceResistRatio;
    const envSpeedMul =
      (this.phantomRemainingSec > 0 ? POWERUP_CONFIG.phantomSpeedMultiplier : 1.0) *
      (this.empJamRemainingSec > 0 ? POWERUP_CONFIG.empMoveSpeedMultiplier : 1.0) *
      (this.onIceFloor ? iceSpeedMul : 1.0);

    const moveIntent = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    let targetSpeed = 0;
    if (moveIntent > 0) {
      targetSpeed =
        BASE_GAMEPLAY.tankForwardSpeed *
        this.scaleRatio *
        this.skinStats.forwardSpeedScale *
        envSpeedMul;
    } else if (moveIntent < 0) {
      targetSpeed =
        -BASE_GAMEPLAY.tankBackwardSpeed *
        this.scaleRatio *
        this.skinStats.backwardSpeedScale *
        envSpeedMul;
    }

    const targetVx = Math.cos(this.kinematics.angle) * targetSpeed;
    const targetVy = Math.sin(this.kinematics.angle) * targetSpeed;
    const iceLerp =
      POWERUP_CONFIG.cryoDriftVelocityLerp +
      (BASE_GAMEPLAY.tankVelocityLerp - POWERUP_CONFIG.cryoDriftVelocityLerp) *
        this.skinStats.iceResistRatio;
    const velLerp = this.onIceFloor ? iceLerp : BASE_GAMEPLAY.tankVelocityLerp;
    const blend = Math.min(1, velLerp * dt);

    this.kinematics.vx += (targetVx - this.kinematics.vx) * blend;
    this.kinematics.vy += (targetVy - this.kinematics.vy) * blend;

    this.kinematics.x += this.kinematics.vx * dt;
    this.kinematics.y += this.kinematics.vy * dt;

    const linearStep = Math.hypot(this.kinematics.vx, this.kinematics.vy) * dt;
    const angularStep = Math.abs(turnDir) * 26 * dt;
    const motion = linearStep + angularStep;
    if (motion > 0.05) {
      this.treadAccumulator += motion;
      if (this.treadAccumulator >= 4.2 * this.scaleRatio) {
        this.treadAccumulator = 0;
        this.treadFrame = (this.treadFrame + 1) % 3;
        this.refreshBodyTexture();
      }
    }

    const skinDesc = getTankSkinDescriptor(this.skinId);
    if (linearStep > 0.05) {
      this.trailSampleAccum += linearStep;
      if (this.trailSampleAccum >= 6.5 * this.scaleRatio) {
        this.trailSampleAccum = 0;
        this.trailHistory.unshift({
          x: this.kinematics.x,
          y: this.kinematics.y,
          angle: this.kinematics.angle,
        });
        if (this.trailHistory.length > 12) {
          this.trailHistory.pop();
        }
      }

      this.decalDistanceAccumulator += linearStep;
      if (this.decalDistanceAccumulator >= 10 * this.scaleRatio) {
        this.decalDistanceAccumulator = 0;
        if (!this.isPhantom() && skinDesc.leavesTreadMarks) {
          onTreadMark(this.kinematics.x, this.kinematics.y, this.kinematics.angle);
        }
      }

      this.exhaustTimer += dt;
      if (this.exhaustTimer >= 0.09) {
        this.exhaustTimer = 0;
        const rearX = this.kinematics.x - Math.cos(this.kinematics.angle) * (16 * this.scaleRatio);
        const rearY = this.kinematics.y - Math.sin(this.kinematics.angle) * (16 * this.scaleRatio);
        onExhaust(rearX, rearY);
      }
    }

    if (this.flameHitCooldown > 0) this.flameHitCooldown = Math.max(0, this.flameHitCooldown - dt);
    if (this.reaperHitCooldown > 0) {
      this.reaperHitCooldown = Math.max(0, this.reaperHitCooldown - dt);
    }
    if (this.spikeHitCooldown > 0) this.spikeHitCooldown = Math.max(0, this.spikeHitCooldown - dt);

    if (this.hitFlashTimer > 0) {
      this.hitFlashTimer = Math.max(0, this.hitFlashTimer - dt);
      if (this.hitFlashTimer <= 0 && this.kinematics.alive) {
        this.bodySprite.clearTint();
      }
    }

    let emitCriticalDamage = false;
    if (this.hasArmorBar && this.kinematics.alive && this.hp < this.maxHp * 0.62) {
      this.criticalVfxTimer += dt;
      const ratio = this.getHpRatio();
      const interval = ratio <= 0.25 ? 0.075 : ratio <= 0.45 ? 0.13 : 0.22;
      if (this.criticalVfxTimer >= interval) {
        this.criticalVfxTimer = 0;
        emitCriticalDamage = true;
      }
    }

    return {
      shieldJustExpired,
      phantomJustExpired,
      reaperJustEnded,
      frozenJustExpired,
      frozeFromCryoZone,
      emitCriticalDamage,
    };
  }

  applyNetworkSnapshot(snap: NetTankSnapshot, dt: number): void {
    const prevSuit = this.getActiveVisualSuit();
    const wasAlive = this.kinematics.alive;

    this.auraPulseClock += dt;
    this.kinematics.vx = snap.vx;
    this.kinematics.vy = snap.vy;

    const dist = Math.hypot(snap.x - this.kinematics.x, snap.y - this.kinematics.y);
    if (dist > 84 || !wasAlive) {
      this.kinematics.x = snap.x;
      this.kinematics.y = snap.y;
    } else {
      const blend = Math.min(1, Math.max(0.35, dt * 22));
      this.kinematics.x += (snap.x - this.kinematics.x) * blend;
      this.kinematics.y += (snap.y - this.kinematics.y) * blend;
    }

    const angDiff = Phaser.Math.Angle.Wrap(snap.angle - this.kinematics.angle);
    this.kinematics.angle = Phaser.Math.Angle.Wrap(
      this.kinematics.angle + angDiff * Math.min(1, Math.max(0.4, dt * 24)),
    );

    this.skillState = {
      skill: snap.skill,
      ammo: snap.skillAmmo,
      chargingLaserRemaining: snap.chargingLaserRemaining,
      reaperWindupRemaining: snap.reaperWindupRemaining,
      reaperDeployRemaining: snap.reaperDeployRemaining ?? 0,
      reaperSpinRemaining: snap.reaperSpinRemaining,
      warpBeaconPlaced: Boolean(snap.warpBeaconPlaced),
    };
    this.shieldRemainingSec = snap.shieldRemaining;
    this.phantomRemainingSec = snap.phantomRemaining ?? 0;
    this.empJamRemainingSec = snap.empJamRemaining ?? 0;
    const wasFrozen = this.frozenRemainingSec > 0;
    this.frozenRemainingSec = snap.frozenRemaining ?? 0;
    this.cryoChillExposureSec =
      (snap.cryoChillRatio ?? 0) * POWERUP_CONFIG.cryoChillToFreezeSec;
    this.onIceFloor = Boolean(snap.onIceFloor);
    if (this.frozenRemainingSec > 0 && !wasFrozen && this.hitFlashTimer <= 0) {
      this.bodySprite.setTint(0x9be7ff);
    } else if (this.frozenRemainingSec <= 0 && wasFrozen && this.hitFlashTimer <= 0) {
      this.bodySprite.clearTint();
    }
    if (typeof snap.maxHp === 'number' && snap.maxHp > 0) {
      this.maxHp = snap.maxHp;
    }
    if (typeof snap.hp === 'number') {
      this.hp = snap.hp;
    }
    if (typeof snap.hasArmor === 'boolean') {
      this.hasArmorBar = snap.hasArmor;
    }

    if (snap.alive && !wasAlive) {
      this.kinematics.alive = true;
      this.bodySprite.clearTint().setVisible(true);
      this.shadowSprite.setVisible(true);
    } else if (!snap.alive && wasAlive) {
      this.eliminate();
    }

    if (this.kinematics.alive) {
      const speed = Math.hypot(snap.vx, snap.vy);
      if (speed > 6) {
        const stepDist = speed * dt;
        this.treadAccumulator += stepDist;
        this.trailSampleAccum += stepDist;
        if (this.trailSampleAccum >= 6.5 * this.scaleRatio) {
          this.trailSampleAccum = 0;
          this.trailHistory.unshift({
            x: this.kinematics.x,
            y: this.kinematics.y,
            angle: this.kinematics.angle,
          });
          if (this.trailHistory.length > 12) this.trailHistory.pop();
        }
        if (this.treadAccumulator >= 4.2 * this.scaleRatio) {
          this.treadAccumulator = 0;
          this.treadFrame = (this.treadFrame + 1) % 3;
          this.refreshBodyTexture();
        }
      }
      if (this.getActiveVisualSuit() !== prevSuit) {
        this.refreshBodyTexture();
      }
      if (this.recoilOffset > 0.01) {
        this.recoilOffset = Math.max(0, this.recoilOffset - dt * 24);
      } else {
        this.recoilOffset = 0;
      }
    }
  }

  stepGuestDeadReckoning(dt: number): void {
    if (!this.kinematics.alive) return;
    this.auraPulseClock += dt;
    this.kinematics.x += this.kinematics.vx * dt;
    this.kinematics.y += this.kinematics.vy * dt;
    if (this.isReaperRotating()) {
      this.kinematics.angle = Phaser.Math.Angle.Wrap(
        this.kinematics.angle + POWERUP_CONFIG.reaperSpinSpeedRad * dt,
      );
    }
    if (this.recoilOffset > 0.01) {
      this.recoilOffset = Math.max(0, this.recoilOffset - dt * 24);
    } else {
      this.recoilOffset = 0;
    }
  }

  syncVisuals(): void {
    if (!this.kinematics.alive) return;

    const chargeProgress = this.getLaserChargeProgress();
    const jitterX =
      chargeProgress !== null ? (Math.random() - 0.5) * 2.2 * chargeProgress * this.scaleRatio : 0;
    const jitterY =
      chargeProgress !== null ? (Math.random() - 0.5) * 2.2 * chargeProgress * this.scaleRatio : 0;

    const rx = -Math.cos(this.kinematics.angle) * this.recoilOffset * this.scaleRatio + jitterX;
    const ry = -Math.sin(this.kinematics.angle) * this.recoilOffset * this.scaleRatio + jitterY;

    const skinHoverAmp = getTankSkinDescriptor(this.skinId).hoverBobAmplitude;
    const hoverOffsetY =
      this.phantomRemainingSec > 0
        ? Math.sin(this.auraPulseClock * 9.5) * 2.4 * this.scaleRatio
        : skinHoverAmp > 0
          ? Math.sin(this.auraPulseClock * 6.2 + this.index) * skinHoverAmp * this.scaleRatio
          : 0;

    this.bodySprite.setPosition(this.kinematics.x + rx, this.kinematics.y + ry + hoverOffsetY);
    this.bodySprite.setRotation(this.kinematics.angle);

    this.shadowSprite.setPosition(
      this.kinematics.x + rx + 2.5 * this.scaleRatio,
      this.kinematics.y + ry + 3.5 * this.scaleRatio,
    );
    this.shadowSprite.setRotation(this.kinematics.angle);

    if (this.phantomRemainingSec > 0) {
      const blink =
        this.phantomRemainingSec < 0.85
          ? 0.38 + 0.46 * Math.abs(Math.sin(this.phantomRemainingSec * 24))
          : 0.56 + 0.14 * Math.sin(this.auraPulseClock * 12);
      this.bodySprite.setAlpha(blink);
      this.shadowSprite.setAlpha(0.16);
    } else {
      this.bodySprite.setAlpha(1);
      this.shadowSprite.setAlpha(skinHoverAmp > 0 ? 0.65 : 1);
    }

    renderTankAurasAndOverlays({
      kinematics: this.kinematics,
      skinId: this.skinId,
      palette: this.palette,
      trailHistory: this.trailHistory,
      scaleRatio: this.scaleRatio,
      auraPulseClock: this.auraPulseClock,
      hasArmorBar: this.hasArmorBar,
      hpRatio: this.getHpRatio(),
      shieldRemainingSec: this.shieldRemainingSec,
      phantomRemainingSec: this.phantomRemainingSec,
      onIceFloor: this.onIceFloor,
      chillRatio: this.getCryoChillRatio(),
      frozenRemainingSec: this.frozenRemainingSec,
      empJamRemainingSec: this.empJamRemainingSec,
      equippedSkill: this.skillState.skill,
      isReaperWindingUp: this.isReaperWindingUp(),
      isReaperSweeping: this.isReaperSweeping(),
      reaperWindupProgress: this.getReaperWindupProgress(),
      laserChargeProgress: chargeProgress,
      muzzlePos: this.getMuzzleWorldPos(),
      auraGraphics: this.auraGraphics,
      overlayGraphics: this.overlayGraphics,
    });
  }

  canFire(): boolean {
    return (
      this.kinematics.alive &&
      this.fireCooldown <= 0 &&
      this.frozenRemainingSec <= 0 &&
      this.skillState.chargingLaserRemaining <= 0 &&
      !this.isReaperWindingUp() &&
      !this.isReaperSweeping()
    );
  }

  triggerFireVisual(customCooldownSec?: number): void {
    this.fireCooldown =
      customCooldownSec ?? BASE_GAMEPLAY.fireCooldownSec * this.skinStats.fireCooldownScale;
    const isRapid = Boolean(customCooldownSec && customCooldownSec < 0.1);
    this.recoilOffset = (isRapid ? 3.1 : 3.5) * this.skinStats.recoilScale;
    this.scene.tweens.killTweensOf(this.bodySprite);
    this.bodySprite.setScale(
      this.visualScale * (isRapid ? 0.89 : 0.92),
      this.visualScale * (isRapid ? 1.11 : 1.08),
    );
    this.scene.tweens.add({
      targets: this.bodySprite,
      scaleX: this.visualScale,
      scaleY: this.visualScale,
      duration: isRapid ? 65 : 100,
      ease: 'Back.easeOut',
    });
  }

  getBarrelLength(): number {
    return BASE_GAMEPLAY.tankBarrelLength * this.scaleRatio * Math.max(0.88, this.skinStats.radiusScale);
  }

  getMuzzleWorldPos(): { x: number; y: number } {
    const len = this.getBarrelLength();
    return {
      x: this.kinematics.x + Math.cos(this.kinematics.angle) * len,
      y: this.kinematics.y + Math.sin(this.kinematics.angle) * len,
    };
  }

  eliminate(): void {
    if (!this.kinematics.alive) return;
    this.kinematics.alive = false;
    this.hp = 0;
    this.kinematics.vx = 0;
    this.kinematics.vy = 0;
    this.shieldRemainingSec = 0;
    this.phantomRemainingSec = 0;
    this.empJamRemainingSec = 0;
    this.empPendingMisfire = false;
    this.frozenRemainingSec = 0;
    this.cryoChillExposureSec = 0;
    this.cryoRefreezeImmunitySec = 0;
    this.onIceFloor = false;
    this.skillState.chargingLaserRemaining = 0;
    this.skillState.reaperWindupRemaining = 0;
    this.skillState.reaperSpinRemaining = 0;
    this.skillState.warpBeaconPlaced = false;
    this.laserReadyToDischarge = false;
    this.spawnRing.setVisible(false);
    this.trailHistory.length = 0;
    this.auraGraphics.clear();
    this.overlayGraphics.clear();
    this.bodySprite.setAlpha(1);
    this.shadowSprite.setAlpha(1);

    this.bodySprite.setTintFill(0xffffff);
    this.scene.time.delayedCall(45, () => {
      if (this.bodySprite.scene) {
        this.bodySprite.clearTint();
        this.bodySprite.setVisible(false);
        this.shadowSprite.setVisible(false);
      }
    });
  }

  destroy(): void {
    this.scene.tweens.killTweensOf(this.bodySprite);
    this.spawnRing.destroy();
    this.auraGraphics.destroy();
    this.overlayGraphics.destroy();
    this.shadowSprite.destroy();
    this.bodySprite.destroy();
  }
}
