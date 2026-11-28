import Phaser from 'phaser';
import { POWERUP_CONFIG } from '../config/constants';
import type {
  BounceBehavior,
  PlayerIndex,
  ProjectileKinematics,
  ProjectileVariant,
} from '../types/gameTypes';

const TRAIL_LENGTH = 6;

const VARIANT_TEXTURE: Record<ProjectileVariant, string> = {
  standard: 'projectile_shell',
  gatling: 'projectile_gatling',
  scatter: 'projectile_scatter',
  spike_ball: 'projectile_spike_ball',
  spike_shard: 'projectile_spike_shard',
  homing_missile: 'projectile_missile',
  drill: 'projectile_drill',
  flame: 'projectile_flame',
  emp_orb: 'projectile_emp_orb',
  cryo_orb: 'projectile_cryo_orb',
};

export class Projectile {
  readonly kinematics: ProjectileKinematics;
  private readonly sprite: Phaser.GameObjects.Image;
  private readonly trailPoints: Array<{ x: number; y: number }> = [];
  hasIgnitedSeeker = false;

  constructor(scene: Phaser.Scene, id: number) {
    this.kinematics = {
      id,
      ownerIndex: 0,
      x: -100,
      y: -100,
      prevX: -100,
      prevY: -100,
      vx: 0,
      vy: 0,
      radius: 4.5,
      age: 0,
      maxLifetime: 11.5,
      bounces: 0,
      maxBounces: 14,
      graceTimer: 0,
      active: false,
      variant: 'standard',
      bounceBehavior: 'reflect',
    };

    this.sprite = scene.add
      .image(-100, -100, 'projectile_shell')
      .setVisible(false)
      .setActive(false)
      .setDepth(16);
  }

  spawn(
    ownerIndex: PlayerIndex,
    x: number,
    y: number,
    vx: number,
    vy: number,
    radius: number,
    maxLifetime: number,
    maxBounces: number,
    graceTimer: number,
    scaleRatio: number,
    variant: ProjectileVariant = 'standard',
    bounceBehavior: BounceBehavior = 'reflect',
    drillsLeft?: number,
  ): void {
    const k = this.kinematics;
    k.ownerIndex = ownerIndex;
    k.x = x;
    k.y = y;
    k.prevX = x;
    k.prevY = y;
    k.vx = vx;
    k.vy = vy;
    k.radius = radius;
    k.age = 0;
    k.maxLifetime = maxLifetime;
    k.bounces = graceTimer === 0 ? 1 : 0;
    k.maxBounces = maxBounces;
    k.graceTimer = graceTimer;
    k.active = true;
    k.variant = variant;
    k.bounceBehavior = bounceBehavior;
    k.drillsLeft = drillsLeft;
    this.hasIgnitedSeeker = false;

    this.trailPoints.length = 0;
    this.trailPoints.push({ x, y });

    const texKey =
      variant === 'flame' ? `projectile_flame_${k.id % 3}` : VARIANT_TEXTURE[variant];
    this.sprite
      .setTexture(texKey)
      .setPosition(x, y)
      .setRotation(Math.atan2(vy, vx))
      .setScale(scaleRatio)
      .setBlendMode(Phaser.BlendModes.NORMAL)
      .clearTint()
      .setAlpha(1)
      .setVisible(true)
      .setActive(true);
  }

