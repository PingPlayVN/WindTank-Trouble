import Phaser from 'phaser';
import type { Tank } from '../entities/Tank';
import { audioManager } from '../managers/AudioManager';
import type { EffectsSystem } from './EffectsSystem';
import {
  applySafeTankKnockback,
  computeBarrelExplosionImpact,
  findProjectileBarrelHits,
  resolveTankBarrelCollisions,
  spawnTntBarrels,
  type TntBarrelState,
} from './BattleModeSim';
import { drillMazeWallAtPoint } from './PowerUpSim';
import type { ProjectileSystem } from './ProjectileSystem';
import type { BuiltArenaLayout, PlayerIndex } from '../types/gameTypes';

export interface NetBarrelSnapshot {
  id: number;
  x: number;
  y: number;
  radius: number;
  blastRadius: number;
  fusing: boolean;
}

interface BarrelVisualEntry {
  state: TntBarrelState;
  sprite: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Arc;
}

export class TntBarrelSystem {
  private readonly scene: Phaser.Scene;
  private readonly arena: BuiltArenaLayout;
  private readonly effectsSystem: EffectsSystem;
  private readonly onWallsModified: () => void;
  private readonly entries: BarrelVisualEntry[] = [];
  private animClock = 0;

  constructor(
    scene: Phaser.Scene,
    arena: BuiltArenaLayout,
    effectsSystem: EffectsSystem,
    onWallsModified: () => void,
  ) {
    this.scene = scene;
    this.arena = arena;
    this.effectsSystem = effectsSystem;
    this.onWallsModified = onWallsModified;
  }

  spawnInitialBarrels(tanks: readonly Tank[], roundSeed: number): void {
    this.clearAll();
    const states = spawnTntBarrels(
      this.arena,
      tanks.map((t) => t.kinematics),
      roundSeed,
    );
    for (const st of states) {
      this.addVisualEntry(st);
    }
  }

  private addVisualEntry(state: TntBarrelState): BarrelVisualEntry {
    const scale = this.arena.scaleRatio;
    const ring = this.scene.add
      .circle(state.x, state.y, state.radius * 1.28)
      .setStrokeStyle(1.6 * scale, 0xff5722, 0.45)
      .setFillStyle(0xff3d00, 0.07)
      .setDepth(7);

    const sprite = this.scene.add
      .image(state.x, state.y, 'prop_tnt_barrel')
      .setScale(((state.radius * 2) / 32) * 0.98)
      .setDepth(11);

    const entry: BarrelVisualEntry = { state, sprite, ring };
    this.entries.push(entry);
    return entry;
  }

  getBarrelStates(): readonly TntBarrelState[] {
    return this.entries.map((e) => e.state);
  }

  getActiveCount(): number {
    let n = 0;
    for (const e of this.entries) {
      if (e.state.active) n++;
    }
    return n;
  }

  resolveTankCollisions(tanks: readonly Tank[]): void {
    if (this.entries.length === 0) return;
    resolveTankBarrelCollisions(
      tanks.map((t) => t.kinematics),
      this.entries.map((e) => e.state),
      this.arena.walls,
    );
  }

  /**
   * Triggers any barrel intersected by a Laser polyline or Reaper scythe segment!
   */
  triggerBarrelsAlongSegment(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    tanks: readonly Tank[],
    onBarrelDamageTank: (victimIndex: PlayerIndex, damage: number) => void,
    onBarrelBlastEvent?: (x: number, y: number, blastRadius: number) => void,
  ): boolean {
    let detonatedAny = false;
    const segDx = x1 - x0;
    const segDy = y1 - y0;
    const lenSq = segDx * segDx + segDy * segDy;

    for (const entry of [...this.entries]) {
      if (!entry.state.active) continue;
      const t =
        lenSq > 0.0001
          ? Math.max(0, Math.min(1, ((entry.state.x - x0) * segDx + (entry.state.y - y0) * segDy) / lenSq))
          : 0;
      const px = x0 + segDx * t;
      const py = y0 + segDy * t;
      if (Math.hypot(entry.state.x - px, entry.state.y - py) <= entry.state.radius + 10) {
        this.detonateEntry(entry, tanks, onBarrelDamageTank, onBarrelBlastEvent);
        detonatedAny = true;
      }
    }
    return detonatedAny;
  }

  updateSubStep(
    subDt: number,
    tanks: readonly Tank[],
    projectileSystem: ProjectileSystem,
    onBarrelDamageTank: (victimIndex: PlayerIndex, damage: number) => void,
    onBarrelBlastEvent?: (x: number, y: number, blastRadius: number) => void,
  ): boolean {
    if (this.entries.length === 0) return false;
    let hudOrWorldDirty = false;

    // 1. Check projectile impacts against active TNT barrels
    const hits = findProjectileBarrelHits(
      projectileSystem.getKinematicsList(),
      this.entries.map((e) => e.state),
    );
    for (const h of hits) {
      const proj = projectileSystem.getProjectileById(h.projectileId);
      if (proj && proj.kinematics.variant !== 'drill') {
        proj.deactivate();
      }
      const target = this.entries.find((e) => e.state.id === h.barrelId && e.state.active);
      if (target) {
        this.detonateEntry(target, tanks, onBarrelDamageTank, onBarrelBlastEvent);
        hudOrWorldDirty = true;
      }
    }

    // 2. Tick chain-reaction fuses (`0.14s` dramatic cascade!)
    for (const entry of [...this.entries]) {
      if (!entry.state.active || entry.state.fuseRemainingSec === null) continue;
      entry.state.fuseRemainingSec -= subDt;
      if (entry.state.fuseRemainingSec <= 0) {
        this.detonateEntry(entry, tanks, onBarrelDamageTank, onBarrelBlastEvent);
        hudOrWorldDirty = true;
      }
    }

    return hudOrWorldDirty;
  }

