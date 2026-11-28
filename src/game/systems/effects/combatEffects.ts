import Phaser from 'phaser';
import type { TankColorPalette } from '../../types/gameTypes';
import type { EffectsRenderContext } from './effectsContext';

export function stampTreadMarkEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  angleRad: number,
): void {
  ctx.treadStamp.setRotation(angleRad);
  ctx.floorDecalRT.draw(
    ctx.treadStamp,
    worldX - ctx.arenaOriginX,
    worldY - ctx.arenaOriginY,
  );
}

export function emitExhaustPuffEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  ctx.smokeEmitter.emitParticleAt(worldX, worldY, 1);
}

export function emitMuzzleFlashEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  angleRad: number,
): void {
  ctx.smokeEmitter.emitParticleAt(worldX, worldY, 4);
  ctx.sparkEmitter.setParticleTint([0xfff59d, 0xffb300, 0xff7043]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 5);

  const flash = ctx.scene.add
    .circle(
      worldX + Math.cos(angleRad) * 3,
      worldY + Math.sin(angleRad) * 3,
      8.5 * ctx.scaleRatio,
      0xfff59d,
      0.95,
    )
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(21);
  ctx.scene.tweens.add({
    targets: flash,
    scale: 0.15,
    alpha: 0,
    duration: 85,
    ease: 'Quad.easeOut',
    onComplete: () => flash.destroy(),
  });
}

export function emitGatlingMuzzleEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  angleRad: number,
): void {
  ctx.sparkEmitter.setParticleTint([0xffea00, 0xff9100, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 6);

  const flash = ctx.scene.add
    .star(
      worldX + Math.cos(angleRad) * 4,
      worldY + Math.sin(angleRad) * 4,
      4,
      3 * ctx.scaleRatio,
      10 * ctx.scaleRatio,
      0xffea00,
      0.95,
    )
    .setRotation(angleRad)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(22);

  ctx.scene.tweens.add({
    targets: flash,
    scale: 0.2,
    alpha: 0,
    duration: 60,
    onComplete: () => flash.destroy(),
  });
  ctx.addTrauma(0.08);
}

export function emitWallBounceEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  ctx.sparkEmitter.setParticleTint([0xffd54f, 0xff8a65, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 6);
  const ring = ctx.scene.add
    .circle(worldX, worldY, 4 * ctx.scaleRatio)
    .setStrokeStyle(1.8, 0xffb300, 0.72)
    .setDepth(17);
  ctx.scene.tweens.add({
    targets: ring,
    scale: 2.6,
    alpha: 0,
    duration: 140,
    ease: 'Quad.easeOut',
    onComplete: () => ring.destroy(),
  });
}

export function emitShellExpireEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  ctx.smokeEmitter.emitParticleAt(worldX, worldY, 4);
}

export function emitCrateSpawnEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  ctx.smokeEmitter.emitParticleAt(worldX, worldY, 8);
  ctx.starEmitter.setParticleTint([0xffe082, 0xffca28, 0xffffff]);
  ctx.starEmitter.emitParticleAt(worldX, worldY, 8);

  const ring = ctx.scene.add
    .circle(worldX, worldY, 8 * ctx.scaleRatio)
    .setStrokeStyle(3, 0xffb300, 0.9)
    .setDepth(19);
  ctx.scene.tweens.add({
    targets: ring,
    scale: 3.4,
    alpha: 0,
    duration: 380,
    ease: 'Cubic.easeOut',
    onComplete: () => ring.destroy(),
  });
  ctx.addTrauma(0.18);
}

