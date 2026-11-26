import Phaser from 'phaser';
import { settingsManager } from '../managers/SettingsManager';
import type { BuiltArenaLayout, TankColorPalette } from '../types/gameTypes';

/**
 * High-impact, explosive arcade VFX engine:
 * - Single-draw-call RenderTexture floor canvas for tread tracks, blast craters & laser plasma burns
 * - Pooled particle emitters for smoke, fiery sparks, armor shards, wooden crate splinters, additive star flares & rocket flames
 * - Multi-layered shockwaves, cross-map crackling blue plasma Laser beams, floating skill callouts & punchy trauma camera shake
 */
export class EffectsSystem {
  private readonly scene: Phaser.Scene;
  private readonly floorDecalRT: Phaser.GameObjects.RenderTexture;
  private readonly treadStamp: Phaser.GameObjects.Image;
  private readonly scorchStamp: Phaser.GameObjects.Image;

  private readonly smokeEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly sparkEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly shardEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly starEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly woodEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private readonly flameEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  private readonly arenaOriginX: number;
  private readonly arenaOriginY: number;
  private readonly arenaWidth: number;
  private readonly arenaHeight: number;
  private readonly scaleRatio: number;

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
    this.treadStamp.setRotation(angleRad);
    this.floorDecalRT.draw(
      this.treadStamp,
      worldX - this.arenaOriginX,
      worldY - this.arenaOriginY,
    );
  }

  emitExhaustPuff(worldX: number, worldY: number): void {
    this.smokeEmitter.emitParticleAt(worldX, worldY, 1);
  }

  emitMuzzleFlash(worldX: number, worldY: number, angleRad: number): void {
    this.smokeEmitter.emitParticleAt(worldX, worldY, 4);
    this.sparkEmitter.setParticleTint([0xfff59d, 0xffb300, 0xff7043]);
    this.sparkEmitter.emitParticleAt(worldX, worldY, 5);

    const flash = this.scene.add
      .circle(
        worldX + Math.cos(angleRad) * 3,
        worldY + Math.sin(angleRad) * 3,
        8.5 * this.scaleRatio,
        0xfff59d,
        0.95,
      )
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(21);
    this.scene.tweens.add({
      targets: flash,
      scale: 0.15,
      alpha: 0,
      duration: 85,
      ease: 'Quad.easeOut',
      onComplete: () => flash.destroy(),
    });
  }

  emitGatlingMuzzle(worldX: number, worldY: number, angleRad: number): void {
    this.sparkEmitter.setParticleTint([0xffea00, 0xff9100, 0xffffff]);
    this.sparkEmitter.emitParticleAt(worldX, worldY, 6);

    const flash = this.scene.add
      .star(
        worldX + Math.cos(angleRad) * 4,
        worldY + Math.sin(angleRad) * 4,
        4,
        3 * this.scaleRatio,
        10 * this.scaleRatio,
        0xffea00,
        0.95,
      )
      .setRotation(angleRad)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(22);

    this.scene.tweens.add({
      targets: flash,
      scale: 0.2,
      alpha: 0,
      duration: 60,
      onComplete: () => flash.destroy(),
    });
    this.addTrauma(0.08);
  }

  emitWallBounce(worldX: number, worldY: number): void {
    this.sparkEmitter.setParticleTint([0xffd54f, 0xff8a65, 0xffffff]);
    this.sparkEmitter.emitParticleAt(worldX, worldY, 6);
    const ring = this.scene.add
      .circle(worldX, worldY, 4 * this.scaleRatio)
      .setStrokeStyle(1.8, 0xffb300, 0.72)
      .setDepth(17);
    this.scene.tweens.add({
      targets: ring,
      scale: 2.6,
      alpha: 0,
      duration: 140,
      ease: 'Quad.easeOut',
      onComplete: () => ring.destroy(),
    });
  }

  emitShellExpire(worldX: number, worldY: number): void {
    this.smokeEmitter.emitParticleAt(worldX, worldY, 4);
  }

  emitCrateSpawn(worldX: number, worldY: number): void {
    this.smokeEmitter.emitParticleAt(worldX, worldY, 8);
    this.starEmitter.setParticleTint([0xffe082, 0xffca28, 0xffffff]);
    this.starEmitter.emitParticleAt(worldX, worldY, 8);

    const ring = this.scene.add
      .circle(worldX, worldY, 8 * this.scaleRatio)
      .setStrokeStyle(3, 0xffb300, 0.9)
      .setDepth(19);
    this.scene.tweens.add({
      targets: ring,
      scale: 3.4,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    this.addTrauma(0.18);
  }

  emitCratePickup(
    worldX: number,
    worldY: number,
    skillName: string,
    accentHex: string,
    accentColor: number,
  ): void {
    this.woodEmitter.emitParticleAt(worldX, worldY, 14);
    this.starEmitter.setParticleTint([accentColor, 0xffffff, 0xffe082]);
    this.starEmitter.emitParticleAt(worldX, worldY, 16);
    this.sparkEmitter.setParticleTint([accentColor, 0xffffff]);
    this.sparkEmitter.emitParticleAt(worldX, worldY, 14);

    // Superhero transformation flash + twin expanding rings
    const flash = this.scene.add
      .circle(worldX, worldY, 16 * this.scaleRatio, accentColor, 0.75)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(24);
    const outerRing = this.scene.add
      .circle(worldX, worldY, 10 * this.scaleRatio)
      .setStrokeStyle(3.5, accentColor, 0.95)
      .setDepth(24);

    this.scene.tweens.add({
      targets: flash,
      scale: 2.8,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });
    this.scene.tweens.add({
      targets: outerRing,
      scale: 4.2,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => outerRing.destroy(),
    });

    // Crisp floating callout banner
    const label = this.scene.add
      .text(worldX, worldY - 18 * this.scaleRatio, `★ ${skillName}!`, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: `${Math.max(13, Math.round(16 * Math.max(0.8, this.scaleRatio)))}px`,
        fontStyle: '900',
        color: accentHex,
        stroke: '#FFFFFF',
        strokeThickness: 4,
      })
      .setOrigin(0.5, 0.5)
      .setScale(0.6)
      .setDepth(35);

    this.scene.tweens.add({
      targets: label,
      y: worldY - 52 * this.scaleRatio,
      scale: 1.08,
      alpha: { from: 1, to: 0 },
      duration: 950,
      ease: 'Back.easeOut',
      onComplete: () => label.destroy(),
    });

    this.addTrauma(0.36);
  }

  emitSuitRevert(worldX: number, worldY: number): void {
    this.smokeEmitter.emitParticleAt(worldX, worldY, 6);
    const ring = this.scene.add
      .circle(worldX, worldY, 14 * this.scaleRatio)
      .setStrokeStyle(2, 0x90a4ae, 0.75)
      .setDepth(20);
    this.scene.tweens.add({
      targets: ring,
      scale: 0.4,
      alpha: 0,
      duration: 200,
      onComplete: () => ring.destroy(),
    });
  }

  emitLaserChargeTick(muzzleX: number, muzzleY: number, progress01: number): void {
    const count = progress01 > 0.65 ? 3 : 2;
    for (let k = 0; k < count; k++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = (26 + (1 - progress01) * 22) * this.scaleRatio;
      const sx = muzzleX + Math.cos(ang) * dist;
      const sy = muzzleY + Math.sin(ang) * dist;
      const color = k === 0 ? 0x00e5ff : k === 1 ? 0x448aff : 0xffffff;

      const spark = this.scene.add
        .circle(sx, sy, (2.2 + progress01 * 2.6) * this.scaleRatio, color, 0.95)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(23);

      this.scene.tweens.add({
        targets: spark,
        x: muzzleX,
        y: muzzleY,
        scale: 0.25,
        alpha: 0.15,
        duration: 135,
        ease: 'Quad.easeIn',
        onComplete: () => spark.destroy(),
      });
    }

    // Snapping inward electric arc bolt + contracting halo ring as charge climbs!
    if (progress01 > 0.25) {
      const arcGfx = this.scene.add
        .graphics()
        .setDepth(24)
        .setBlendMode(Phaser.BlendModes.ADD);
      const boltAng = Math.random() * Math.PI * 2;
      const boltDist = (20 + progress01 * 18) * this.scaleRatio;
      const bx = muzzleX + Math.cos(boltAng) * boltDist;
      const by = muzzleY + Math.sin(boltAng) * boltDist;
      const midX = (bx + muzzleX) * 0.5 + (Math.random() - 0.5) * 12 * this.scaleRatio;
      const midY = (by + muzzleY) * 0.5 + (Math.random() - 0.5) * 12 * this.scaleRatio;

      arcGfx.lineStyle(1.8 * this.scaleRatio, 0x80d8ff, 0.9);
      arcGfx.beginPath();
      arcGfx.moveTo(bx, by);
      arcGfx.lineTo(midX, midY);
      arcGfx.lineTo(muzzleX, muzzleY);
      arcGfx.strokePath();

      if (progress01 > 0.55 && Math.random() < 0.45) {
        arcGfx.lineStyle(1.6 * this.scaleRatio, 0x00e5ff, 0.65);
        arcGfx.strokeCircle(muzzleX, muzzleY, (18 - progress01 * 6) * this.scaleRatio);
      }

      this.scene.tweens.add({
        targets: arcGfx,
        alpha: 0,
        duration: 85,
        onComplete: () => arcGfx.destroy(),
      });
    }

    if (progress01 > 0.7) {
      this.addTrauma(0.035);
    }
  }

  emitLaserBeamBlast(
    points: ReadonlyArray<{ x: number; y: number }>,
    victimPositions: ReadonlyArray<{ x: number; y: number }> = [],
  ): void {
    if (points.length < 2) return;
    const s = this.scaleRatio;

    // 1. Brief full-arena electric-blue ion contrast flash!
    const arenaFlash = this.scene.add
      .rectangle(
        this.arenaOriginX + this.arenaWidth * 0.5,
        this.arenaOriginY + this.arenaHeight * 0.5,
        this.arenaWidth,
        this.arenaHeight,
        0x00b0ff,
        0.22,
      )
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(24);
    this.scene.tweens.add({
      targets: arenaFlash,
      alpha: 0,
      duration: 120,
      ease: 'Quad.easeOut',
      onComplete: () => arenaFlash.destroy(),
    });

    // 2. Permanent scorch trail onto floor RenderTexture
    this.scorchStamp.setScale(s * 0.48);
    for (let i = 0; i < points.length; i += 3) {
      const p = points[i];
      this.floorDecalRT.draw(
        this.scorchStamp,
        p.x - this.arenaOriginX,
        p.y - this.arenaOriginY,
      );
    }
    this.scorchStamp.setScale(s);

    // 3. Lingering molten blue thermal afterburn corridor (fades slowly over 1.05s)
    const afterburnGfx = this.scene.add
      .graphics()
      .setDepth(16)
      .setBlendMode(Phaser.BlendModes.ADD);
    const traceSimple = (gfx: Phaser.GameObjects.Graphics, width: number, color: number, alpha: number) => {
      gfx.lineStyle(width, color, alpha);
      gfx.beginPath();
      for (let i = 0; i < points.length; i++) {
        if (i === 0) gfx.moveTo(points[i].x, points[i].y);
        else gfx.lineTo(points[i].x, points[i].y);
      }
      gfx.strokePath();
    };
    traceSimple(afterburnGfx, 22 * s, 0x0055ff, 0.34);
    traceSimple(afterburnGfx, 8.5 * s, 0x00e5ff, 0.68);
    traceSimple(afterburnGfx, 3.0 * s, 0x80d8ff, 0.85);
    this.scene.tweens.add({
      targets: afterburnGfx,
      alpha: 0,
      duration: 1050,
      ease: 'Sine.easeOut',
      onComplete: () => afterburnGfx.destroy(),
    });

    // 4. Primary 5-Layer Orbital Plasma Beam + Twin Helical Sine Ribbons + Crackling Lightning!
    const beamGfx = this.scene.add
      .graphics()
      .setDepth(26)
      .setBlendMode(Phaser.BlendModes.ADD);

    const strokeCurve = (width: number, color: number, alpha: number, jitterPx = 0) => {
      beamGfx.lineStyle(width, color, alpha);
      beamGfx.beginPath();
      for (let i = 0; i < points.length; i++) {
        const jx =
          jitterPx > 0 && i > 0 && i < points.length - 1
            ? (Math.random() - 0.5) * jitterPx
            : 0;
        const jy =
          jitterPx > 0 && i > 0 && i < points.length - 1
            ? (Math.random() - 0.5) * jitterPx
            : 0;
        if (i === 0) beamGfx.moveTo(points[i].x + jx, points[i].y + jy);
        else beamGfx.lineTo(points[i].x + jx, points[i].y + jy);
      }
      beamGfx.strokePath();
    };

    // Deep cobalt atmospheric bloom -> saturated electric azure -> bright cyan -> white-hot core!
    strokeCurve(46 * s, 0x0055ff, 0.32);
    strokeCurve(28 * s, 0x0091ea, 0.68);
    strokeCurve(15.5 * s, 0x00e5ff, 0.94);

    // Twin 3D Double-Helix Plasma Ribbons spiraling around the parabolic curve!
    for (const phaseOffset of [0, Math.PI]) {
      beamGfx.lineStyle(3.2 * s, phaseOffset === 0 ? 0x80d8ff : 0x18ffff, 0.92);
      beamGfx.beginPath();
      let distAcc = 0;
      for (let i = 0; i < points.length; i++) {
        const p = points[i];
        const next = points[Math.min(points.length - 1, i + 1)];
        const prev = points[Math.max(0, i - 1)];
        if (i > 0) {
          distAcc += Math.hypot(p.x - prev.x, p.y - prev.y);
        }
        const tx = next.x - prev.x;
        const ty = next.y - prev.y;
        const tLen = Math.hypot(tx, ty) || 1;
        const nx = -ty / tLen;
        const ny = tx / tLen;
        const amp = Math.sin(distAcc * 0.085 + phaseOffset) * 11.5 * s;
        const hx = p.x + nx * amp;
        const hy = p.y + ny * amp;
        if (i === 0) beamGfx.moveTo(hx, hy);
        else beamGfx.lineTo(hx, hy);
      }
      beamGfx.strokePath();
    }

    // Incandescent white-hot inner core + dual jagged lightning bolts
    strokeCurve(7.5 * s, 0xffffff, 1.0);
    strokeCurve(2.6 * s, 0x40c4ff, 0.96, 20 * s);
    strokeCurve(1.8 * s, 0xffffff, 0.92, 13 * s);

    // Secondary delayed electric arc crackle 90ms into the beam flash!
    this.scene.time.delayedCall(90, () => {
      if (!this.scene?.sys?.isActive()) return;
      const crackleGfx = this.scene.add
        .graphics()
        .setDepth(27)
        .setBlendMode(Phaser.BlendModes.ADD);
      crackleGfx.lineStyle(2.4 * s, 0x80d8ff, 0.95);
      crackleGfx.beginPath();
      for (let i = 0; i < points.length; i += 2) {
        const jx = i > 0 && i < points.length - 1 ? (Math.random() - 0.5) * 24 * s : 0;
        const jy = i > 0 && i < points.length - 1 ? (Math.random() - 0.5) * 24 * s : 0;
        if (i === 0) crackleGfx.moveTo(points[i].x, points[i].y);
        else crackleGfx.lineTo(points[i].x + jx, points[i].y + jy);
      }
      crackleGfx.strokePath();
      this.scene.tweens.add({
        targets: crackleGfx,
        alpha: 0,
        duration: 180,
        onComplete: () => crackleGfx.destroy(),
      });
    });

    // 5. Muzzle Mach-Cone Shockwave, Along-Beam Ion Sparks & Exit Wall Plasma Crater!
    const startPt = points[0];
    const secondPt = points[Math.min(1, points.length - 1)];
    const endPt = points[points.length - 1];
    const muzzleAng = Math.atan2(secondPt.y - startPt.y, secondPt.x - startPt.x);

    this.starEmitter.setParticleTint([0x00e5ff, 0x40c4ff, 0xffffff]);
    this.starEmitter.emitParticleAt(startPt.x, startPt.y, 18);
    this.starEmitter.emitParticleAt(endPt.x, endPt.y, 22);

    this.sparkEmitter.setParticleTint([0x00e5ff, 0x448aff, 0xffffff]);
    this.sparkEmitter.emitParticleAt(startPt.x, startPt.y, 18);
    this.sparkEmitter.emitParticleAt(endPt.x, endPt.y, 24);
    for (let i = 2; i < points.length; i += 5) {
      this.sparkEmitter.emitParticleAt(points[i].x, points[i].y, 3);
    }

    // Directional Mach shockwave cone + dual muzzle nova rings
    const machCone = this.scene.add
      .graphics()
      .setDepth(27)
      .setBlendMode(Phaser.BlendModes.ADD);
    machCone.lineStyle(4 * s, 0xffffff, 0.95);
    for (const side of [-0.52, 0.52]) {
      const ca = muzzleAng + Math.PI + side;
      machCone.lineBetween(
        startPt.x,
        startPt.y,
        startPt.x + Math.cos(ca) * 28 * s,
        startPt.y + Math.sin(ca) * 28 * s,
      );
    }
    this.scene.tweens.add({
      targets: machCone,
      alpha: 0,
      duration: 220,
      onComplete: () => machCone.destroy(),
    });

    const muzzleNova = this.scene.add
      .circle(startPt.x, startPt.y, 22 * s, 0x00e5ff, 0.92)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(27);
    const muzzleShock = this.scene.add
      .circle(startPt.x, startPt.y, 12 * s)
      .setStrokeStyle(3.8 * s, 0xffffff, 0.95)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(27);
    const exitShock = this.scene.add
      .circle(endPt.x, endPt.y, 14 * s)
      .setStrokeStyle(4.2 * s, 0x00e5ff, 0.95)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(27);

    this.scene.tweens.add({
      targets: muzzleNova,
      scale: 3.1,
      alpha: 0,
      duration: 310,
      ease: 'Cubic.easeOut',
      onComplete: () => muzzleNova.destroy(),
    });
    this.scene.tweens.add({
      targets: [muzzleShock, exitShock],
      scale: 4.2,
      alpha: 0,
      duration: 360,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        muzzleShock.destroy();
        exitShock.destroy();
      },
    });

    // Vaporization plasma rings on every rival struck by the Laser!
    for (const vp of victimPositions) {
      const hitRing = this.scene.add
        .circle(vp.x, vp.y, 15 * s)
        .setStrokeStyle(4.5 * s, 0x00e5ff, 1)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setDepth(28);
      this.starEmitter.emitParticleAt(vp.x, vp.y, 16);
      this.scene.tweens.add({
        targets: hitRing,
        scale: 4.5,
        alpha: 0,
        duration: 380,
        ease: 'Cubic.easeOut',
        onComplete: () => hitRing.destroy(),
      });
    }

    this.scene.tweens.add({
      targets: beamGfx,
      alpha: 0,
      duration: 480,
      ease: 'Cubic.easeOut',
      onComplete: () => beamGfx.destroy(),
    });

    this.addTrauma(0.95);
  }

  emitSpikeDetonation(worldX: number, worldY: number): void {
    this.scorchStamp.setRotation(Math.random() * Math.PI * 2);
    this.floorDecalRT.draw(
      this.scorchStamp,
      worldX - this.arenaOriginX,
      worldY - this.arenaOriginY,
    );

    this.flameEmitter.emitParticleAt(worldX, worldY, 16);
    this.sparkEmitter.setParticleTint([0xffd54f, 0xff5252, 0xcfd8dc]);
    this.sparkEmitter.emitParticleAt(worldX, worldY, 22);
    this.starEmitter.setParticleTint([0xffab00, 0xffffff]);
    this.starEmitter.emitParticleAt(worldX, worldY, 10);
    this.smokeEmitter.emitParticleAt(worldX, worldY, 14);

    const ring1 = this.scene.add
      .circle(worldX, worldY, 10 * this.scaleRatio)
      .setStrokeStyle(3.8, 0xff6f00, 0.95)
      .setDepth(22);
    const ring2 = this.scene.add
      .circle(worldX, worldY, 6 * this.scaleRatio)
      .setStrokeStyle(2.5, 0xcfd8dc, 0.9)
      .setDepth(22);

    this.scene.tweens.add({
      targets: ring1,
      scale: 4.2,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => ring1.destroy(),
    });
    this.scene.tweens.add({
      targets: ring2,
      scale: 3.0,
      alpha: 0,
      duration: 240,
      onComplete: () => ring2.destroy(),
    });

    this.addTrauma(0.72);
  }

  emitMissileIgnition(worldX: number, worldY: number): void {
    this.starEmitter.setParticleTint([0xff1744, 0xffea00, 0xffffff]);
    this.starEmitter.emitParticleAt(worldX, worldY, 10);
    const radarRing = this.scene.add
      .circle(worldX, worldY, 8 * this.scaleRatio)
      .setStrokeStyle(2.8, 0xff1744, 0.95)
      .setDepth(22);
    this.scene.tweens.add({
      targets: radarRing,
      scale: 3.8,
      alpha: 0,
      duration: 340,
      ease: 'Quad.easeOut',
      onComplete: () => radarRing.destroy(),
    });
    this.addTrauma(0.24);
  }

  emitShieldActivate(worldX: number, worldY: number): void {
    this.starEmitter.setParticleTint([0x1de9b6, 0x00e5ff, 0xffffff]);
    this.starEmitter.emitParticleAt(worldX, worldY, 14);
    const ring = this.scene.add
      .circle(worldX, worldY, 10 * this.scaleRatio)
      .setStrokeStyle(3.5, 0x00bfa5, 0.95)
      .setDepth(23);
    this.scene.tweens.add({
      targets: ring,
      scale: 3.4,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => ring.destroy(),
    });
    this.addTrauma(0.22);
  }

  emitShieldDeflect(worldX: number, worldY: number): void {
    this.starEmitter.setParticleTint([0x00e5ff, 0x1de9b6, 0xffffff]);
    this.starEmitter.emitParticleAt(worldX, worldY, 8);
    this.sparkEmitter.setParticleTint([0x80deea, 0xffffff]);
    this.sparkEmitter.emitParticleAt(worldX, worldY, 10);
    this.addTrauma(0.18);
  }

  emitWallDrilled(worldX: number, worldY: number): void {
    this.shardEmitter.setParticleTint([0x4b4e53, 0x656970, 0x222428, 0xffd54f]);
    this.shardEmitter.emitParticleAt(worldX, worldY, 16);
    this.smokeEmitter.emitParticleAt(worldX, worldY, 10);
    this.sparkEmitter.setParticleTint([0xffd54f, 0xffab00, 0xffffff]);
    this.sparkEmitter.emitParticleAt(worldX, worldY, 12);

    const ring = this.scene.add
      .circle(worldX, worldY, 7 * this.scaleRatio)
      .setStrokeStyle(3, 0xffb300, 0.9)
      .setDepth(22);
    this.scene.tweens.add({
      targets: ring,
      scale: 3.0,
      alpha: 0,
      duration: 220,
      onComplete: () => ring.destroy(),
    });
    this.addTrauma(0.36);
  }

  emitMineDeploy(worldX: number, worldY: number): void {
    const ring = this.scene.add
      .circle(worldX, worldY, 6 * this.scaleRatio)
      .setStrokeStyle(2, 0xff1744, 0.85)
      .setDepth(18);
    this.scene.tweens.add({
      targets: ring,
      scale: 2.6,
      alpha: 0,
      duration: 240,
      onComplete: () => ring.destroy(),
    });
  }

  emitMineExplosion(worldX: number, worldY: number): void {
    this.scorchStamp.setRotation(Math.random() * Math.PI * 2);
    this.floorDecalRT.draw(
      this.scorchStamp,
      worldX - this.arenaOriginX,
      worldY - this.arenaOriginY,
    );
    this.flameEmitter.emitParticleAt(worldX, worldY, 24);
    this.sparkEmitter.setParticleTint([0xff1744, 0xff9100, 0xffea00, 0xffffff]);
    this.sparkEmitter.emitParticleAt(worldX, worldY, 26);
    this.starEmitter.setParticleTint([0xff5252, 0xffffff]);
    this.starEmitter.emitParticleAt(worldX, worldY, 12);
    this.smokeEmitter.emitParticleAt(worldX, worldY, 16);

    const blast = this.scene.add
      .circle(worldX, worldY, 14 * this.scaleRatio, 0xff5252, 0.85)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(24);
    const wave = this.scene.add
      .circle(worldX, worldY, 12 * this.scaleRatio)
      .setStrokeStyle(4, 0xff1744, 0.95)
      .setDepth(23);
    this.scene.tweens.add({
      targets: blast,
      scale: 3.2,
      alpha: 0,
      duration: 240,
      onComplete: () => blast.destroy(),
    });
    this.scene.tweens.add({
      targets: wave,
      scale: 4.4,
      alpha: 0,
      duration: 340,
      ease: 'Cubic.easeOut',
      onComplete: () => wave.destroy(),
    });
    this.addTrauma(0.82);
  }

  emitBulletIncinerated(worldX: number, worldY: number): void {
    this.smokeEmitter.emitParticleAt(worldX, worldY, 4);
    this.sparkEmitter.setParticleTint([0xffea00, 0xff3d00, 0xffffff]);
    this.sparkEmitter.emitParticleAt(worldX, worldY, 6);
  }

  emitScatterMuzzle(worldX: number, worldY: number, angleRad: number): void {
    this.smokeEmitter.emitParticleAt(worldX, worldY, 7);
    this.sparkEmitter.setParticleTint([0x82b1ff, 0x2979ff, 0xffffff, 0xffea00]);
    this.sparkEmitter.emitParticleAt(worldX, worldY, 12);
    const cone = this.scene.add
      .circle(
        worldX + Math.cos(angleRad) * 5,
        worldY + Math.sin(angleRad) * 5,
        12 * this.scaleRatio,
        0x82b1ff,
        0.9,
      )
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(22);
    this.scene.tweens.add({
      targets: cone,
      scale: 2.0,
      alpha: 0,
      duration: 110,
      onComplete: () => cone.destroy(),
    });
    this.addTrauma(0.26);
  }

  emitFlameMuzzle(worldX: number, worldY: number, angleRad: number): void {
    const s = this.scaleRatio;
    // Pressurized blue-white blowtorch ignition cone right at the nozzle!
    const jetX = worldX + Math.cos(angleRad) * 6 * s;
    const jetY = worldY + Math.sin(angleRad) * 6 * s;
    const cone = this.scene.add
      .ellipse(jetX, jetY, 18 * s, 8.5 * s, 0x80d8ff, 0.72)
      .setRotation(angleRad)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(22);
    this.scene.tweens.add({
      targets: cone,
      scaleX: 1.45,
      scaleY: 0.4,
      alpha: 0,
      duration: 55,
      onComplete: () => cone.destroy(),
    });

    this.sparkEmitter.setParticleTint([0xe1f5fe, 0xfff59d, 0xff9100, 0xff3d00]);
    this.sparkEmitter.emitParticleAt(worldX, worldY, 3);
    if (Math.random() < 0.22) {
      this.scorchStamp.setScale(s * 0.32);
      this.floorDecalRT.draw(
        this.scorchStamp,
        worldX + Math.cos(angleRad) * 32 * s - this.arenaOriginX,
        worldY + Math.sin(angleRad) * 32 * s - this.arenaOriginY,
      );
      this.scorchStamp.setScale(s);
    }
  }

  emitFlameStreamEmber(worldX: number, worldY: number, lifeFrac: number): void {
    const s = this.scaleRatio;
    const jx = worldX + (Math.random() - 0.5) * 14 * s;
    const jy = worldY + (Math.random() - 0.5) * 14 * s;
    if (lifeFrac > 0.45) {
      // Rising dark heat-smoke & cooling soot wisps + glowing orange micro-embers
      if (Math.random() < 0.55) {
        this.smokeEmitter.emitParticleAt(jx, jy, 1);
      }
      this.sparkEmitter.setParticleTint([0xffab00, 0xff6d00, 0xd50000]);
      this.sparkEmitter.emitParticleAt(jx, jy, 1);
      if (lifeFrac > 0.62 && Math.random() < 0.18) {
        this.scorchStamp.setScale(s * 0.28);
        this.floorDecalRT.draw(
          this.scorchStamp,
          jx - this.arenaOriginX,
          jy - this.arenaOriginY,
        );
        this.scorchStamp.setScale(s);
      }
    } else if (Math.random() < 0.4) {
      this.sparkEmitter.setParticleTint([0xffffff, 0xffea00, 0xff9100]);
      this.sparkEmitter.emitParticleAt(jx, jy, 1);
    }
  }

  emitDrillTrail(worldX: number, worldY: number, angleRad: number): void {
    const tailX = worldX - Math.cos(angleRad) * 9 * this.scaleRatio;
    const tailY = worldY - Math.sin(angleRad) * 9 * this.scaleRatio;
    this.sparkEmitter.setParticleTint([0xfff59d, 0xffb300, 0xff6d00, 0xcfd8dc]);
    this.sparkEmitter.emitParticleAt(tailX, tailY, 2);
  }

  emitReaperWindupTick(worldX: number, worldY: number, progress01: number): void {
    const s = this.scaleRatio;
    for (let k = 0; k < 2; k++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = (30 + (1 - progress01) * 24) * s;
      const sx = worldX + Math.cos(ang) * dist;
      const sy = worldY + Math.sin(ang) * dist;
      const isBlack = k === 1;
      const mote = this.scene.add
        .circle(sx, sy, (2.5 + progress01 * 2.2) * s, isBlack ? 0x111216 : 0xff1744, 0.92)
        .setBlendMode(isBlack ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
        .setDepth(23);
      this.scene.tweens.add({
        targets: mote,
        x: worldX,
        y: worldY,
        scale: 0.2,
        alpha: 0.1,
        duration: 150,
        ease: 'Quad.easeIn',
        onComplete: () => mote.destroy(),
      });
    }
  }

  emitReaperUnfurlBurst(worldX: number, worldY: number): void {
    const s = this.scaleRatio;
    this.starEmitter.setParticleTint([0xff1744, 0xd50000, 0xff8a80, 0xffffff]);
    this.starEmitter.emitParticleAt(worldX, worldY, 20);
    this.shardEmitter.setParticleTint([0x0d0e12, 0x212121, 0xd50000]);
    this.shardEmitter.emitParticleAt(worldX, worldY, 14);
    this.sparkEmitter.setParticleTint([0xff1744, 0xff5252, 0xffffff]);
    this.sparkEmitter.emitParticleAt(worldX, worldY, 22);

    const darkRing = this.scene.add
      .circle(worldX, worldY, 16 * s)
      .setStrokeStyle(5 * s, 0x0d0e12, 0.88)
      .setDepth(25);
    const flash = this.scene.add
      .circle(worldX, worldY, 22 * s, 0xd50000, 0.85)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(26);
    const ring = this.scene.add
      .circle(worldX, worldY, 14 * s)
      .setStrokeStyle(4.2 * s, 0xff1744, 0.96)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(26);

    this.scene.tweens.add({
      targets: flash,
      scale: 3.4,
      alpha: 0,
      duration: 280,
      ease: 'Cubic.easeOut',
      onComplete: () => flash.destroy(),
    });
    this.scene.tweens.add({
      targets: [ring, darkRing],
      scale: 5.2,
      alpha: 0,
      duration: 420,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        ring.destroy();
        darkRing.destroy();
      },
    });
    this.addTrauma(0.65);
  }

  emitReaperSpark(worldX: number, worldY: number): void {
    this.sparkEmitter.setParticleTint([0xff1744, 0xd50000, 0xff8a80, 0xffffff]);
    this.sparkEmitter.emitParticleAt(worldX, worldY, 4);
    if (Math.random() < 0.4) {
      this.smokeEmitter.emitParticleAt(worldX, worldY, 1);
    }
  }

  emitMissileTrail(worldX: number, worldY: number, angleRad: number, seeking: boolean): void {
    const tailX = worldX - Math.cos(angleRad) * (10 * this.scaleRatio);
    const tailY = worldY - Math.sin(angleRad) * (10 * this.scaleRatio);
    if (seeking) {
      this.flameEmitter.emitParticleAt(tailX, tailY, 2);
      this.smokeEmitter.emitParticleAt(tailX, tailY, 1);
    } else {
      this.smokeEmitter.emitParticleAt(tailX, tailY, 1);
    }
  }

  emitTankExplosion(worldX: number, worldY: number, palette: TankColorPalette): void {
    // 1. Permanent blast scorch crater on floor RenderTexture
    this.scorchStamp.setRotation(Math.random() * Math.PI * 2);
    this.floorDecalRT.draw(
      this.scorchStamp,
      worldX - this.arenaOriginX,
      worldY - this.arenaOriginY,
    );

    // 2. Massive colored armor & tread shrapnel storm
    this.shardEmitter.setParticleTint([
      palette.primary,
      palette.highlight,
      palette.shadow,
      0x2b2d30,
      0xffffff,
    ]);
    this.shardEmitter.emitParticleAt(worldX, worldY, 28);

    // 3. Blazing fireball + additive star flares + spark shower + smoke cloud
    this.flameEmitter.emitParticleAt(worldX, worldY, 22);
    this.starEmitter.setParticleTint([palette.highlight, 0xffea00, 0xffffff]);
    this.starEmitter.emitParticleAt(worldX, worldY, 14);
    this.sparkEmitter.setParticleTint([0xffea00, 0xff6d00, palette.primary, 0xffffff]);
    this.sparkEmitter.emitParticleAt(worldX, worldY, 24);
    this.smokeEmitter.emitParticleAt(worldX, worldY, 18);

    // 4. Blinding flash core + dual concentric sonic shockwave rings!
    const core = this.scene.add
      .circle(worldX, worldY, 16 * this.scaleRatio, 0xffffff, 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(24);
    const innerRing = this.scene.add
      .circle(worldX, worldY, 12 * this.scaleRatio)
      .setStrokeStyle(4.2, palette.primary, 0.95)
      .setDepth(23);
    const outerRing = this.scene.add
      .circle(worldX, worldY, 16 * this.scaleRatio)
      .setStrokeStyle(2.6, 0xfff59d, 0.85)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(23);

    this.scene.tweens.add({
      targets: core,
      scale: 3.1,
      alpha: 0,
      duration: 210,
      ease: 'Cubic.easeOut',
      onComplete: () => core.destroy(),
    });
    this.scene.tweens.add({
      targets: innerRing,
      scale: 4.1,
      alpha: 0,
      duration: 340,
      ease: 'Quad.easeOut',
      onComplete: () => innerRing.destroy(),
    });
    this.scene.tweens.add({
      targets: outerRing,
      scale: 4.8,
      alpha: 0,
      duration: 260,
      ease: 'Cubic.easeOut',
      onComplete: () => outerRing.destroy(),
    });

    this.addTrauma(0.86);
  }

  addTrauma(amount: number): void {
    if (!settingsManager.getSettings().screenShake) return;
    this.trauma = Math.min(1, this.trauma + amount);
  }

  update(dt: number): void {
    const cam = this.scene.cameras.main;
    if (!settingsManager.getSettings().screenShake || this.trauma <= 0.001) {
      if (this.trauma !== 0) {
        this.trauma = 0;
        cam.setScroll(0, 0);
      }
      return;
    }

    this.trauma = Math.max(0, this.trauma - dt * 2.3);
    const shake = this.trauma * this.trauma;
    this.shakeClock += dt * 44;
    const maxPx = 8.0;
    const ox = Math.sin(this.shakeClock * 1.7) * maxPx * shake;
    const oy = Math.cos(this.shakeClock * 2.3) * maxPx * shake;
    cam.setScroll(ox, oy);

    if (this.trauma <= 0.001) {
      this.trauma = 0;
      cam.setScroll(0, 0);
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