  syncVisual(scaleRatio: number): boolean {
    const k = this.kinematics;
    if (!k.active) {
      if (this.sprite.visible) {
        this.sprite.setVisible(false).setActive(false);
        this.trailPoints.length = 0;
        return true;
      }
      return false;
    }

    this.sprite.setPosition(k.x, k.y);
    const variant = k.variant ?? 'standard';

    if (variant === 'spike_ball') {
      this.sprite.rotation += 0.22;
      const toDetonate = POWERUP_CONFIG.spikeFlightDetonateSec - k.age;
      if (toDetonate < 0.75) {
        const blink = Math.sin(k.age * 36) > 0;
        if (blink) this.sprite.setTint(0xff5252);
        else this.sprite.clearTint();
        this.sprite.setScale(scaleRatio * (1.06 + Math.abs(Math.sin(k.age * 28)) * 0.14));
      } else {
        this.sprite.clearTint().setScale(scaleRatio);
      }
    } else if (variant === 'emp_orb') {
      this.sprite.rotation += 0.28;
      const pulse = 1 + Math.sin(k.age * 26) * 0.12;
      this.sprite.setScale(scaleRatio * pulse).setAlpha(1);
    } else if (variant === 'cryo_orb') {
      this.sprite.rotation += 0.18;
      const pulse = 1 + Math.sin(k.age * 16) * 0.06;
      this.sprite.setScale(scaleRatio * pulse).setAlpha(0.96);
    } else if (variant === 'drill') {
      const ang = Math.atan2(k.vy, k.vx);
      const spinPulse = 1 + Math.sin(k.age * 70) * 0.08;
      this.sprite
        .setRotation(ang)
        .setScale(scaleRatio * 1.06, scaleRatio * spinPulse);
    } else if (variant === 'homing_missile' || variant === 'spike_shard') {
      this.sprite.setRotation(Math.atan2(k.vy, k.vx));
      if (variant === 'homing_missile' && k.age >= POWERUP_CONFIG.homingBallisticSec) {
        this.sprite.setScale(scaleRatio * 1.1);
      } else {
        this.sprite.setScale(scaleRatio);
      }
    } else if (variant === 'flame') {
      const frac = Math.min(1, k.age / Math.max(0.05, k.maxLifetime));
      const flowAng = Math.atan2(k.vy, k.vx);

      if (frac >= 0.82) {
        // Final 18%: cooling fuel condenses into billowing dark charcoal-brown smoke!
        const smokeProgress = (frac - 0.82) / 0.18;
        this.sprite
          .setBlendMode(Phaser.BlendModes.NORMAL)
          .setTint(0x322926)
          .setScale(scaleRatio * (1.28 + smokeProgress * 0.48))
          .setAlpha(Math.max(0.02, (1 - smokeProgress) * 0.34))
          .setRotation(flowAng + k.age * 3.5);
      } else {
        // Rich high-contrast thermal progression on light arena stone:
        // Blue-White Nozzle -> Solar Gold -> Vivid Napalm Orange -> Deep Molten Crimson
        const tint =
          frac < 0.08
            ? 0xb3e5fc
            : frac < 0.24
              ? 0xffffff
              : frac < 0.5
                ? 0xffb300
                : frac < 0.7
                  ? 0xff5722
                  : 0xb71c1c;
        const sx = scaleRatio * (0.74 + frac * 1.18);
        const sy = scaleRatio * (0.48 + frac * 1.34);
        const wobble = Math.sin(k.age * 22 + k.id * 1.7) * (0.14 + frac * 0.42);
        this.sprite
          .setBlendMode(Phaser.BlendModes.NORMAL)
          .setTint(tint)
          .setScale(sx, sy)
          .setAlpha(Math.max(0.16, (1 - frac * 0.72) * 0.92))
          .setRotation(flowAng + wobble);
      }
    } else {
      const remaining = k.maxLifetime - k.age;
      if (remaining < 0.65) {
        const pulse = 0.45 + 0.55 * Math.abs(Math.sin(remaining * 22));
        const shrink = Math.max(0.4, remaining / 0.65);
        this.sprite.setAlpha(pulse).setScale(scaleRatio * shrink);
      } else {
        this.sprite.setAlpha(1).setScale(scaleRatio);
      }
    }

    this.trailPoints.push({ x: k.x, y: k.y });
    if (this.trailPoints.length > TRAIL_LENGTH) {
      this.trailPoints.shift();
    }

    return false;
  }

