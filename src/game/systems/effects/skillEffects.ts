import Phaser from 'phaser';
import type { EffectsRenderContext } from './effectsContext';

export function emitSpikeDetonationEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  ctx.scorchStamp.setRotation(Math.random() * Math.PI * 2);
  ctx.floorDecalRT.draw(
    ctx.scorchStamp,
    worldX - ctx.arenaOriginX,
    worldY - ctx.arenaOriginY,
  );

  ctx.flameEmitter.emitParticleAt(worldX, worldY, 16);
  ctx.sparkEmitter.setParticleTint([0xffd54f, 0xff5252, 0xcfd8dc]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 22);
  ctx.starEmitter.setParticleTint([0xffab00, 0xffffff]);
  ctx.starEmitter.emitParticleAt(worldX, worldY, 10);
  ctx.smokeEmitter.emitParticleAt(worldX, worldY, 14);

  const ring1 = ctx.scene.add
    .circle(worldX, worldY, 10 * ctx.scaleRatio)
    .setStrokeStyle(3.8, 0xff6f00, 0.95)
    .setDepth(22);
  const ring2 = ctx.scene.add
    .circle(worldX, worldY, 6 * ctx.scaleRatio)
    .setStrokeStyle(2.5, 0xcfd8dc, 0.9)
    .setDepth(22);

  ctx.scene.tweens.add({
    targets: ring1,
    scale: 4.2,
    alpha: 0,
    duration: 320,
    ease: 'Cubic.easeOut',
    onComplete: () => ring1.destroy(),
  });
  ctx.scene.tweens.add({
    targets: ring2,
    scale: 3.0,
    alpha: 0,
    duration: 240,
    ease: 'Cubic.easeOut',
    onComplete: () => ring2.destroy(),
  });

  ctx.addTrauma(0.72);
}

export function emitMissileIgnitionEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  ctx.starEmitter.setParticleTint([0xff1744, 0xffea00, 0xffffff]);
  ctx.starEmitter.emitParticleAt(worldX, worldY, 10);
  const radarRing = ctx.scene.add
    .circle(worldX, worldY, 8 * ctx.scaleRatio)
    .setStrokeStyle(2.8, 0xff1744, 0.95)
    .setDepth(22);
  ctx.scene.tweens.add({
    targets: radarRing,
    scale: 3.8,
    alpha: 0,
    duration: 340,
    ease: 'Quad.easeOut',
    onComplete: () => radarRing.destroy(),
  });
  ctx.addTrauma(0.24);
}

export function emitShieldActivateEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  ctx.starEmitter.setParticleTint([0x1de9b6, 0x00e5ff, 0xffffff]);
  ctx.starEmitter.emitParticleAt(worldX, worldY, 14);
  const ring = ctx.scene.add
    .circle(worldX, worldY, 10 * ctx.scaleRatio)
    .setStrokeStyle(3.5, 0x00bfa5, 0.95)
    .setDepth(23);
  ctx.scene.tweens.add({
    targets: ring,
    scale: 3.4,
    alpha: 0,
    duration: 300,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
  ctx.addTrauma(0.22);
}

export function emitShieldDeflectEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  ctx.starEmitter.setParticleTint([0x00e5ff, 0x1de9b6, 0xffffff]);
  ctx.starEmitter.emitParticleAt(worldX, worldY, 8);
  ctx.sparkEmitter.setParticleTint([0x80deea, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 10);
  ctx.addTrauma(0.18);
}

export function emitWallDrilledEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  ctx.shardEmitter.setParticleTint([0x4b4e53, 0x656970, 0x222428, 0xffd54f]);
  ctx.shardEmitter.emitParticleAt(worldX, worldY, 16);
  ctx.smokeEmitter.emitParticleAt(worldX, worldY, 10);
  ctx.sparkEmitter.setParticleTint([0xffd54f, 0xffab00, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 12);

  const ring = ctx.scene.add
    .circle(worldX, worldY, 7 * ctx.scaleRatio)
    .setStrokeStyle(3, 0xffb300, 0.9)
    .setDepth(22);
  ctx.scene.tweens.add({
    targets: ring,
    scale: 3.0,
    alpha: 0,
    duration: 220,
    onComplete: () => ring.destroy(),
  });
  ctx.addTrauma(0.36);
}

export function emitMineDeployEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  const ring = ctx.scene.add
    .circle(worldX, worldY, 6 * ctx.scaleRatio)
    .setStrokeStyle(2, 0xff1744, 0.85)
    .setDepth(18);
  ctx.scene.tweens.add({
    targets: ring,
    scale: 2.6,
    alpha: 0,
    duration: 240,
    onComplete: () => ring.destroy(),
  });
}

