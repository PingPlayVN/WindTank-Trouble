import Phaser from 'phaser';
import { BASE_GAMEPLAY } from '../config/constants';
import { Projectile } from '../entities/Projectile';
import type { Tank } from '../entities/Tank';
import { computeSafeMuzzleSpawn, stepProjectilesSimulation } from './CollisionSystem';
import type { NetProjectileSnapshot } from '../network/PeerMultiplayerManager';
import type {
  BounceBehavior,
  PlayerIndex,
  ProjectileHitEvent,
  ProjectileKinematics,
  ProjectileVariant,
  WallBounceEvent,
  WallRect,
} from '../types/gameTypes';

const POOL_SIZE = 360;

export interface CustomProjectileSpawnOptions {
  ownerIndex: PlayerIndex;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  maxLifetime: number;
  maxBounces: number;
  graceTimer: number;
  variant: ProjectileVariant;
  bounceBehavior?: BounceBehavior;
  drillsLeft?: number;
}

export class ProjectileSystem {
  private readonly pool: Projectile[] = [];
  private readonly kinematicsList: ProjectileKinematics[] = [];
  private readonly trailGraphics: Phaser.GameObjects.Graphics;
  private readonly flameStreamGraphics: Phaser.GameObjects.Graphics;
  private readonly scaleRatio: number;

  constructor(scene: Phaser.Scene, scaleRatio: number) {
    this.scaleRatio = scaleRatio;
    this.trailGraphics = scene.add.graphics().setDepth(15);
    this.flameStreamGraphics = scene.add.graphics().setDepth(15.5);

    for (let i = 0; i < POOL_SIZE; i++) {
      const proj = new Projectile(scene, i);
      this.pool.push(proj);
      this.kinematicsList.push(proj.kinematics);
    }
  }

  getPool(): readonly Projectile[] {
    return this.pool;
  }

  getKinematicsList(): ProjectileKinematics[] {
    return this.kinematicsList;
  }

  getProjectileById(id: number): Projectile | undefined {
    return this.pool[id];
  }