  private detonateEntry(
    entry: BarrelVisualEntry,
    tanks: readonly Tank[],
    onBarrelDamageTank: (victimIndex: PlayerIndex, damage: number) => void,
    onBarrelBlastEvent?: (x: number, y: number, blastRadius: number) => void,
  ): void {
    if (!entry.state.active) return;
    entry.state.active = false;
    entry.state.fuseRemainingSec = null;
    entry.sprite.setVisible(false);
    entry.ring.setVisible(false);

    const bx = entry.state.x;
    const by = entry.state.y;
    const blastR = entry.state.blastRadius;

    audioManager.playTankExplosion();
    this.effectsSystem.emitTntBarrelExplosion(bx, by, blastR);
    onBarrelBlastEvent?.(bx, by, blastR);

    const impact = computeBarrelExplosionImpact(
      entry.state,
      this.entries.map((e) => e.state),
      tanks.map((t) => t.kinematics),
      this.arena,
    );

    // Demolish adjacent interior maze walls!
    let carvedAnyWall = false;
    for (const pt of impact.wallProbePoints) {
      const res = drillMazeWallAtPoint(this.arena, pt.x, pt.y);
      if (res.carved) {
        carvedAnyWall = true;
        this.effectsSystem.emitWallDrilled(res.breakX, res.breakY);
      }
    }
    if (carvedAnyWall) {
      audioManager.playWallDrill();
      this.onWallsModified();
    }

    // Apply safe wall-aware knockback & damage to nearby tanks!
    for (const v of impact.victims) {
      const victimTank = tanks.find((t) => t.index === v.index);
      if (!victimTank || !victimTank.kinematics.alive) continue;
      const kbMul = victimTank.getSkinStats().knockbackScale;
      applySafeTankKnockback(
        victimTank.kinematics,
        v.knockbackDx * kbMul,
        v.knockbackDy * kbMul,
        this.arena.walls,
      );
      onBarrelDamageTank(v.index, v.damage);
    }

    // Arm nearby TNT barrels for chain-reaction detonation!
    for (const chainId of impact.chainedBarrelIds) {
      const chained = this.entries.find((e) => e.state.id === chainId && e.state.active);
      if (chained && chained.state.fuseRemainingSec === null) {
        chained.state.fuseRemainingSec = 0.14;
      }
    }
  }

  syncVisuals(dt: number): void {
    this.animClock += dt;
    for (const e of this.entries) {
      if (!e.state.active) continue;
      if (e.state.fuseRemainingSec !== null) {
        const flash = Math.floor(this.animClock * 40) % 2 === 0;
        e.sprite.setTint(flash ? 0xffff8d : 0xff1744);
        e.sprite.setScale(((e.state.radius * 2) / 32) * 1.14);
        e.ring.setAlpha(0.95);
      } else {
        e.sprite.clearTint();
        const pulse = 1 + Math.sin(this.animClock * 4.5 + e.state.id) * 0.03;
        e.sprite.setScale(((e.state.radius * 2) / 32) * 0.98 * pulse);
        e.ring.setAlpha(0.32 + Math.sin(this.animClock * 4.5 + e.state.id) * 0.14);
      }
    }
  }

  getNetworkSnapshots(): NetBarrelSnapshot[] {
    return this.entries
      .filter((e) => e.state.active)
      .map((e) => ({
        id: e.state.id,
        x: e.state.x,
        y: e.state.y,
        radius: Math.round(e.state.radius * 10) / 10,
        blastRadius: Math.round(e.state.blastRadius * 10) / 10,
        fusing: e.state.fuseRemainingSec !== null,
      }));
  }

  applyNetworkSnapshots(snapshots: readonly NetBarrelSnapshot[]): void {
    const activeIds = new Set(snapshots.map((s) => s.id));
    for (let i = this.entries.length - 1; i >= 0; i--) {
      if (!activeIds.has(this.entries[i].state.id)) {
        this.entries[i].sprite.destroy();
        this.entries[i].ring.destroy();
        this.entries.splice(i, 1);
      }
    }
    for (const snap of snapshots) {
      const existing = this.entries.find((e) => e.state.id === snap.id);
      if (existing) {
        existing.state.x = snap.x;
        existing.state.y = snap.y;
        existing.state.active = true;
        existing.state.fuseRemainingSec = snap.fusing ? 0.1 : null;
        existing.sprite.setPosition(snap.x, snap.y).setVisible(true);
        existing.ring.setPosition(snap.x, snap.y).setVisible(true);
      } else {
        this.addVisualEntry({
          id: snap.id,
          x: snap.x,
          y: snap.y,
          radius: snap.radius,
          blastRadius: snap.blastRadius,
          active: true,
          fuseRemainingSec: snap.fusing ? 0.1 : null,
        });
      }
    }
  }

  clearAll(): void {
    for (const e of this.entries) {
      e.sprite.destroy();
      e.ring.destroy();
    }
    this.entries.length = 0;
  }

  destroy(): void {
    this.clearAll();
  }
}
