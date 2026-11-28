import type Phaser from 'phaser';

export interface EffectsRenderContext {
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
  addTrauma(amount: number): void;
}