  drawTrail(graphics: Phaser.GameObjects.Graphics): void {
    if (!this.kinematics.active || this.trailPoints.length < 2) return;
    const variant = this.kinematics.variant ?? 'standard';

    if (variant === 'flame') {
      const lifeFrac = Math.min(1, this.kinematics.age / Math.max(0.05, this.kinematics.maxLifetime));
      if (lifeFrac >= 0.84) return;
      const coreCol =
        lifeFrac < 0.14
          ? 0xe1f5fe
          : lifeFrac < 0.38
            ? 0xfff176
            : lifeFrac < 0.68
              ? 0xff6d00
              : 0xb71c1c;
      const alpha = Math.max(0.05, (1 - lifeFrac) * 0.42);
      const p0 = this.trailPoints[Math.max(0, this.trailPoints.length - 4)];
      const p1 = this.trailPoints[this.trailPoints.length - 1];
      graphics.lineStyle(this.kinematics.radius * 1.48, coreCol, alpha);
      graphics.lineBetween(p0.x, p0.y, p1.x, p1.y);
      return;
    }

    if (variant === 'drill') {
      // High-speed helical magma & Mach-ring wake behind Seismic Drill!
      for (let i = 1; i < this.trailPoints.length; i++) {
        const p0 = this.trailPoints[i - 1];
        const p1 = this.trailPoints[i];
        const frac = i / this.trailPoints.length;
        graphics.lineStyle(this.kinematics.radius * 1.65 * frac, 0xff6d00, 0.38 * frac);
        graphics.lineBetween(p0.x, p0.y, p1.x, p1.y);
        graphics.lineStyle(this.kinematics.radius * 0.72 * frac, 0xfff59d, 0.82 * frac);
        graphics.lineBetween(p0.x, p0.y, p1.x, p1.y);
      }
      const head = this.trailPoints[this.trailPoints.length - 1];
      const ang = Math.atan2(this.kinematics.vy, this.kinematics.vx);
      const ringDist = this.kinematics.radius * 1.6;
      const rx = head.x - Math.cos(ang) * ringDist;
      const ry = head.y - Math.sin(ang) * ringDist;
      const nx = -Math.sin(ang) * this.kinematics.radius * 1.45;
      const ny = Math.cos(ang) * this.kinematics.radius * 1.45;
      graphics.lineStyle(1.8, 0xffd54f, 0.78);
      graphics.lineBetween(rx - nx, ry - ny, rx + nx, ry + ny);
      return;
    }

    if (variant === 'emp_orb') {
      const k = this.kinematics;
      const r = k.radius;
      // 1. Reaper-grade 3-pass Obsidian-Shrouded Thunderbolt Wake!
      for (let i = 1; i < this.trailPoints.length; i++) {
        const p0 = this.trailPoints[i - 1];
        const p1 = this.trailPoints[i];
        const frac = i / this.trailPoints.length;
        const dx = p1.x - p0.x;
        const dy = p1.y - p0.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const jag = Math.sin(k.age * 52 + i * 2.9) * r * 0.85 * frac;
        const mx = (p0.x + p1.x) * 0.5 + nx * jag;
        const my = (p0.y + p1.y) * 0.5 + ny * jag;

        // Pass A: Dark obsidian contrast shroud
        graphics.lineStyle(r * 2.8 * frac, 0x090718, 0.72 * frac);
        graphics.lineBetween(p0.x, p0.y, mx, my);
        graphics.lineBetween(mx, my, p1.x, p1.y);
        // Pass B: Electric indigo plasma
        graphics.lineStyle(r * 1.65 * frac, 0x651fff, 0.88 * frac);
        graphics.lineBetween(p0.x, p0.y, mx, my);
        graphics.lineBetween(mx, my, p1.x, p1.y);
        // Pass C: White-cyan core spine
        graphics.lineStyle(r * 0.72 * frac, 0x00e5ff, 0.98 * frac);
        graphics.lineBetween(p0.x, p0.y, mx, my);
        graphics.lineBetween(mx, my, p1.x, p1.y);
      }

      // 2. Dark Void Halo + 2 Counter-Rotating Tilted Gyroscopic Plasma Rings + 6 Lightning Tendrils!
      const lifeLeft01 = Math.max(0.08, 1 - k.age / Math.max(0.2, k.maxLifetime));
      graphics.fillStyle(0x0a071c, 0.58);
      graphics.fillCircle(k.x, k.y, r * 2.55);
      graphics.lineStyle(2.4, 0x651fff, 0.92);
      graphics.strokeCircle(k.x, k.y, r * (1.5 + lifeLeft01 * 1.1));

      for (const [dir, col] of [
        [1, 0x00e5ff],
        [-1.35, 0xffea00],
      ] as const) {
        const tilt = k.age * 7.5 * dir;
        graphics.lineStyle(1.9, col, 0.92);
        graphics.beginPath();
        for (let s = 0; s <= 16; s++) {
          const t = (s / 16) * Math.PI * 2;
          const lx = Math.cos(t) * r * 2.45;
          const ly = Math.sin(t) * r * 1.05;
          const rx = k.x + lx * Math.cos(tilt) - ly * Math.sin(tilt);
          const ry = k.y + lx * Math.sin(tilt) + ly * Math.cos(tilt);
          if (s === 0) graphics.moveTo(rx, ry);
          else graphics.lineTo(rx, ry);
        }
        graphics.strokePath();
      }

      for (let b = 0; b < 6; b++) {
        const a0 = k.age * 18 + (b * Math.PI) / 3;
        const midR = r * 1.9;
        const tipR = r * (2.75 + Math.sin(k.age * 42 + b) * 0.55);
        const mx = k.x + Math.cos(a0 + 0.26) * midR;
        const my = k.y + Math.sin(a0 + 0.26) * midR;
        const tx = k.x + Math.cos(a0 - 0.2) * tipR;
        const ty = k.y + Math.sin(a0 - 0.2) * tipR;
        graphics.lineStyle(2.1, b % 2 === 0 ? 0x00e5ff : 0xffea00, 0.96);
        graphics.lineBetween(k.x, k.y, mx, my);
        graphics.lineBetween(mx, my, tx, ty);
      }
      return;
    }

    if (variant === 'cryo_orb') {
      const k = this.kinematics;
      const r = k.radius;
      // 1. High-contrast Midnight-Sapphire & Cyan Glacial Comet Wake!
      for (let i = 1; i < this.trailPoints.length; i++) {
        const p0 = this.trailPoints[i - 1];
        const p1 = this.trailPoints[i];
        const frac = i / this.trailPoints.length;
        graphics.lineStyle(r * 2.65 * frac, 0x062130, 0.68 * frac);
        graphics.lineBetween(p0.x, p0.y, p1.x, p1.y);
        graphics.lineStyle(r * 1.55 * frac, 0x00bcd4, 0.88 * frac);
        graphics.lineBetween(p0.x, p0.y, p1.x, p1.y);
        graphics.lineStyle(r * 0.65 * frac, 0xffffff, 0.96 * frac);
        graphics.lineBetween(p0.x, p0.y, p1.x, p1.y);
      }

      // 2. Dark-Arctic Halo + Rotating 6-Spoke Snowflake Astrolabe!
      graphics.fillStyle(0x062130, 0.52);
      graphics.fillCircle(k.x, k.y, r * 2.25);
      graphics.lineStyle(2.0, 0x84ffff, 0.94);
      graphics.strokeCircle(k.x, k.y, r * 1.95);
      graphics.lineStyle(1.8, 0xffffff, 0.92);
      const rot = k.age * 6.5;
      for (let sIdx = 0; sIdx < 3; sIdx++) {
        const a = rot + (sIdx * Math.PI) / 3;
        const span = r * 2.35;
        graphics.lineBetween(
          k.x - Math.cos(a) * span,
          k.y - Math.sin(a) * span,
          k.x + Math.cos(a) * span,
          k.y + Math.sin(a) * span,
        );
      }
      return;
    }

    let color = 0x3a3d42;
    let baseAlpha = 0.16;
    if (variant === 'gatling') {
      color = 0xff9800;
      baseAlpha = 0.42;
    } else if (variant === 'scatter') {
      color = 0x2979ff;
      baseAlpha = 0.44;
    } else if (variant === 'spike_ball') {
      color = 0x5d4037;
      baseAlpha = 0.3;
    } else if (variant === 'spike_shard') {
      color = 0x90a4ae;
      baseAlpha = 0.52;
    } else if (variant === 'homing_missile') {
      const seeking = this.kinematics.age >= POWERUP_CONFIG.homingBallisticSec;
      color = seeking ? 0xff1744 : 0x546e7a;
      baseAlpha = seeking ? 0.52 : 0.25;
    }

    for (let i = 1; i < this.trailPoints.length; i++) {
      const p0 = this.trailPoints[i - 1];
      const p1 = this.trailPoints[i];
      const frac = i / this.trailPoints.length;
      graphics.lineStyle(this.kinematics.radius * 1.15 * frac, color, baseAlpha * frac);
      graphics.beginPath();
      graphics.moveTo(p0.x, p0.y);
      graphics.lineTo(p1.x, p1.y);
      graphics.strokePath();
    }
  }

  deactivate(): void {
    this.kinematics.active = false;
    this.sprite.setVisible(false).setActive(false);
    this.trailPoints.length = 0;
  }

  destroy(): void {
    this.sprite.destroy();
    this.trailPoints.length = 0;
  }
}
