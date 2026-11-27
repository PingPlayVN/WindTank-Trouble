import Phaser from 'phaser';
import {
  BASE_GAMEPLAY,
  getPaletteById,
  getSkillDescriptor,
  POWERUP_CONFIG,
} from '../config/constants';
import type { PlayerSkillState } from '../systems/PowerUpSim';
import type { NetTankSnapshot } from '../network/PeerMultiplayerManager';
import type {
  PlayerConfig,
  PlayerIndex,
  PlayerInputState,
  SkillId,
  SpawnPoint,
  TankColorPalette,
  TankKinematics,
} from '../types/gameTypes';

export class Tank {
  readonly index: PlayerIndex;
  readonly config: PlayerConfig;
  readonly palette: TankColorPalette;
  readonly kinematics: TankKinematics;

  private readonly scene: Phaser.Scene;
  private readonly shadowSprite: Phaser.GameObjects.Image;
  private readonly auraGraphics: Phaser.GameObjects.Graphics;
  private readonly bodySprite: Phaser.GameObjects.Image;
  private readonly spawnRing: Phaser.GameObjects.Arc;
  private readonly scaleRatio: number;

  private skillState: PlayerSkillState = {
    skill: null,
    ammo: 0,
    chargingLaserRemaining: 0,
    reaperWindupRemaining: 0,
    reaperDeployRemaining: 0,
    reaperSpinRemaining: 0,
  };
  private shieldRemainingSec = 0;
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
  ) {
    this.scene = scene;
    this.index = config.index;
    this.config = config;
    this.palette = getPaletteById(config.colorId);
    this.scaleRatio = scaleRatio;

    const radius = BASE_GAMEPLAY.tankRadius * scaleRatio;
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
      .setScale(scaleRatio)
      .setRotation(spawn.angle)
      .setDepth(12);

    this.auraGraphics = scene.add.graphics().setDepth(13);

    this.bodySprite = scene.add
      .image(spawn.x, spawn.y, `tank_${this.palette.id}_0`)
      .setOrigin(0.44, 0.5)
      .setScale(scaleRatio)
      .setRotation(spawn.angle)
      .setDepth(14);
  }

  getSkillState(): Readonly<PlayerSkillState> {
    return this.skillState;
  }

  configureArmorMode(enabled: boolean, maxHp = 100): void {
    this.hasArmorBar = enabled;
    this.maxHp = Math.max(20, maxHp);
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

  /**
   * Returns whichever Superhero Suit should currently be displayed on the tank & HUD icon
   * (preserving Aegis Paladin suit while the 5.5s shield dome is active!).
   */
  getActiveVisualSuit(): SkillId | null {
    if (this.skillState.skill) return this.skillState.skill;
    if (this.shieldRemainingSec > 0) return 'shield';
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

  activateShield(durationSec = POWERUP_CONFIG.shieldDurationSec): void {
    this.shieldRemainingSec = durationSec;
    this.skillState = {
      skill: null,
      ammo: 0,
      chargingLaserRemaining: 0,
      reaperWindupRemaining: 0,
      reaperDeployRemaining: 0,
      reaperSpinRemaining: 0,
    };
    this.refreshBodyTexture();
  }

  startReaperSweep(extraRandomAngleRad?: number): void {
    const randomOffset =
      extraRandomAngleRad ?? (0.35 + Math.random() * 1.55) * Math.PI;
    this.reaperGyroStartAngle = this.kinematics.angle;
    // Spin >1 full revolution quickly then glide to a smooth stop at a random angle!
    this.reaperGyroTotalDelta = Math.PI * 2 + randomOffset;

    this.skillState.reaperWindupRemaining = POWERUP_CONFIG.reaperWindupSec;
    this.skillState.reaperDeployRemaining =
      POWERUP_CONFIG.reaperShaftExtendSec + POWERUP_CONFIG.reaperCrescentUnfurlSec;
    this.skillState.reaperSpinRemaining = POWERUP_CONFIG.reaperSpinDurationSec;
    this.reaperJustShotShaft = false;
    this.reaperJustUnfurled = false;
    this.kinematics.vx = 0;
    this.kinematics.vy = 0;

    // Smooth gyroscopic levitation pulse during the 1-turn spin-up!
    this.scene.tweens.killTweensOf(this.bodySprite);
    this.scene.tweens.add({
      targets: this.bodySprite,
      scaleX: this.scaleRatio * 1.18,
      scaleY: this.scaleRatio * 1.18,
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

  /**
   * True whenever the Reaper shaft/blades are active on the field (Stages 2, 3, and 4).
   */
  isReaperSweeping(): boolean {
    return (
      (this.skillState.reaperWindupRemaining ?? 0) <= 0 &&
      ((this.skillState.reaperDeployRemaining ?? 0) > 0 ||
        (this.skillState.reaperSpinRemaining ?? 0) > 0)
    );
  }

  /**
   * Stage 2 -> 4 axial Laser-Shaft extension (`0 -> 1`):
   * - Stage 1 (Gyro Spin): `0`
   * - Stage 2 (`0.26s`): shoots straight out `0 -> 1` to full 4.7-cell peak!
   * - Stage 3 (`0.22s`, Crescent Unfurl): holds at `1.0` peak!
   * - Stage 4 (`180°` Sweep): holds at `1.0`, retracting cleanly in the final `0.16s`.
   */
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

  /**
   * Stage 3 -> 4 transverse Crescent Scythe Blade extension (`0 -> 1`):
   * - Stages 1 & 2 (Gyro Spin + Laser Shaft Shooting to Peak): strictly `0`!
   * - Stage 3 (`0.22s`, after shaft reaches peak): snaps sideways out from the shaft tips `0 -> 1`!
   * - Stage 4 (`180°` Sweep): holds at `1.0`, retracting cleanly in the final `0.16s`.
   */
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
      // Crisp snappy lateral blade unfurl (`easeOutBack` clamped smoothly)
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
    };
    this.laserReadyToDischarge = false;
    this.refreshBodyTexture();

    this.scene.tweens.killTweensOf(this.bodySprite);
    this.bodySprite.setScale(this.scaleRatio * 1.26, this.scaleRatio * 1.26);
    this.scene.tweens.add({
      targets: this.bodySprite,
      scaleX: this.scaleRatio,
      scaleY: this.scaleRatio,
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
    this.kinematics.vx -= Math.cos(this.kinematics.angle) * impulseSpeed;
    this.kinematics.vy -= Math.sin(this.kinematics.angle) * impulseSpeed;
  }

  private refreshBodyTexture(): void {
    const suit = this.getActiveVisualSuit();
    const key = suit
      ? `tank_${this.palette.id}_${suit}_${this.treadFrame}`
      : `tank_${this.palette.id}_${this.treadFrame}`;
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
  ): { shieldJustExpired: boolean; reaperJustEnded: boolean; emitCriticalDamage: boolean } {
    let shieldJustExpired = false;
    let reaperJustEnded = false;

    if (!this.kinematics.alive) {
      return { shieldJustExpired, reaperJustEnded, emitCriticalDamage: false };
    }

    this.auraPulseClock += dt;

    if (this.shieldRemainingSec > 0) {
      this.shieldRemainingSec = Math.max(0, this.shieldRemainingSec - dt);
      if (this.shieldRemainingSec <= 0) {
        shieldJustExpired = true;
        this.refreshBodyTexture();
      }
    }

    if (this.fireCooldown > 0) {
      this.fireCooldown = Math.max(0, this.fireCooldown - dt);
    }
    if (this.recoilOffset > 0.01) {
      this.recoilOffset = Math.max(0, this.recoilOffset - dt * 24);
    } else {
      this.recoilOffset = 0;
    }

    // 2.0s Laser Charge Lock: completely freezes movement & rotation
    if (this.skillState.chargingLaserRemaining > 0) {
      this.kinematics.vx = 0;
      this.kinematics.vy = 0;
      this.skillState.chargingLaserRemaining -= dt;
      if (this.skillState.chargingLaserRemaining <= 0) {
        this.skillState.chargingLaserRemaining = 0;
        this.laserReadyToDischarge = true;
      }
      return { shieldJustExpired, reaperJustEnded, emitCriticalDamage: false };
    }

    // Reaper 4-Stage Choreography (all linear movement locked on the spot!):
    // Stage 1 (`windup > 0`): Fast gyroscopic >1-turn spin decelerating smoothly to a random stop angle
    // Stage 2 (`deploy`: first `0.26s`): Straight laser shaft shoots out to peak (`4.7` cells), tank holds still
    // Stage 3 (`deploy`: next `0.22s`): Crescent scythe heads snap out sideways from shaft tips, tank holds still
    // Stage 4 (`spinning > 0`): Full Crescent Scythes rotate smoothly across `180°`!
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
        // High-RPM initial gyro whip -> silky smooth deceleration stop at random target angle
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
      if (this.reaperHitCooldown > 0) this.reaperHitCooldown = Math.max(0, this.reaperHitCooldown - dt);
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
      return { shieldJustExpired, reaperJustEnded, emitCriticalDamage };
    }

    const turnDir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
    if (turnDir !== 0) {
      this.kinematics.angle = Phaser.Math.Angle.Wrap(
        this.kinematics.angle + turnDir * BASE_GAMEPLAY.tankTurnSpeedRad * dt,
      );
    }

    const moveIntent = (input.forward ? 1 : 0) - (input.backward ? 1 : 0);
    let targetSpeed = 0;
    if (moveIntent > 0) {
      targetSpeed = BASE_GAMEPLAY.tankForwardSpeed * this.scaleRatio;
    } else if (moveIntent < 0) {
      targetSpeed = -BASE_GAMEPLAY.tankBackwardSpeed * this.scaleRatio;
    }

    const targetVx = Math.cos(this.kinematics.angle) * targetSpeed;
    const targetVy = Math.sin(this.kinematics.angle) * targetSpeed;
    const blend = Math.min(1, BASE_GAMEPLAY.tankVelocityLerp * dt);

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

    if (linearStep > 0.05) {
      this.decalDistanceAccumulator += linearStep;
      if (this.decalDistanceAccumulator >= 10 * this.scaleRatio) {
        this.decalDistanceAccumulator = 0;
        onTreadMark(this.kinematics.x, this.kinematics.y, this.kinematics.angle);
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
    if (this.reaperHitCooldown > 0) this.reaperHitCooldown = Math.max(0, this.reaperHitCooldown - dt);
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

    return { shieldJustExpired, reaperJustEnded, emitCriticalDamage };
  }

  /**
   * Guest-side P2P state reconciliation with smooth positional & angular interpolation.
   */
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
    };
    this.shieldRemainingSec = snap.shieldRemaining;
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
        this.treadAccumulator += speed * dt;
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

    this.bodySprite.setPosition(this.kinematics.x + rx, this.kinematics.y + ry);
    this.bodySprite.setRotation(this.kinematics.angle);

    this.shadowSprite.setPosition(
      this.kinematics.x + rx + 2.5 * this.scaleRatio,
      this.kinematics.y + ry + 3.5 * this.scaleRatio,
    );
    this.shadowSprite.setRotation(this.kinematics.angle);

    this.auraGraphics.clear();

    // 0. Floating World-Space Armor Durability Bar (`Độ Bền Giáp HP`)
    if (this.hasArmorBar && this.kinematics.alive) {
      const ratio = this.getHpRatio();
      const bw = 34 * this.scaleRatio;
      const bh = 5.2 * this.scaleRatio;
      const bx = this.kinematics.x - bw / 2;
      const by = this.kinematics.y - this.kinematics.radius - 13 * this.scaleRatio;
      const barColor =
        ratio > 0.6 ? 0x00c853 : ratio > 0.3 ? 0xffb300 : Math.floor(this.auraPulseClock * 12) % 2 === 0 ? 0xff1744 : 0xd50000;

      this.auraGraphics.fillStyle(0x111318, 0.86);
      this.auraGraphics.fillRoundedRect(bx - 1, by - 1, bw + 2, bh + 2, 2.5);
      if (ratio > 0) {
        this.auraGraphics.fillStyle(barColor, 0.98);
        this.auraGraphics.fillRoundedRect(bx, by, Math.max(2, bw * ratio), bh, 2);
      }
      this.auraGraphics.lineStyle(1, 0xffffff, 0.35);
      this.auraGraphics.strokeRoundedRect(bx - 1, by - 1, bw + 2, bh + 2, 2.5);
    }

    // 1. Active 5.5s Hexagonal Aegis Forcefield Dome!
    if (this.shieldRemainingSec > 0) {
      const shieldR = this.kinematics.radius * POWERUP_CONFIG.shieldRadiusFactor;
      const blink =
        this.shieldRemainingSec < 1.1
          ? 0.35 + 0.65 * Math.abs(Math.sin(this.shieldRemainingSec * 22))
          : 1;
      const rot = this.auraPulseClock * 2.4;

      this.auraGraphics.fillStyle(0x00e5ff, 0.14 * blink);
      this.auraGraphics.lineStyle(2.6 * this.scaleRatio, 0x1de9b6, 0.92 * blink);
      this.auraGraphics.beginPath();
      for (let i = 0; i < 6; i++) {
        const a = rot + (i / 6) * Math.PI * 2;
        const px = this.kinematics.x + Math.cos(a) * shieldR;
        const py = this.kinematics.y + Math.sin(a) * shieldR;
        if (i === 0) this.auraGraphics.moveTo(px, py);
        else this.auraGraphics.lineTo(px, py);
      }
      this.auraGraphics.closePath();
      this.auraGraphics.fillPath();
      this.auraGraphics.strokePath();
    }

    // 2. Equipped Skill Aura + Laser Charge / Reaper Windup Telegraphs
    if (this.skillState.skill) {
      const desc = getSkillDescriptor(this.skillState.skill);
      const pulse = 1 + Math.sin(this.auraPulseClock * 8) * 0.08;
      this.auraGraphics.lineStyle(
        2.0 * this.scaleRatio,
        desc.accentColor,
        0.52 + Math.sin(this.auraPulseClock * 8) * 0.16,
      );
      this.auraGraphics.strokeCircle(
        this.kinematics.x,
        this.kinematics.y,
        this.kinematics.radius * 1.42 * pulse,
      );

      if (this.isReaperWindingUp() || this.isReaperSweeping()) {
        const s = this.scaleRatio;
        const cx = this.kinematics.x;
        const cy = this.kinematics.y;
        const windupProg = this.getReaperWindupProgress();
        const sigilR =
          windupProg !== null
            ? this.kinematics.radius * (2.65 - windupProg * 0.82)
            : this.kinematics.radius * (1.85 + Math.sin(this.auraPulseClock * 12) * 0.12);

        // Obsidian-Black & Blood-Crimson abyssal magic circle + rotating 8-point runic star!
        this.auraGraphics.fillStyle(0x0b0c10, windupProg !== null ? 0.48 + windupProg * 0.28 : 0.56);
        this.auraGraphics.fillCircle(cx, cy, sigilR * 0.96);
        this.auraGraphics.lineStyle(2.8 * s, 0xff1744, 0.95);
        this.auraGraphics.strokeCircle(cx, cy, sigilR);
        this.auraGraphics.lineStyle(1.6 * s, 0x111216, 0.9);
        this.auraGraphics.strokeCircle(cx, cy, sigilR * 0.72);

        const runeRot = this.auraPulseClock * (windupProg !== null ? -5.5 : 3.0);
        for (let r = 0; r < 8; r++) {
          const ra = runeRot + (r / 8) * Math.PI * 2;
          const x0 = cx + Math.cos(ra) * (sigilR * 0.56);
          const y0 = cy + Math.sin(ra) * (sigilR * 0.56);
          const x1 = cx + Math.cos(ra) * (sigilR * 1.14);
          const y1 = cy + Math.sin(ra) * (sigilR * 1.14);
          this.auraGraphics.lineStyle(2.0 * s, r % 2 === 0 ? 0xff1744 : 0x111216, 0.92);
          this.auraGraphics.lineBetween(x0, y0, x1, y1);
        }
      }

      if (chargeProgress !== null) {
        const muzzle = this.getMuzzleWorldPos();
        const s = this.scaleRatio;

        // 1. Contracting hexagonal cyber-capacitor ring + 6 orbiting plasma nodes around tank hull
        const outerR = this.kinematics.radius * (2.28 - chargeProgress * 0.56);
        const spinA = this.auraPulseClock * (3.2 + chargeProgress * 7.5);
        this.auraGraphics.lineStyle(1.8 * s, 0x0091ea, 0.45 + chargeProgress * 0.45);
        this.auraGraphics.strokeCircle(this.kinematics.x, this.kinematics.y, outerR);

        for (let n = 0; n < 6; n++) {
          const na = spinA + (n / 6) * Math.PI * 2;
          const nx = this.kinematics.x + Math.cos(na) * outerR;
          const ny = this.kinematics.y + Math.sin(na) * outerR;
          this.auraGraphics.fillStyle(n % 2 === 0 ? 0x00e5ff : 0xffffff, 0.88);
          this.auraGraphics.fillCircle(nx, ny, (1.8 + chargeProgress * 1.4) * s);
        }

        // 2. High-contrast radial progress gauge around tank
        this.auraGraphics.lineStyle(3.6 * s, 0x00e5ff, 0.96);
        this.auraGraphics.beginPath();
        this.auraGraphics.arc(
          this.kinematics.x,
          this.kinematics.y,
          this.kinematics.radius * 1.68,
          -Math.PI / 2,
          -Math.PI / 2 + Math.PI * 2 * chargeProgress,
          false,
        );
        this.auraGraphics.strokePath();

        // 3. Holographic +-15 deg parabolic auto-lock funnel + sweeping radar beam
        const guideLen = (88 + chargeProgress * 34) * s;
        const coneRad = (POWERUP_CONFIG.laserAutoAimConeDeg * Math.PI) / 180;
        const leftAng = this.kinematics.angle - coneRad;
        const rightAng = this.kinematics.angle + coneRad;

        this.auraGraphics.fillStyle(0x00b0ff, 0.06 + chargeProgress * 0.12);
        this.auraGraphics.beginPath();
        this.auraGraphics.moveTo(muzzle.x, muzzle.y);
        this.auraGraphics.lineTo(
          muzzle.x + Math.cos(leftAng) * guideLen,
          muzzle.y + Math.sin(leftAng) * guideLen,
        );
        this.auraGraphics.lineTo(
          muzzle.x + Math.cos(rightAng) * guideLen,
          muzzle.y + Math.sin(rightAng) * guideLen,
        );
        this.auraGraphics.closePath();
        this.auraGraphics.fillPath();

        const sweepAng =
          this.kinematics.angle + Math.sin(this.auraPulseClock * 11) * coneRad;
        this.auraGraphics.lineStyle(1.4 * s, 0x80d8ff, 0.42 + chargeProgress * 0.35);
        this.auraGraphics.lineBetween(
          muzzle.x,
          muzzle.y,
          muzzle.x + Math.cos(sweepAng) * guideLen,
          muzzle.y + Math.sin(sweepAng) * guideLen,
        );

        this.auraGraphics.lineStyle(1.6 * s, 0x00e5ff, 0.45 + chargeProgress * 0.4);
        this.auraGraphics.lineBetween(
          muzzle.x,
          muzzle.y,
          muzzle.x + Math.cos(this.kinematics.angle) * (guideLen * 1.1),
          muzzle.y + Math.sin(this.kinematics.angle) * (guideLen * 1.1),
        );
        for (const ca of [leftAng, rightAng]) {
          this.auraGraphics.lineStyle(1.1 * s, 0x40c4ff, 0.3);
          this.auraGraphics.lineBetween(
            muzzle.x,
            muzzle.y,
            muzzle.x + Math.cos(ca) * guideLen,
            muzzle.y + Math.sin(ca) * guideLen,
          );
        }

        // 4. Multi-tier imploding muzzle plasma singularity + cross-star flare!
        const orbR = (4.2 + chargeProgress * 11.5) * s;
        this.auraGraphics.fillStyle(0x0066ff, 0.28 + chargeProgress * 0.36);
        this.auraGraphics.fillCircle(muzzle.x, muzzle.y, orbR * 1.85);
        this.auraGraphics.fillStyle(0x00e5ff, 0.55 + chargeProgress * 0.4);
        this.auraGraphics.fillCircle(muzzle.x, muzzle.y, orbR * 1.18);
        this.auraGraphics.fillStyle(0xffffff, 0.96);
        this.auraGraphics.fillCircle(muzzle.x, muzzle.y, orbR * 0.55);

        const flareSpan = orbR * (1.5 + Math.sin(this.auraPulseClock * 26) * 0.35);
        this.auraGraphics.lineStyle(2.0 * s, 0xffffff, 0.85);
        for (let k = 0; k < 2; k++) {
          const fa = this.kinematics.angle + (k * Math.PI) / 2 + this.auraPulseClock * 4;
          this.auraGraphics.lineBetween(
            muzzle.x - Math.cos(fa) * flareSpan,
            muzzle.y - Math.sin(fa) * flareSpan,
            muzzle.x + Math.cos(fa) * flareSpan,
            muzzle.y + Math.sin(fa) * flareSpan,
          );
        }
      }
    }
  }

  canFire(): boolean {
    return (
      this.kinematics.alive &&
      this.fireCooldown <= 0 &&
      this.skillState.chargingLaserRemaining <= 0 &&
      !this.isReaperWindingUp() &&
      !this.isReaperSweeping()
    );
  }

  triggerFireVisual(customCooldownSec?: number): void {
    this.fireCooldown = customCooldownSec ?? BASE_GAMEPLAY.fireCooldownSec;
    const isRapid = Boolean(customCooldownSec && customCooldownSec < 0.1);
    this.recoilOffset = isRapid ? 3.1 : 3.5;
    this.scene.tweens.killTweensOf(this.bodySprite);
    this.bodySprite.setScale(
      this.scaleRatio * (isRapid ? 0.89 : 0.92),
      this.scaleRatio * (isRapid ? 1.11 : 1.08),
    );
    this.scene.tweens.add({
      targets: this.bodySprite,
      scaleX: this.scaleRatio,
      scaleY: this.scaleRatio,
      duration: isRapid ? 65 : 100,
      ease: 'Back.easeOut',
    });
  }

  getBarrelLength(): number {
    return BASE_GAMEPLAY.tankBarrelLength * this.scaleRatio;
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
    this.skillState.chargingLaserRemaining = 0;
    this.skillState.reaperWindupRemaining = 0;
    this.skillState.reaperSpinRemaining = 0;
    this.laserReadyToDischarge = false;
    this.spawnRing.setVisible(false);
    this.auraGraphics.clear();

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
    this.shadowSprite.destroy();
    this.bodySprite.destroy();
  }
}