  getActiveCountForPlayer(playerIndex: PlayerIndex): number {
    let count = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const k = this.pool[i].kinematics;
      if (k.active && k.ownerIndex === playerIndex && (k.variant ?? 'standard') === 'standard') {
        count++;
      }
    }
    return count;
  }

  getRemainingAmmo(playerIndex: PlayerIndex): number {
    return Math.max(
      0,
      BASE_GAMEPLAY.maxProjectilesPerTank - this.getActiveCountForPlayer(playerIndex),
    );
  }

  getTotalActiveCount(): number {
    let count = 0;
    for (let i = 0; i < this.pool.length; i++) {
      if (this.pool[i].kinematics.active) count++;
    }
    return count;
  }

  hasActiveVariantForPlayer(playerIndex: PlayerIndex, variant: ProjectileVariant): boolean {
    for (let i = 0; i < this.pool.length; i++) {
      const k = this.pool[i].kinematics;
      if (k.active && k.ownerIndex === playerIndex && k.variant === variant) {
        return true;
      }
    }
    return false;
  }

  spawnCustomProjectile(opts: CustomProjectileSpawnOptions): Projectile | null {
    const slot = this.pool.find((p) => !p.kinematics.active);
    if (!slot) return null;
    slot.spawn(
      opts.ownerIndex,
      opts.x,
      opts.y,
      opts.vx,
      opts.vy,
      opts.radius,
      opts.maxLifetime,
      opts.maxBounces,
      opts.graceTimer,
      this.scaleRatio,
      opts.variant,
      opts.bounceBehavior ?? 'reflect',
      opts.drillsLeft,
    );
    return slot;
  }

  tryFireFromTank(
    tank: Tank,
    walls: readonly WallRect[],
  ): { fired: boolean; muzzleX: number; muzzleY: number; immediateBounce: boolean } {
    if (!tank.canFire()) {
      return { fired: false, muzzleX: 0, muzzleY: 0, immediateBounce: false };
    }
    if (this.getActiveCountForPlayer(tank.index) >= BASE_GAMEPLAY.maxProjectilesPerTank) {
      return { fired: false, muzzleX: 0, muzzleY: 0, immediateBounce: false };
    }

    const radius = BASE_GAMEPLAY.projectileRadius * this.scaleRatio;
    const speed = BASE_GAMEPLAY.projectileSpeed * this.scaleRatio;
    const spawn = computeSafeMuzzleSpawn(
      tank.kinematics.x,
      tank.kinematics.y,
      tank.kinematics.angle,
      tank.getBarrelLength(),
      radius,
      speed,
      walls,
    );

    const grace = spawn.immediateBounce ? 0 : BASE_GAMEPLAY.selfHitGraceSec;
    const slot = this.spawnCustomProjectile({
      ownerIndex: tank.index,
      x: spawn.x,
      y: spawn.y,
      vx: spawn.vx,
      vy: spawn.vy,
      radius,
      maxLifetime: BASE_GAMEPLAY.projectileLifetimeSec,
      maxBounces: BASE_GAMEPLAY.projectileMaxBounces,
      graceTimer: grace,
      variant: 'standard',
      bounceBehavior: 'reflect',
    });

    if (!slot) {
      return { fired: false, muzzleX: 0, muzzleY: 0, immediateBounce: false };
    }

    tank.triggerFireVisual();
    return {
      fired: true,
      muzzleX: spawn.x,
      muzzleY: spawn.y,
      immediateBounce: spawn.immediateBounce,
    };
  }

  update(
    dt: number,
    tanks: readonly Tank[],
    walls: readonly WallRect[],
    onExpirePuff: (
      x: number,
      y: number,
      variant: ProjectileVariant,
      ownerIndex: PlayerIndex,
    ) => void,
    onDrillImpact?: (proj: ProjectileKinematics, hitX: number, hitY: number) => boolean,
  ): { bounces: WallBounceEvent[]; hits: ProjectileHitEvent[] } {
    const tankKinematics = tanks.map((t) => t.kinematics);
    const result = stepProjectilesSimulation(
      this.kinematicsList,
      tankKinematics,
      walls,
      dt,
      onDrillImpact,
    );

    const hitIds = new Set(result.hits.map((h) => h.projectileId));
    this.trailGraphics.clear();
    this.flameStreamGraphics.clear();

    for (let i = 0; i < this.pool.length; i++) {
      const proj = this.pool[i];
      const justExpired = proj.syncVisual(this.scaleRatio);
      if (
        justExpired &&
        !hitIds.has(proj.kinematics.id) &&
        proj.kinematics.variant !== 'flame'
      ) {
        onExpirePuff(
          proj.kinematics.x,
          proj.kinematics.y,
          proj.kinematics.variant ?? 'standard',
          proj.kinematics.ownerIndex,
        );
      }
      proj.drawTrail(this.trailGraphics);
    }

    this.drawVolumetricFlameRibbons();
    return result;
  }

  /**
   * Connects adjacent active flame parcels per tank into a continuous volumetric liquid-fire core
   * so pressurized flamethrower streams look completely seamless from nozzle to billowing tip!
   */
  private drawVolumetricFlameRibbons(): void {
    const maxLinkSq = (44 * this.scaleRatio) * (44 * this.scaleRatio);
    for (let owner = 0; owner < 4; owner++) {
      let prev: ProjectileKinematics | null = null;
      for (let i = 0; i < this.pool.length; i++) {
        const k = this.pool[i].kinematics;
        if (!k.active || k.variant !== 'flame' || k.ownerIndex !== owner) continue;
        const frac = k.age / Math.max(0.05, k.maxLifetime);
        if (frac >= 0.78) continue;

        if (prev) {
          const dx = k.x - prev.x;
          const dy = k.y - prev.y;
          const dSq = dx * dx + dy * dy;
          if (dSq > 1 && dSq <= maxLinkSq) {
            const avgFrac = 0.5 * (frac + prev.age / Math.max(0.05, prev.maxLifetime));
            const outerCol = avgFrac < 0.14 ? 0x29b6f6 : avgFrac < 0.48 ? 0xff5722 : 0xb71c1c;
            const innerCol = avgFrac < 0.18 ? 0xe1f5fe : 0xffea00;
            const avgR = 0.5 * (k.radius + prev.radius);
            const alpha = Math.max(0.08, (1 - avgFrac * 1.1) * 0.44);

            this.flameStreamGraphics.lineStyle(avgR * 1.55, outerCol, alpha);
            this.flameStreamGraphics.lineBetween(prev.x, prev.y, k.x, k.y);
            if (avgFrac < 0.6) {
              this.flameStreamGraphics.lineStyle(avgR * 0.62, innerCol, Math.min(0.85, alpha * 1.5));
              this.flameStreamGraphics.lineBetween(prev.x, prev.y, k.x, k.y);
            }
          }
        }
        prev = k;
      }
    }
  }

  applyNetworkProjectiles(snapshots: readonly NetProjectileSnapshot[], dt: number): void {
    const seen = new Set<number>();
    for (const sp of snapshots) {
      const proj = this.pool[sp.id];
      if (!proj) continue;
      seen.add(sp.id);

      if (!proj.kinematics.active) {
        const bounceBehavior: BounceBehavior =
          sp.variant === 'flame'
            ? 'slide'
            : sp.variant === 'drill'
              ? 'drill'
              : sp.variant === 'spike_shard'
                ? 'shatter'
                : 'reflect';
        proj.spawn(
          sp.ownerIndex,
          sp.x,
          sp.y,
          sp.vx,
          sp.vy,
          sp.radius,
          sp.maxLifetime,
          14,
          0,
          this.scaleRatio,
          sp.variant,
          bounceBehavior,
        );
        proj.kinematics.age = sp.age;
      } else {
        const dist = Math.hypot(sp.x - proj.kinematics.x, sp.y - proj.kinematics.y);
        if (dist > 64) {
          proj.kinematics.x = sp.x;
          proj.kinematics.y = sp.y;
        } else {
          const blend = Math.min(1, Math.max(0.45, dt * 26));
          proj.kinematics.x += (sp.x - proj.kinematics.x) * blend;
          proj.kinematics.y += (sp.y - proj.kinematics.y) * blend;
        }
        proj.kinematics.vx = sp.vx;
        proj.kinematics.vy = sp.vy;
        proj.kinematics.radius = sp.radius;
        proj.kinematics.age = sp.age;
        proj.kinematics.maxLifetime = sp.maxLifetime;
        proj.kinematics.variant = sp.variant;
      }
    }

    this.trailGraphics.clear();
    this.flameStreamGraphics.clear();
    for (let i = 0; i < this.pool.length; i++) {
      const proj = this.pool[i];
      if (proj.kinematics.active && !seen.has(i)) {
        proj.deactivate();
        continue;
      }
      if (proj.kinematics.active) {
        proj.syncVisual(this.scaleRatio);
        proj.drawTrail(this.trailGraphics);
      }
    }
    this.drawVolumetricFlameRibbons();
  }

  stepGuestExtrapolation(dt: number): void {
    this.trailGraphics.clear();
    this.flameStreamGraphics.clear();
    for (let i = 0; i < this.pool.length; i++) {
      const proj = this.pool[i];
      const k = proj.kinematics;
      if (!k.active) continue;
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      k.age += dt;
      proj.syncVisual(this.scaleRatio);
      proj.drawTrail(this.trailGraphics);
    }
    this.drawVolumetricFlameRibbons();
  }

  clearAll(): void {
    this.trailGraphics.clear();
    this.flameStreamGraphics.clear();
    for (const p of this.pool) {
      p.deactivate();
    }
  }

  destroy(): void {
    this.trailGraphics.destroy();
    this.flameStreamGraphics.destroy();
    for (const p of this.pool) {
      p.destroy();
    }
  }
}