export function emitCratePickupEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  skillName: string,
  accentHex: string,
  accentColor: number,
): void {
  ctx.woodEmitter.emitParticleAt(worldX, worldY, 14);
  ctx.starEmitter.setParticleTint([accentColor, 0xffffff, 0xffe082]);
  ctx.starEmitter.emitParticleAt(worldX, worldY, 16);
  ctx.sparkEmitter.setParticleTint([accentColor, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 14);

  const flash = ctx.scene.add
    .circle(worldX, worldY, 16 * ctx.scaleRatio, accentColor, 0.75)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(24);
  const outerRing = ctx.scene.add
    .circle(worldX, worldY, 10 * ctx.scaleRatio)
    .setStrokeStyle(3.5, accentColor, 0.95)
    .setDepth(24);

  ctx.scene.tweens.add({
    targets: flash,
    scale: 2.8,
    alpha: 0,
    duration: 260,
    ease: 'Cubic.easeOut',
    onComplete: () => flash.destroy(),
  });
  ctx.scene.tweens.add({
    targets: outerRing,
    scale: 4.2,
    alpha: 0,
    duration: 380,
    ease: 'Cubic.easeOut',
    onComplete: () => outerRing.destroy(),
  });

  const label = ctx.scene.add
    .text(worldX, worldY - 18 * ctx.scaleRatio, `★ ${skillName}!`, {
      fontFamily: "'Segoe UI', 'Inter', sans-serif",
      fontSize: `${Math.max(13, Math.round(16 * Math.max(0.8, ctx.scaleRatio)))}px`,
      fontStyle: '900',
      color: accentHex,
      stroke: '#FFFFFF',
      strokeThickness: 4,
    })
    .setOrigin(0.5, 0.5)
    .setScale(0.6)
    .setDepth(35);

  ctx.scene.tweens.add({
    targets: label,
    y: worldY - 52 * ctx.scaleRatio,
    scale: 1.08,
    alpha: { from: 1, to: 0 },
    duration: 950,
    ease: 'Back.easeOut',
    onComplete: () => label.destroy(),
  });

  ctx.addTrauma(0.36);
}

export function emitSuitRevertEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
): void {
  ctx.smokeEmitter.emitParticleAt(worldX, worldY, 6);
  const ring = ctx.scene.add
    .circle(worldX, worldY, 14 * ctx.scaleRatio)
    .setStrokeStyle(2, 0x90a4ae, 0.75)
    .setDepth(20);
  ctx.scene.tweens.add({
    targets: ring,
    scale: 0.4,
    alpha: 0,
    duration: 200,
    onComplete: () => ring.destroy(),
  });
}

export function emitTankExplosionEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  palette: TankColorPalette,
): void {
  ctx.scorchStamp.setRotation(Math.random() * Math.PI * 2);
  ctx.floorDecalRT.draw(
    ctx.scorchStamp,
    worldX - ctx.arenaOriginX,
    worldY - ctx.arenaOriginY,
  );

  ctx.shardEmitter.setParticleTint([
    palette.primary,
    palette.highlight,
    palette.shadow,
    0x2b2d30,
    0xffffff,
  ]);
  ctx.shardEmitter.emitParticleAt(worldX, worldY, 28);

  ctx.flameEmitter.emitParticleAt(worldX, worldY, 22);
  ctx.starEmitter.setParticleTint([palette.highlight, 0xffea00, 0xffffff]);
  ctx.starEmitter.emitParticleAt(worldX, worldY, 14);
  ctx.sparkEmitter.setParticleTint([0xffea00, 0xff6d00, palette.primary, 0xffffff]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 24);
  ctx.smokeEmitter.emitParticleAt(worldX, worldY, 18);

  const core = ctx.scene.add
    .circle(worldX, worldY, 16 * ctx.scaleRatio, 0xffffff, 1)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(24);
  const innerRing = ctx.scene.add
    .circle(worldX, worldY, 12 * ctx.scaleRatio)
    .setStrokeStyle(4.2, palette.primary, 0.95)
    .setDepth(23);
  const outerRing = ctx.scene.add
    .circle(worldX, worldY, 16 * ctx.scaleRatio)
    .setStrokeStyle(2.6, 0xfff59d, 0.85)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(23);

  ctx.scene.tweens.add({
    targets: core,
    scale: 3.1,
    alpha: 0,
    duration: 210,
    ease: 'Cubic.easeOut',
    onComplete: () => core.destroy(),
  });
  ctx.scene.tweens.add({
    targets: innerRing,
    scale: 4.1,
    alpha: 0,
    duration: 340,
    ease: 'Quad.easeOut',
    onComplete: () => innerRing.destroy(),
  });
  ctx.scene.tweens.add({
    targets: outerRing,
    scale: 4.8,
    alpha: 0,
    duration: 260,
    ease: 'Cubic.easeOut',
    onComplete: () => outerRing.destroy(),
  });

  ctx.addTrauma(0.86);
}