export function emitMineExplosionEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  ctx.scorchStamp.setRotation(Math.random() * Math.PI * 2);
  ctx.floorDecalRT.draw(
    ctx.scorchStamp,
    worldX - ctx.arenaOriginX,
    worldY - ctx.arenaOriginY,
  );
  ctx.flameEmitter.emitParticleAt(worldX, worldY, 24);
  ctx.sparkEmitter.setParticleTint([0xff1744, 0xff9100, 0xffea00, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 26);
  ctx.starEmitter.setParticleTint([0xff5252, 0xffffff]);
  ctx.starEmitter.emitParticleAt(worldX, worldY, 12);
  ctx.smokeEmitter.emitParticleAt(worldX, worldY, 16);

  const blast = ctx.scene.add
    .circle(worldX, worldY, 14 * ctx.scaleRatio, 0xff5252, 0.85)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(24);
  const wave = ctx.scene.add
    .circle(worldX, worldY, 12 * ctx.scaleRatio)
    .setStrokeStyle(4, 0xff1744, 0.95)
    .setDepth(23);
  ctx.scene.tweens.add({
    targets: blast,
    scale: 3.2,
    alpha: 0,
    duration: 240,
    onComplete: () => blast.destroy(),
  });
  ctx.scene.tweens.add({
    targets: wave,
    scale: 4.4,
    alpha: 0,
    duration: 340,
    ease: 'Cubic.easeOut',
    onComplete: () => wave.destroy(),
  });
  ctx.addTrauma(0.82);
}

export function emitBulletIncineratedEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  ctx.smokeEmitter.emitParticleAt(worldX, worldY, 4);
  ctx.sparkEmitter.setParticleTint([0xffea00, 0xff3d00, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 6);
}

export function emitScatterMuzzleEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  angleRad: number,
): void {
  ctx.smokeEmitter.emitParticleAt(worldX, worldY, 7);
  ctx.sparkEmitter.setParticleTint([0x82b1ff, 0x2979ff, 0xffffff, 0xffea00]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 12);
  const cone = ctx.scene.add
    .circle(
      worldX + Math.cos(angleRad) * 5,
      worldY + Math.sin(angleRad) * 5,
      12 * ctx.scaleRatio,
      0x82b1ff,
      0.9,
    )
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(22);
  ctx.scene.tweens.add({
    targets: cone,
    scale: 2.0,
    alpha: 0,
    duration: 110,
    onComplete: () => cone.destroy(),
  });
  ctx.addTrauma(0.26);
}

export function emitFlameMuzzleEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  angleRad: number,
): void {
  const s = ctx.scaleRatio;
  const jetX = worldX + Math.cos(angleRad) * 6 * s;
  const jetY = worldY + Math.sin(angleRad) * 6 * s;
  const cone = ctx.scene.add
    .ellipse(jetX, jetY, 18 * s, 8.5 * s, 0x80d8ff, 0.72)
    .setRotation(angleRad)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(22);
  ctx.scene.tweens.add({
    targets: cone,
    scaleX: 1.45,
    scaleY: 0.4,
    alpha: 0,
    duration: 55,
    onComplete: () => cone.destroy(),
  });

  ctx.sparkEmitter.setParticleTint([0xe1f5fe, 0xfff59d, 0xff9100, 0xff3d00]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 3);
  if (Math.random() < 0.22) {
    ctx.scorchStamp.setScale(s * 0.32);
    ctx.floorDecalRT.draw(
      ctx.scorchStamp,
      worldX + Math.cos(angleRad) * 32 * s - ctx.arenaOriginX,
      worldY + Math.sin(angleRad) * 32 * s - ctx.arenaOriginY,
    );
    ctx.scorchStamp.setScale(s);
  }
}

export function emitFlameStreamEmberEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  lifeFrac: number,
): void {
  const s = ctx.scaleRatio;
  const jx = worldX + (Math.random() - 0.5) * 14 * s;
  const jy = worldY + (Math.random() - 0.5) * 14 * s;
  if (lifeFrac > 0.45) {
    if (Math.random() < 0.55) {
      ctx.smokeEmitter.emitParticleAt(jx, jy, 1);
    }
    ctx.sparkEmitter.setParticleTint([0xffab00, 0xff6d00, 0xd50000]);
    ctx.sparkEmitter.emitParticleAt(jx, jy, 1);
    if (lifeFrac > 0.62 && Math.random() < 0.18) {
      ctx.scorchStamp.setScale(s * 0.28);
      ctx.floorDecalRT.draw(
        ctx.scorchStamp,
        jx - ctx.arenaOriginX,
        jy - ctx.arenaOriginY,
      );
      ctx.scorchStamp.setScale(s);
    }
  } else if (Math.random() < 0.4) {
    ctx.sparkEmitter.setParticleTint([0xffffff, 0xffea00, 0xff9100]);
    ctx.sparkEmitter.emitParticleAt(jx, jy, 1);
  }
}

