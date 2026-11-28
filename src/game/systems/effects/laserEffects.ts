import Phaser from 'phaser';
import type { EffectsRenderContext } from './effectsContext';

export function emitLaserChargeTickEffect(
  ctx: EffectsRenderContext,
  muzzleX: number,
  muzzleY: number,
  progress01: number,
): void {
  const count = progress01 > 0.65 ? 3 : 2;
  for (let k = 0; k < count; k++) {
    const ang = Math.random() * Math.PI * 2;
    const dist = (26 + (1 - progress01) * 22) * ctx.scaleRatio;
    const sx = muzzleX + Math.cos(ang) * dist;
    const sy = muzzleY + Math.sin(ang) * dist;
    const color = k === 0 ? 0x00e5ff : k === 1 ? 0x448aff : 0xffffff;

    const spark = ctx.scene.add
      .circle(sx, sy, (2.2 + progress01 * 2.6) * ctx.scaleRatio, color, 0.95)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(23);

    ctx.scene.tweens.add({
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

  if (progress01 > 0.25) {
    const arcGfx = ctx.scene.add
      .graphics()
      .setDepth(24)
      .setBlendMode(Phaser.BlendModes.ADD);
    const boltAng = Math.random() * Math.PI * 2;
    const boltDist = (20 + progress01 * 18) * ctx.scaleRatio;
    const bx = muzzleX + Math.cos(boltAng) * boltDist;
    const by = muzzleY + Math.sin(boltAng) * boltDist;
    const midX = (bx + muzzleX) * 0.5 + (Math.random() - 0.5) * 12 * ctx.scaleRatio;
    const midY = (by + muzzleY) * 0.5 + (Math.random() - 0.5) * 12 * ctx.scaleRatio;

    arcGfx.lineStyle(1.8 * ctx.scaleRatio, 0x80d8ff, 0.9);
    arcGfx.beginPath();
    arcGfx.moveTo(bx, by);
    arcGfx.lineTo(midX, midY);
    arcGfx.lineTo(muzzleX, muzzleY);
    arcGfx.strokePath();

    if (progress01 > 0.55 && Math.random() < 0.45) {
      arcGfx.lineStyle(1.6 * ctx.scaleRatio, 0x00e5ff, 0.65);
      arcGfx.strokeCircle(muzzleX, muzzleY, (18 - progress01 * 6) * ctx.scaleRatio);
    }

    ctx.scene.tweens.add({
      targets: arcGfx,
      alpha: 0,
      duration: 85,
      onComplete: () => arcGfx.destroy(),
    });
  }

  if (progress01 > 0.7) {
    ctx.addTrauma(0.035);
  }
}

export function emitLaserBeamBlastEffect(
  ctx: EffectsRenderContext,
  points: ReadonlyArray<{ x: number; y: number }>,
  victimPositions: ReadonlyArray<{ x: number; y: number }> = [],
): void {
  if (points.length < 2) return;
  const s = ctx.scaleRatio;

  const arenaFlash = ctx.scene.add
    .rectangle(
      ctx.arenaOriginX + ctx.arenaWidth * 0.5,
      ctx.arenaOriginY + ctx.arenaHeight * 0.5,
      ctx.arenaWidth,
      ctx.arenaHeight,
      0x00b0ff,
      0.22,
    )
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(24);
  ctx.scene.tweens.add({
    targets: arenaFlash,
    alpha: 0,
    duration: 120,
    ease: 'Quad.easeOut',
    onComplete: () => arenaFlash.destroy(),
  });

  ctx.scorchStamp.setScale(s * 0.48);
  for (let i = 0; i < points.length; i += 3) {
    const p = points[i];
    ctx.floorDecalRT.draw(
      ctx.scorchStamp,
      p.x - ctx.arenaOriginX,
      p.y - ctx.arenaOriginY,
    );
  }
  ctx.scorchStamp.setScale(s);

  const afterburnGfx = ctx.scene.add
    .graphics()
    .setDepth(16)
    .setBlendMode(Phaser.BlendModes.ADD);
  const traceSimple = (
    gfx: Phaser.GameObjects.Graphics,
    width: number,
    color: number,
    alpha: number,
  ) => {
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
  ctx.scene.tweens.add({
    targets: afterburnGfx,
    alpha: 0,
    duration: 1050,
    ease: 'Sine.easeOut',
    onComplete: () => afterburnGfx.destroy(),
  });

  const beamGfx = ctx.scene.add
    .graphics()
    .setDepth(26)
    .setBlendMode(Phaser.BlendModes.ADD);

  const strokeCurve = (width: number, color: number, alpha: number, jitterPx = 0) => {
    beamGfx.lineStyle(width, color, alpha);
    beamGfx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const jx =
        jitterPx > 0 && i > 0 && i < points.length - 1 ? (Math.random() - 0.5) * jitterPx : 0;
      const jy =
        jitterPx > 0 && i > 0 && i < points.length - 1 ? (Math.random() - 0.5) * jitterPx : 0;
      if (i === 0) beamGfx.moveTo(points[i].x + jx, points[i].y + jy);
      else beamGfx.lineTo(points[i].x + jx, points[i].y + jy);
    }
    beamGfx.strokePath();
  };

  strokeCurve(46 * s, 0x0055ff, 0.32);
  strokeCurve(28 * s, 0x0091ea, 0.68);
  strokeCurve(15.5 * s, 0x00e5ff, 0.94);

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

  strokeCurve(7.5 * s, 0xffffff, 1.0);
  strokeCurve(2.6 * s, 0x40c4ff, 0.96, 20 * s);
  strokeCurve(1.8 * s, 0xffffff, 0.92, 13 * s);

  ctx.scene.time.delayedCall(90, () => {
    if (!ctx.scene?.sys?.isActive()) return;
    const crackleGfx = ctx.scene.add
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
    ctx.scene.tweens.add({
      targets: crackleGfx,
      alpha: 0,
      duration: 180,
      onComplete: () => crackleGfx.destroy(),
    });
  });

  const startPt = points[0];
  const secondPt = points[Math.min(1, points.length - 1)];
  const endPt = points[points.length - 1];
  const muzzleAng = Math.atan2(secondPt.y - startPt.y, secondPt.x - startPt.x);

  ctx.starEmitter.setParticleTint([0x00e5ff, 0x40c4ff, 0xffffff]);
  ctx.starEmitter.emitParticleAt(startPt.x, startPt.y, 18);
  ctx.starEmitter.emitParticleAt(endPt.x, endPt.y, 22);

  ctx.sparkEmitter.setParticleTint([0x00e5ff, 0x448aff, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(startPt.x, startPt.y, 18);
  ctx.sparkEmitter.emitParticleAt(endPt.x, endPt.y, 24);
  for (let i = 2; i < points.length; i += 5) {
    ctx.sparkEmitter.emitParticleAt(points[i].x, points[i].y, 3);
  }

  const machCone = ctx.scene.add
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
  ctx.scene.tweens.add({
    targets: machCone,
    alpha: 0,
    duration: 220,
    onComplete: () => machCone.destroy(),
  });

  const muzzleNova = ctx.scene.add
    .circle(startPt.x, startPt.y, 22 * s, 0x00e5ff, 0.92)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(27);
  const muzzleShock = ctx.scene.add
    .circle(startPt.x, startPt.y, 12 * s)
    .setStrokeStyle(3.8 * s, 0xffffff, 0.95)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(27);
  const exitShock = ctx.scene.add
    .circle(endPt.x, endPt.y, 14 * s)
    .setStrokeStyle(4.2 * s, 0x00e5ff, 0.95)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(27);

  ctx.scene.tweens.add({
    targets: muzzleNova,
    scale: 3.1,
    alpha: 0,
    duration: 310,
    ease: 'Cubic.easeOut',
    onComplete: () => muzzleNova.destroy(),
  });
  ctx.scene.tweens.add({
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

  for (const vp of victimPositions) {
    const hitRing = ctx.scene.add
      .circle(vp.x, vp.y, 15 * s)
      .setStrokeStyle(4.5 * s, 0x00e5ff, 1)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(28);
    ctx.starEmitter.emitParticleAt(vp.x, vp.y, 16);
    ctx.scene.tweens.add({
      targets: hitRing,
      scale: 4.5,
      alpha: 0,
      duration: 380,
      ease: 'Cubic.easeOut',
      onComplete: () => hitRing.destroy(),
    });
  }

  ctx.scene.tweens.add({
    targets: beamGfx,
    alpha: 0,
    duration: 480,
    ease: 'Cubic.easeOut',
    onComplete: () => beamGfx.destroy(),
  });

  ctx.addTrauma(0.95);
}