export function emitArmorHitImpactEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  accentColor: number,
  remainingRatio: number,
): void {
  ctx.sparkEmitter.setParticleTint([0xffffff, 0xffea00, accentColor]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 7);
  ctx.shardEmitter.setParticleTint([accentColor, 0x455a64]);
  ctx.shardEmitter.emitParticleAt(worldX, worldY, 3);
  if (remainingRatio < 0.5) {
    ctx.smokeEmitter.emitParticleAt(worldX, worldY, 3);
  }

  const ring = ctx.scene.add
    .circle(worldX, worldY, 8 * ctx.scaleRatio)
    .setStrokeStyle(2.4 * ctx.scaleRatio, 0xffca28, 0.9)
    .setDepth(21);
  ctx.scene.tweens.add({
    targets: ring,
    scale: 2.3,
    alpha: 0,
    duration: 150,
    ease: 'Quad.easeOut',
    onComplete: () => ring.destroy(),
  });
  ctx.addTrauma(0.24);
}

export function emitCriticalHullDamageTickEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  hpRatio: number,
): void {
  const ox = (Math.random() - 0.5) * 14 * ctx.scaleRatio;
  const oy = (Math.random() - 0.5) * 14 * ctx.scaleRatio;
  ctx.smokeEmitter.emitParticleAt(worldX + ox, worldY + oy, 1);

  if (hpRatio <= 0.32) {
    ctx.flameEmitter.emitParticleAt(worldX + ox * 0.6, worldY + oy * 0.6, 2);
  }
  if (hpRatio <= 0.16) {
    ctx.sparkEmitter.setParticleTint([0xffff00, 0x80d8ff, 0xffffff]);
    ctx.sparkEmitter.emitParticleAt(worldX - ox * 0.5, worldY - oy * 0.5, 2);
  }
}

export function emitTntBarrelExplosionEffect(
  ctx: EffectsRenderContext,
  worldX: number,
  worldY: number,
  blastRadius: number,
): void {
  ctx.scorchStamp.setRotation(Math.random() * Math.PI * 2);
  ctx.scorchStamp.setScale(ctx.scaleRatio * 1.25);
  ctx.floorDecalRT.draw(
    ctx.scorchStamp,
    worldX - ctx.arenaOriginX,
    worldY - ctx.arenaOriginY,
  );
  ctx.scorchStamp.setScale(ctx.scaleRatio);

  ctx.flameEmitter.emitParticleAt(worldX, worldY, 22);
  ctx.smokeEmitter.emitParticleAt(worldX, worldY, 16);
  ctx.sparkEmitter.setParticleTint([0xffffff, 0xffea00, 0xff6d00, 0xd50000]);
  ctx.sparkEmitter.emitParticleAt(worldX, worldY, 20);
  ctx.woodEmitter.emitParticleAt(worldX, worldY, 10);
  ctx.shardEmitter.setParticleTint([0xb71c1c, 0x263238, 0xffb300]);
  ctx.shardEmitter.emitParticleAt(worldX, worldY, 10);

  const flash = ctx.scene.add
    .circle(worldX, worldY, blastRadius * 0.42, 0xfff59d, 0.95)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(22);
  const wave = ctx.scene.add
    .circle(worldX, worldY, blastRadius * 0.25)
    .setStrokeStyle(4.2 * ctx.scaleRatio, 0xff5722, 0.95)
    .setDepth(22);

  ctx.scene.tweens.add({
    targets: flash,
    scale: 2.2,
    alpha: 0,
    duration: 180,
    ease: 'Quad.easeOut',
    onComplete: () => flash.destroy(),
  });
  ctx.scene.tweens.add({
    targets: wave,
    radius: blastRadius,
    alpha: 0,
    duration: 300,
    ease: 'Cubic.easeOut',
    onComplete: () => wave.destroy(),
  });

  ctx.addTrauma(0.82);
}