export function emitDrillTrailEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  angleRad: number,
): void {
  const tailX = worldX - Math.cos(angleRad) * 9 * ctx.scaleRatio;
  const tailY = worldY - Math.sin(angleRad) * 9 * ctx.scaleRatio;
  ctx.sparkEmitter.setParticleTint([0xfff59d, 0xffb300, 0xff6d00, 0xcfd8dc]);
  ctx.sparkEmitter.emitParticleAt(tailX, tailY, 2);
}

export function emitReaperWindupTickEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  progress01: number,
): void {
  const s = ctx.scaleRatio;
  for (let k = 0; k < 2; k++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = (30 + (1 - progress01) * 24) * s;
    const sx = worldX + Math.cos(ang) * dist;
    const sy = worldY + Math.sin(ang) * dist;
    const isBlack = k === 1;
    const mote = ctx.scene.add
      .circle(sx, sy, (2.5 + progress01 * 2.2) * s, isBlack ? 0x111216 : 0xff1744, 0.92)
      .setBlendMode(isBlack ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
      .setDepth(23);
    ctx.scene.tweens.add({
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

export function emitReaperUnfurlBurstEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  const s = ctx.scaleRatio;
  ctx.starEmitter.setParticleTint([0xff1744, 0xd50000, 0xff8a80, 0xffffff]);
  ctx.starEmitter.emitParticleAt(worldX, worldY, 20);
  ctx.shardEmitter.setParticleTint([0x0d0e12, 0x212121, 0xd50000]);
  ctx.shardEmitter.emitParticleAt(worldX, worldY, 14);
  ctx.sparkEmitter.setParticleTint([0xff1744, 0xff5252, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 22);

  const darkRing = ctx.scene.add
    .circle(worldX, worldY, 16 * s)
    .setStrokeStyle(5 * s, 0x0d0e12, 0.88)
    .setDepth(25);
  const flash = ctx.scene.add
    .circle(worldX, worldY, 22 * s, 0xd50000, 0.85)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(26);
  const ring = ctx.scene.add
    .circle(worldX, worldY, 14 * s)
    .setStrokeStyle(4.2 * s, 0xff1744, 0.96)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(26);

  ctx.scene.tweens.add({
    targets: flash,
    scale: 3.4,
    alpha: 0,
    duration: 280,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy(),
  });
  ctx.scene.tweens.add({
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
  ctx.addTrauma(0.65);
}

export function emitReaperSparkEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  ctx.sparkEmitter.setParticleTint([0xff1744, 0xd50000, 0xff8a80, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 4);
  if (Math.random() < 0.4) {
    ctx.smokeEmitter.emitParticleAt(worldX, worldY, 1);
  }
}

export function emitMissileTrailEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  angleRad: number,
  seeking: boolean,
): void {
  const tailX = worldX - Math.cos(angleRad) * (10 * ctx.scaleRatio);
  const tailY = worldY - Math.sin(angleRad) * (10 * ctx.scaleRatio);
  if (seeking) {
    ctx.flameEmitter.emitParticleAt(tailX, tailY, 2);
    ctx.smokeEmitter.emitParticleAt(tailX, tailY, 1);
  } else {
    ctx.smokeEmitter.emitParticleAt(tailX, tailY, 1);
  }
}

export function emitEmpMuzzleEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  angleRad: number,
): void {
  const s = ctx.scaleRatio;
  ctx.sparkEmitter.setParticleTint([0x00e5ff, 0x651fff, 0xffea00, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 14);
  const arc = ctx.scene.add
    .circle(
      worldX + Math.cos(angleRad) * 4 * s,
      worldY + Math.sin(angleRad) * 4 * s,
      11 * s,
      0x00e5ff,
      0.92,
    )
    .setStrokeStyle(2.5 * s, 0x651fff, 0.95)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(23);
  ctx.scene.tweens.add({
    targets: arc,
    scale: 2.1,
    alpha: 0,
    duration: 140,
    ease: 'Quad.easeOut',
    onComplete: () => arc.destroy(),
  });
  ctx.addTrauma(0.18);
}

export function emitEmpOrbFlightTickEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  const ox = (Math.random() - 0.5) * 8 * ctx.scaleRatio;
  const oy = (Math.random() - 0.5) * 8 * ctx.scaleRatio;
  ctx.sparkEmitter.setParticleTint([0x00e5ff, 0x7c4dff, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX + ox, worldY + oy, 2);
}

export function emitEmpJammedTickEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  const ox = (Math.random() - 0.5) * 16 * ctx.scaleRatio;
  const oy = (Math.random() - 0.5) * 16 * ctx.scaleRatio;
  ctx.sparkEmitter.setParticleTint([0x00e5ff, 0xffea00, 0x7c4dff, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX + ox, worldY + oy, 3);
  if (Math.random() < 0.35) {
    ctx.smokeEmitter.emitParticleAt(worldX + ox * 0.5, worldY + oy * 0.5, 1);
  }
}

export function emitEmpBlastEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  blastRadius: number,
): void {
  const s = ctx.scaleRatio;
  ctx.sparkEmitter.setParticleTint([0x00e5ff, 0x651fff, 0xffea00, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 34);
  ctx.starEmitter.setParticleTint([0x00e5ff, 0xb388ff, 0xffffff]);
  ctx.starEmitter.emitParticleAt(worldX, worldY, 20);
  ctx.shardEmitter.setParticleTint([0x651fff, 0x00e5ff, 0xffffff]);
  ctx.shardEmitter.emitParticleAt(worldX, worldY, 12);

  const coreFlash = ctx.scene.add
    .circle(worldX, worldY, blastRadius * 0.36, 0xffffff, 0.95)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(25);
  const plasmaDome = ctx.scene.add
    .circle(worldX, worldY, blastRadius * 0.48, 0x651fff, 0.42)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(24);
  const outerWave = ctx.scene.add
    .circle(worldX, worldY, blastRadius * 0.18)
    .setStrokeStyle(5.2 * s, 0x651fff, 0.96)
    .setDepth(24);
  const innerWave = ctx.scene.add
    .circle(worldX, worldY, blastRadius * 0.12)
    .setStrokeStyle(3.4 * s, 0x00e5ff, 0.98)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(25);

  const boltWeb = ctx.scene.add
    .graphics()
    .setPosition(worldX, worldY)
    .setScale(0.35)
    .setDepth(25)
    .setBlendMode(Phaser.BlendModes.ADD);
  const branches = 12;
  for (let b = 0; b < branches; b++) {
    const baseAng = (b / branches) * Math.PI * 2 + (Math.random() - 0.5) * 0.2;
    const isCyan = b % 2 === 0;
    boltWeb.lineStyle((isCyan ? 2.8 : 2.1) * s, isCyan ? 0x00e5ff : 0xb388ff, 0.96);
    boltWeb.beginPath();
    boltWeb.moveTo(0, 0);
    const segs = 5;
    let prevX = 0;
    let prevY = 0;
    for (let k = 1; k <= segs; k++) {
      const frac = k / segs;
      const r = blastRadius * frac * (0.9 + Math.random() * 0.14);
      const jitter = k < segs ? (Math.random() - 0.5) * 0.34 : 0;
      const px = Math.cos(baseAng + jitter) * r;
      const py = Math.sin(baseAng + jitter) * r;
      boltWeb.lineTo(px, py);
      if (k === 3 && b % 3 === 0) {
        const forkAng = baseAng + (b % 2 === 0 ? 0.42 : -0.42);
        const fx = prevX + Math.cos(forkAng) * (blastRadius * 0.34);
        const fy = prevY + Math.sin(forkAng) * (blastRadius * 0.34);
        boltWeb.moveTo(px, py);
        boltWeb.lineTo(fx, fy);
        boltWeb.moveTo(px, py);
      }
      prevX = px;
      prevY = py;
    }
    boltWeb.strokePath();
  }
  boltWeb.lineStyle(2.2 * s, 0xffea00, 0.72);
  boltWeb.beginPath();
  for (let h = 0; h < 6; h++) {
    const ha = (h / 6) * Math.PI * 2;
    const hx = Math.cos(ha) * (blastRadius * 0.86);
    const hy = Math.sin(ha) * (blastRadius * 0.86);
    if (h === 0) boltWeb.moveTo(hx, hy);
    else boltWeb.lineTo(hx, hy);
  }
  boltWeb.closePath();
  boltWeb.strokePath();

  ctx.scene.tweens.add({
    targets: coreFlash,
    scale: 2.3,
    alpha: 0,
    duration: 180,
    ease: 'Cubic.easeOut',
    onComplete: () => coreFlash.destroy(),
  });
  ctx.scene.tweens.add({
    targets: plasmaDome,
    scale: 2.15,
    alpha: 0,
    duration: 290,
    ease: 'Quad.easeOut',
    onComplete: () => plasmaDome.destroy(),
  });
  ctx.scene.tweens.add({
    targets: boltWeb,
    scale: 1.04,
    rotation: (Math.random() - 0.5) * 0.25,
    alpha: 0,
    duration: 310,
    ease: 'Cubic.easeOut',
    onComplete: () => boltWeb.destroy(),
  });
  ctx.scene.tweens.add({
    targets: [outerWave, innerWave],
    radius: blastRadius,
    alpha: 0,
    duration: 340,
    ease: 'Cubic.easeOut',
    onComplete: () => {
      outerWave.destroy();
      innerWave.destroy();
    },
  });
  ctx.addTrauma(0.68);
}

export function emitPhantomActivateEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  const s = ctx.scaleRatio;
  ctx.starEmitter.setParticleTint([0xea80fc, 0xb388ff, 0x80d8ff, 0xffffff]);
  ctx.starEmitter.emitParticleAt(worldX, worldY, 16);
  ctx.sparkEmitter.setParticleTint([0xea80fc, 0xd1c4e9, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 14);

  const implode = ctx.scene.add
    .circle(worldX, worldY, 34 * s)
    .setStrokeStyle(3.0 * s, 0x7c4dff, 0.88)
    .setDepth(23);
  const ring = ctx.scene.add
    .circle(worldX, worldY, 12 * s, 0xede7f6, 0.45)
    .setStrokeStyle(3.6 * s, 0xea80fc, 0.96)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(24);

  ctx.scene.tweens.add({
    targets: implode,
    scale: 0.25,
    alpha: 0,
    duration: 200,
    ease: 'Quad.easeIn',
    onComplete: () => implode.destroy(),
  });
  ctx.scene.tweens.add({
    targets: ring,
    scale: 3.4,
    alpha: 0,
    duration: 310,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
  ctx.addTrauma(0.24);
}

export function emitPhantomAfterimageEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  angleRad: number,
  paletteId: string,
): void {
  const texKey = `tank_${paletteId}_phantom_0`;
  if (!ctx.scene.textures.exists(texKey)) return;

  const ghost = ctx.scene.add
    .image(worldX, worldY, texKey)
    .setOrigin(0.44, 0.5)
    .setScale(ctx.scaleRatio * 1.02)
    .setRotation(angleRad)
    .setTint(0xd1c4e9)
    .setAlpha(0.42)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(12.5);

  ctx.scene.tweens.add({
    targets: ghost,
    scaleX: ctx.scaleRatio * 0.88,
    scaleY: ctx.scaleRatio * 0.88,
    alpha: 0,
    duration: 280,
    ease: 'Quad.easeOut',
    onComplete: () => ghost.destroy(),
  });
}

export function emitPhantomExitEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  const s = ctx.scaleRatio;
  ctx.sparkEmitter.setParticleTint([0xd1c4e9, 0xea80fc, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 12);
  const ring = ctx.scene.add
    .circle(worldX, worldY, 26 * s)
    .setStrokeStyle(3.0 * s, 0xb388ff, 0.9)
    .setDepth(23);
  ctx.scene.tweens.add({
    targets: ring,
    scale: 0.45,
    alpha: 0,
    duration: 210,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
}

export function emitCryoMuzzleEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  angleRad: number,
): void {
  const s = ctx.scaleRatio;
  ctx.shardEmitter.setParticleTint([0xffffff, 0x84ffff, 0x00e5ff]);
  ctx.shardEmitter.emitParticleAt(worldX, worldY, 6);
  ctx.sparkEmitter.setParticleTint([0xe0f7fa, 0x84ffff, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 10);
  const puff = ctx.scene.add
    .circle(
      worldX + Math.cos(angleRad) * 5 * s,
      worldY + Math.sin(angleRad) * 5 * s,
      10 * s,
      0x84ffff,
      0.85,
    )
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(23);
  ctx.scene.tweens.add({
    targets: puff,
    scale: 2.0,
    alpha: 0,
    duration: 150,
    ease: 'Quad.easeOut',
    onComplete: () => puff.destroy(),
  });
}

export function emitCryoOrbFlightTickEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  const ox = (Math.random() - 0.5) * 7 * ctx.scaleRatio;
  const oy = (Math.random() - 0.5) * 7 * ctx.scaleRatio;
  ctx.sparkEmitter.setParticleTint([0xffffff, 0x84ffff, 0xb2ebf2]);
  ctx.sparkEmitter.emitParticleAt(worldX + ox, worldY + oy, 1);
}

export function emitIceDriftSprayEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  angleRad: number,
): void {
  const rearX = worldX - Math.cos(angleRad) * (13 * ctx.scaleRatio);
  const rearY = worldY - Math.sin(angleRad) * (13 * ctx.scaleRatio);
  ctx.sparkEmitter.setParticleTint([0xffffff, 0xe0f7fa, 0x84ffff]);
  ctx.sparkEmitter.emitParticleAt(rearX, rearY, 2);
}

export function emitCryoShatterEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  zoneRadius: number,
): void {
  const s = ctx.scaleRatio;
  ctx.shardEmitter.setParticleTint([0xffffff, 0x84ffff, 0x00bcd4, 0xb2ebf2]);
  ctx.shardEmitter.emitParticleAt(worldX, worldY, 24);
  ctx.sparkEmitter.setParticleTint([0xffffff, 0x84ffff, 0x00e5ff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 20);
  ctx.starEmitter.setParticleTint([0xffffff, 0x84ffff]);
  ctx.starEmitter.emitParticleAt(worldX, worldY, 12);

  const flash = ctx.scene.add
    .circle(worldX, worldY, zoneRadius * 0.34, 0xe0f7fa, 0.92)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(24);
  const ring = ctx.scene.add
    .circle(worldX, worldY, zoneRadius * 0.22, 0x84ffff, 0.38)
    .setStrokeStyle(3.8 * s, 0x00acc1, 0.96)
    .setDepth(23);

  const crystalBurst = ctx.scene.add
    .graphics()
    .setPosition(worldX, worldY)
    .setScale(0.28)
    .setDepth(24)
    .setBlendMode(Phaser.BlendModes.ADD);
  crystalBurst.lineStyle(2.6 * s, 0xffffff, 0.95);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const len = zoneRadius * (i % 2 === 0 ? 0.98 : 0.68);
    const tx = Math.cos(a) * len;
    const ty = Math.sin(a) * len;
    crystalBurst.lineBetween(0, 0, tx, ty);
    const barbR = len * 0.58;
    const bx = Math.cos(a) * barbR;
    const by = Math.sin(a) * barbR;
    for (const side of [-0.52, 0.52]) {
      crystalBurst.lineBetween(
        bx,
        by,
        bx + Math.cos(a + side) * (zoneRadius * 0.24),
        by + Math.sin(a + side) * (zoneRadius * 0.24),
      );
    }
  }

  ctx.scene.tweens.add({
    targets: flash,
    scale: 2.3,
    alpha: 0,
    duration: 190,
    ease: 'Quad.easeOut',
    onComplete: () => flash.destroy(),
  });
  ctx.scene.tweens.add({
    targets: ring,
    radius: zoneRadius * 1.06,
    alpha: 0,
    duration: 300,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
  ctx.scene.tweens.add({
    targets: crystalBurst,
    scale: 1.02,
    rotation: 0.22,
    alpha: 0,
    duration: 340,
    ease: 'Cubic.easeOut',
    onComplete: () => crystalBurst.destroy(),
  });
  ctx.addTrauma(0.38);
}

export function emitTankFrozenEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  const s = ctx.scaleRatio;
  ctx.shardEmitter.setParticleTint([0xffffff, 0x84ffff, 0x00bcd4]);
  ctx.shardEmitter.emitParticleAt(worldX, worldY, 18);
  ctx.sparkEmitter.setParticleTint([0xffffff, 0xe0f7fa, 0x00e5ff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 16);
  ctx.starEmitter.setParticleTint([0xffffff, 0x84ffff]);
  ctx.starEmitter.emitParticleAt(worldX, worldY, 10);

  const cubeFlash = ctx.scene.add
    .rectangle(worldX, worldY, 44 * s, 40 * s, 0x84ffff, 0.85)
    .setStrokeStyle(3.2 * s, 0xffffff, 0.98)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(24);
  const frostRing = ctx.scene.add
    .circle(worldX, worldY, 16 * s)
    .setStrokeStyle(4.0 * s, 0x00acc1, 0.95)
    .setDepth(23);

  ctx.scene.tweens.add({
    targets: cubeFlash,
    scale: 1.45,
    alpha: 0,
    duration: 240,
    ease: 'Cubic.easeOut',
    onComplete: () => cubeFlash.destroy(),
  });
  ctx.scene.tweens.add({
    targets: frostRing,
    scale: 2.9,
    alpha: 0,
    duration: 280,
    ease: 'Quad.easeOut',
    onComplete: () => frostRing.destroy(),
  });
  ctx.addTrauma(0.34);
}

export function emitIceBlockShatterEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  const s = ctx.scaleRatio;
  ctx.shardEmitter.setParticleTint([0xffffff, 0xb2ebf2, 0x84ffff, 0x00acc1]);
  ctx.shardEmitter.emitParticleAt(worldX, worldY, 20);
  ctx.sparkEmitter.setParticleTint([0xffffff, 0x84ffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 14);

  const ring = ctx.scene.add
    .circle(worldX, worldY, 22 * s)
    .setStrokeStyle(3.0 * s, 0x84ffff, 0.9)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(24);
  ctx.scene.tweens.add({
    targets: ring,
    scale: 2.1,
    alpha: 0,
    duration: 210,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
}

export function emitBarrierDeployEffect(
  ctx: EffectsRenderContext,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const s = ctx.scaleRatio;
  const mx = (x0 + x1) * 0.5;
  const my = (y0 + y1) * 0.5;
  ctx.sparkEmitter.setParticleTint([0x69f0ae, 0x00e676, 0x84ffff, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(x0, y0, 8);
  ctx.sparkEmitter.emitParticleAt(mx, my, 12);
  ctx.sparkEmitter.emitParticleAt(x1, y1, 8);

  const g = ctx.scene.add.graphics().setDepth(24).setBlendMode(Phaser.BlendModes.ADD);
  g.lineStyle(18 * s, 0x00e676, 0.55);
  g.lineBetween(x0, y0, x1, y1);
  g.lineStyle(7 * s, 0xffffff, 0.96);
  g.lineBetween(x0, y0, x1, y1);
  g.fillStyle(0xffffff, 0.95);
  g.fillCircle(x0, y0, 7 * s);
  g.fillCircle(x1, y1, 7 * s);

  for (const [px, py] of [
    [x0, y0],
    [x1, y1],
  ]) {
    const pylonWave = ctx.scene.add
      .circle(px, py, 7 * s)
      .setStrokeStyle(2.6 * s, 0x69f0ae, 0.92)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(24);
    ctx.scene.tweens.add({
      targets: pylonWave,
      scale: 2.8,
      alpha: 0,
      duration: 240,
      ease: 'Cubic.easeOut',
      onComplete: () => pylonWave.destroy(),
    });
  }

  ctx.scene.tweens.add({
    targets: g,
    alpha: 0,
    duration: 260,
    ease: 'Quad.easeOut',
    onComplete: () => g.destroy(),
  });
  ctx.addTrauma(0.24);
}

export function emitBarrierImpactRippleEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  const s = ctx.scaleRatio;
  ctx.sparkEmitter.setParticleTint([0x69f0ae, 0x00e676, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 8);

  const ripple = ctx.scene.add
    .circle(worldX, worldY, 6 * s)
    .setStrokeStyle(2.8 * s, 0x69f0ae, 0.95)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(24);
  ctx.scene.tweens.add({
    targets: ripple,
    scale: 2.9,
    alpha: 0,
    duration: 190,
    ease: 'Cubic.easeOut',
    onComplete: () => ripple.destroy(),
  });
}

export function emitBarrierShatterEffect(
  ctx: EffectsRenderContext,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): void {
  const s = ctx.scaleRatio;
  ctx.shardEmitter.setParticleTint([0x69f0ae, 0x00e676, 0x84ffff, 0xffffff]);
  ctx.sparkEmitter.setParticleTint([0xb9f6ca, 0x00e676, 0xffffff]);
  for (const t of [0.15, 0.5, 0.85]) {
    const px = x0 + (x1 - x0) * t;
    const py = y0 + (y1 - y0) * t;
    ctx.shardEmitter.emitParticleAt(px, py, 7);
    ctx.sparkEmitter.emitParticleAt(px, py, 6);
  }

  const flash = ctx.scene.add.graphics().setDepth(23).setBlendMode(Phaser.BlendModes.ADD);
  flash.lineStyle(12 * s, 0x69f0ae, 0.78);
  flash.lineBetween(x0, y0, x1, y1);
  ctx.scene.tweens.add({
    targets: flash,
    alpha: 0,
    duration: 200,
    ease: 'Quad.easeOut',
    onComplete: () => flash.destroy(),
  });
}

export function emitWarpBeaconPlantEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  const s = ctx.scaleRatio;
  ctx.starEmitter.setParticleTint([0xea80fc, 0x80d8ff, 0xffffff]);
  ctx.starEmitter.emitParticleAt(worldX, worldY, 16);
  ctx.sparkEmitter.setParticleTint([0xe040fb, 0x00e5ff, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 12);

  const outerRune = ctx.scene.add
    .circle(worldX, worldY, 9 * s, 0xe040fb, 0.35)
    .setStrokeStyle(3.4 * s, 0xe040fb, 0.96)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(23);
  const innerRune = ctx.scene.add
    .circle(worldX, worldY, 26 * s)
    .setStrokeStyle(2.4 * s, 0x80d8ff, 0.9)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(23);

  ctx.scene.tweens.add({
    targets: outerRune,
    scale: 3.1,
    alpha: 0,
    duration: 280,
    ease: 'Cubic.easeOut',
    onComplete: () => outerRune.destroy(),
  });
  ctx.scene.tweens.add({
    targets: innerRune,
    scale: 0.4,
    alpha: 0,
    duration: 240,
    ease: 'Quad.easeIn',
    onComplete: () => innerRune.destroy(),
  });
  ctx.addTrauma(0.2);
}

export function emitWarpTeleportEffect(
  ctx: EffectsRenderContext,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  blastRadius: number,
): void {
  const s = ctx.scaleRatio;
  for (const [bx, by] of [
    [fromX, fromY],
    [toX, toY],
  ] as const) {
    ctx.scorchStamp.setRotation(Math.random() * Math.PI * 2);
    ctx.scorchStamp.setScale(s * 0.78);
    ctx.floorDecalRT.draw(
      ctx.scorchStamp,
      bx - ctx.arenaOriginX,
      by - ctx.arenaOriginY,
    );
    ctx.scorchStamp.setScale(s);

    ctx.starEmitter.setParticleTint([0xe040fb, 0x80d8ff, 0xffea00, 0xffffff]);
    ctx.starEmitter.emitParticleAt(bx, by, 20);
    ctx.sparkEmitter.setParticleTint([0xea80fc, 0x00e5ff, 0xff9100, 0xffffff]);
    ctx.sparkEmitter.emitParticleAt(bx, by, 22);
    ctx.shardEmitter.setParticleTint([0x070412, 0xaa00ff, 0xe040fb, 0xffea00]);
    ctx.shardEmitter.emitParticleAt(bx, by, 14);
    ctx.flameEmitter.emitParticleAt(bx, by, 9);
    ctx.smokeEmitter.emitParticleAt(bx, by, 7);

    const core = ctx.scene.add
      .circle(bx, by, blastRadius * 0.36, 0xffffff, 0.98)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(25);
    const wave = ctx.scene.add
      .circle(bx, by, blastRadius * 0.24, 0xd500f9, 0.46)
      .setStrokeStyle(4.8 * s, 0xe040fb, 0.98)
      .setDepth(24);
    const cyanWave = ctx.scene.add
      .circle(bx, by, blastRadius * 0.16)
      .setStrokeStyle(3.2 * s, 0x00e5ff, 0.96)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(25);

    const riftStar = ctx.scene.add
      .graphics()
      .setPosition(bx, by)
      .setScale(0.32)
      .setDepth(25)
      .setBlendMode(Phaser.BlendModes.ADD);
    riftStar.lineStyle(2.8 * s, 0xffea00, 0.95);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = blastRadius * (i % 2 === 0 ? 1.06 : 0.68);
      riftStar.lineBetween(0, 0, Math.cos(a) * r, Math.sin(a) * r);
    }

    ctx.scene.tweens.add({
      targets: core,
      scale: 2.45,
      alpha: 0,
      duration: 210,
      ease: 'Quad.easeOut',
      onComplete: () => core.destroy(),
    });
    ctx.scene.tweens.add({
      targets: [wave, cyanWave],
      radius: blastRadius,
      alpha: 0,
      duration: 320,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        wave.destroy();
        cyanWave.destroy();
      },
    });
    ctx.scene.tweens.add({
      targets: riftStar,
      scale: 1.08,
      rotation: bx === fromX ? -0.35 : 0.35,
      alpha: 0,
      duration: 300,
      ease: 'Cubic.easeOut',
      onComplete: () => riftStar.destroy(),
    });
  }

  const streak = ctx.scene.add.graphics().setDepth(24).setBlendMode(Phaser.BlendModes.ADD);
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dist = Math.hypot(dx, dy) || 1;
  const nx = -dy / dist;
  const ny = dx / dist;
  const steps = Math.max(5, Math.min(18, Math.round(dist / (28 * s))));
  const pts: Array<{ x: number; y: number }> = [{ x: fromX, y: fromY }];
  for (let i = 1; i < steps; i++) {
    const f = i / steps;
    const offset = (Math.random() - 0.5) * 24 * s;
    pts.push({
      x: fromX + dx * f + nx * offset,
      y: fromY + dy * f + ny * offset,
    });
  }
  pts.push({ x: toX, y: toY });

  for (const [width, col, alpha] of [
    [11 * s, 0xaa00ff, 0.44],
    [5 * s, 0xe040fb, 0.88],
    [2.2 * s, 0x80d8ff, 0.98],
  ] as const) {
    streak.lineStyle(width, col, alpha);
    streak.beginPath();
    for (let i = 0; i < pts.length; i++) {
      if (i === 0) streak.moveTo(pts[i].x, pts[i].y);
      else streak.lineTo(pts[i].x, pts[i].y);
    }
    streak.strokePath();
  }

  ctx.scene.tweens.add({
    targets: streak,
    alpha: 0,
    duration: 260,
    ease: 'Quad.easeOut',
    onComplete: () => streak.destroy(),
  });
  ctx.addTrauma(0.78);
}
