import Phaser from 'phaser';
import {
  ALL_SKILL_IDS,
  BASE_GAMEPLAY,
  getSkillDescriptor,
  POWERUP_CONFIG,
} from '../config/constants';
import type { Tank } from '../entities/Tank';
import { audioManager } from '../managers/AudioManager';
import { computeSafeMuzzleSpawn, resolveTankWallCollisions } from './CollisionSystem';
import type { EffectsSystem } from './EffectsSystem';
import { rebuildArenaWalls } from '../maps/MazeBuilder';
import { SeededRng } from './MazeSystem';
import {
  canPickupCrate,
  computeEmpBlastImpact,
  computeLaserBeam,
  computeReaperBlades,
  computeScatterAngles,
  computeWarpBlastVictims,
  createSpikeBurstPayload,
  deflectProjectilesAgainstShields,
  deployEnergyBarrierAhead,
  drillMazeWallAtPoint,
  ejectTankFromInteriorWalls,
  findBarriersHitByPolyline,
  findGroundSpikeVictims,
  findTanksInCryoZones,
  findTriggeredMines,
  incinerateProjectilesWithFlames,
  pickMysteryCrateCell,
  previewEnergyBarrierEdge,
  removeEnergyBarrierFromArena,
  rollWeightedSkill,
  steerHomingMissile,
  stepFlameThermodynamics,
  tryApplyCratePickup,
  type CryoZoneState,
  type EnergyBarrierState,
  type GroundSpikeZone,
  type MysteryCrateState,
  type ProximityMineState,
  type WarpBeaconState,
} from './PowerUpSim';
import type { ProjectileSystem } from './ProjectileSystem';
import type {
  NetBarrierSnapshot,
  NetCrateSnapshot,
  NetCryoZoneSnapshot,
  NetGameEvent,
  NetMineSnapshot,
  NetSpikeZoneSnapshot,
  NetWarpBeaconSnapshot,
} from '../network/PeerMultiplayerManager';
import type {
  BuiltArenaLayout,
  PlayerIndex,
  ProjectileHitEvent,
  ProjectileKinematics,
  RoundPhase,
  SkillId,
  TankKinematics,
  WallRect,
} from '../types/gameTypes';

interface CrateVisualEntry {
  state: MysteryCrateState;
  sprite: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Arc;
}

interface SpikeZoneVisualEntry {
  state: GroundSpikeZone;
  sprites: Phaser.GameObjects.Image[];
  warningRing: Phaser.GameObjects.Arc;
}

interface MineVisualEntry {
  state: ProximityMineState;
  sprite: Phaser.GameObjects.Image;
  armRing: Phaser.GameObjects.Arc;
}

interface CryoZoneVisualEntry {
  state: CryoZoneState;
  disc: Phaser.GameObjects.Arc;
}

interface WarpBeaconVisualEntry {
  state: WarpBeaconState;
  sprite: Phaser.GameObjects.Image;
  ring: Phaser.GameObjects.Arc;
}

interface ActiveEmpCataclysm {
  x: number;
  y: number;
  radius: number;
  age: number;
  duration: number;
}

interface ActiveWarpCataclysm {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  blastRadius: number;
  age: number;
  duration: number;
}

export class PowerUpSystem {
  private readonly scene: Phaser.Scene;
  private readonly arena: BuiltArenaLayout;
  private readonly projectileSystem: ProjectileSystem;
  private readonly effectsSystem: EffectsSystem;
  private readonly onWallsModified?: () => void;
  private readonly rng: SeededRng;

  private spawnIntervalSec: number;
  private maxCratesOnFloor: number;
  private enabledSkills: SkillId[];
  private spawnTimerSec: number;
  private nextEntityId = 1;
  private animClock = 0;
  private chargeFxAccumulator = 0;
  private missileTrailAccumulator = 0;
  private reaperSparkAccumulator = 0;
  private ghostTrailAccumulator = 0;
  private statusVfxAccumulator = 0;

  private readonly crates: CrateVisualEntry[] = [];
  private readonly spikeZones: SpikeZoneVisualEntry[] = [];
  private readonly mines: MineVisualEntry[] = [];
  private readonly cryoZones: CryoZoneVisualEntry[] = [];
  private readonly barriers: EnergyBarrierState[] = [];
  private readonly warpBeacons: WarpBeaconVisualEntry[] = [];
  private readonly pendingEmpBlasts: Array<{ x: number; y: number; ownerIndex: PlayerIndex }> = [];
  private readonly pendingWarpBlasts: Array<{ x: number; y: number; ownerIndex: PlayerIndex }> = [];
  private readonly activeEmpCataclysms: ActiveEmpCataclysm[] = [];
  private readonly activeWarpCataclysms: ActiveWarpCataclysm[] = [];
  private readonly zoneGraphics: Phaser.GameObjects.Graphics;
  private readonly barrierGraphics: Phaser.GameObjects.Graphics;
  private readonly holoGraphics: Phaser.GameObjects.Graphics;
  private readonly reticleGraphics: Phaser.GameObjects.Graphics;
  private readonly reaperShadowGraphics: Phaser.GameObjects.Graphics;
  private readonly reaperGraphics: Phaser.GameObjects.Graphics;
  private huntedTargetIndices = new Set<PlayerIndex>();
  private netEventSink?: (ev: NetGameEvent) => void;

  constructor(
    scene: Phaser.Scene,
    arena: BuiltArenaLayout,
    projectileSystem: ProjectileSystem,
    effectsSystem: EffectsSystem,
    seed: number,
    initialSpawnTimerSec: number = POWERUP_CONFIG.spawnIntervalSec,
    onWallsModified?: () => void,
    initialRules?: {
      spawnIntervalSec: number;
      maxCratesOnFloor: number;
      enabledSkills: readonly SkillId[];
    },
  ) {
    this.scene = scene;
    this.arena = arena;
    this.projectileSystem = projectileSystem;
    this.effectsSystem = effectsSystem;
    this.onWallsModified = onWallsModified;
    this.rng = new SeededRng(seed ^ 0x7f4a7c15);
    this.spawnIntervalSec = initialRules?.spawnIntervalSec ?? POWERUP_CONFIG.spawnIntervalSec;
    this.maxCratesOnFloor = initialRules?.maxCratesOnFloor ?? POWERUP_CONFIG.maxCratesOnFloor;
    this.enabledSkills = initialRules?.enabledSkills
      ? [...initialRules.enabledSkills]
      : [...ALL_SKILL_IDS];
    this.spawnTimerSec =
      this.spawnIntervalSec > 0 ? Math.max(0.5, Math.min(initialSpawnTimerSec, this.spawnIntervalSec)) : 0;

    this.zoneGraphics = scene.add.graphics().setDepth(5.8);
    this.barrierGraphics = scene.add.graphics().setDepth(11.5);
    this.holoGraphics = scene.add
      .graphics()
      .setDepth(21.5)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.reticleGraphics = scene.add.graphics().setDepth(22);
    this.reaperShadowGraphics = scene.add.graphics().setDepth(24);
    this.reaperGraphics = scene.add
      .graphics()
      .setDepth(25)
      .setBlendMode(Phaser.BlendModes.ADD);
  }

  applyLiveMatchRules(rules: {
    spawnIntervalSec: number;
    maxCratesOnFloor: number;
    enabledSkills: readonly SkillId[];
  }): void {
    const wasOff = this.spawnIntervalSec <= 0;
    this.spawnIntervalSec = rules.spawnIntervalSec;
    this.maxCratesOnFloor = Math.max(1, rules.maxCratesOnFloor);
    this.enabledSkills = [...rules.enabledSkills];

    if (this.spawnIntervalSec <= 0) {
      this.spawnTimerSec = 0;
    } else if (wasOff || this.spawnTimerSec <= 0 || this.spawnTimerSec > this.spawnIntervalSec) {
      this.spawnTimerSec = this.spawnIntervalSec;
    }
  }

  getSpawnIntervalSec(): number {
    return this.spawnIntervalSec;
  }

  getRemainingSpawnTimer(): number {
    return this.spawnTimerSec;
  }

  getCrateCount(): number {
    return this.crates.length;
  }

  getCrateStates(): ReadonlyArray<MysteryCrateState> {
    return this.crates.map((c) => c.state);
  }

  getSpikeZoneStates(): ReadonlyArray<GroundSpikeZone> {
    return this.spikeZones.map((z) => z.state);
  }

  getMineStates(): ReadonlyArray<ProximityMineState> {
    return this.mines.map((m) => m.state);
  }

  getCryoZoneStates(): ReadonlyArray<CryoZoneState> {
    return this.cryoZones.map((z) => z.state);
  }

  getBarrierStates(): ReadonlyArray<EnergyBarrierState> {
    return this.barriers;
  }

  getWarpBeaconStates(): ReadonlyArray<WarpBeaconState> {
    return this.warpBeacons.map((b) => b.state);
  }

  hasActiveEmpOrb(playerIndex: PlayerIndex): boolean {
    return this.projectileSystem.hasActiveVariantForPlayer(playerIndex, 'emp_orb');
  }

  getGroundHazardCount(): number {
    return this.spikeZones.length + this.mines.length + this.cryoZones.length;
  }

  getMineCount(): number {
    return this.mines.length;
  }

  setNetEventSink(sink?: (ev: NetGameEvent) => void): void {
    this.netEventSink = sink;
  }

  getNetworkWorldEntities(): {
    crates: NetCrateSnapshot[];
    mines: NetMineSnapshot[];
    spikeZones: NetSpikeZoneSnapshot[];
    cryoZones: NetCryoZoneSnapshot[];
    barriers: NetBarrierSnapshot[];
    warpBeacons: NetWarpBeaconSnapshot[];
  } {
    return {
      crates: this.crates.map((c) => ({
        id: c.state.id,
        x: Math.round(c.state.x * 10) / 10,
        y: Math.round(c.state.y * 10) / 10,
        radius: Math.round(c.state.radius * 10) / 10,
      })),
      mines: this.mines.map((m) => ({
        id: m.state.id,
        ownerIndex: m.state.ownerIndex,
        x: Math.round(m.state.x * 10) / 10,
        y: Math.round(m.state.y * 10) / 10,
        age: Math.round(m.state.age * 100) / 100,
        armingSec: m.state.armingSec,
        triggerRadius: Math.round(m.state.triggerRadius * 10) / 10,
      })),
      spikeZones: this.spikeZones.map((z) => ({
        id: z.state.id,
        x: Math.round(z.state.x * 10) / 10,
        y: Math.round(z.state.y * 10) / 10,
        age: Math.round(z.state.age * 100) / 100,
        duration: z.state.duration,
        nodes: z.state.nodes.map((n) => ({
          x: Math.round(n.x * 10) / 10,
          y: Math.round(n.y * 10) / 10,
          angle: Math.round(n.angle * 100) / 100,
        })),
      })),
      cryoZones: this.cryoZones.map((z) => ({
        id: z.state.id,
        ownerIndex: z.state.ownerIndex,
        x: Math.round(z.state.x * 10) / 10,
        y: Math.round(z.state.y * 10) / 10,
        radius: Math.round(z.state.radius * 10) / 10,
        age: Math.round(z.state.age * 100) / 100,
        duration: z.state.duration,
      })),
      barriers: this.barriers.map((b) => ({
        id: b.id,
        ownerIndex: b.ownerIndex,
        kind: b.kind,
        r: b.r,
        c: b.c,
        x0: Math.round(b.x0 * 10) / 10,
        y0: Math.round(b.y0 * 10) / 10,
        x1: Math.round(b.x1 * 10) / 10,
        y1: Math.round(b.y1 * 10) / 10,
        age: Math.round(b.age * 100) / 100,
        duration: b.duration,
      })),
      warpBeacons: this.warpBeacons.map((b) => ({
        id: b.state.id,
        ownerIndex: b.state.ownerIndex,
        x: Math.round(b.state.x * 10) / 10,
        y: Math.round(b.state.y * 10) / 10,
        age: Math.round(b.state.age * 100) / 100,
        maxDuration: b.state.maxDuration,
      })),
    };
  }

  applyNetworkWorldEntities(
    crates: readonly NetCrateSnapshot[],
    mines: readonly NetMineSnapshot[],
    spikeZones: readonly NetSpikeZoneSnapshot[],
    cryoZones: readonly NetCryoZoneSnapshot[] = [],
    barriers: readonly NetBarrierSnapshot[] = [],
    warpBeacons: readonly NetWarpBeaconSnapshot[] = [],
  ): void {
    const scale = this.arena.scaleRatio;

    // 1. Reconcile Crates
    const crateIds = new Set(crates.map((c) => c.id));
    for (let i = this.crates.length - 1; i >= 0; i--) {
      if (!crateIds.has(this.crates[i].state.id)) {
        this.crates[i].sprite.destroy();
        this.crates[i].ring.destroy();
        this.crates.splice(i, 1);
      }
    }
    for (const c of crates) {
      const existing = this.crates.find((e) => e.state.id === c.id);
      if (!existing) {
        const ring = this.scene.add
          .circle(c.x, c.y, c.radius * 1.45)
          .setStrokeStyle(2, 0xffb300, 0.55)
          .setFillStyle(0xffe082, 0.14)
          .setDepth(9);
        const sprite = this.scene.add
          .image(c.x, c.y, 'pickup_wood_crate')
          .setScale(scale * 0.72)
          .setDepth(11);
        this.crates.push({
          state: { id: c.id, col: 0, row: 0, x: c.x, y: c.y, radius: c.radius, spawnAge: 0 },
          sprite,
          ring,
        });
      }
    }

    // 2. Reconcile Mines
    const mineIds = new Set(mines.map((m) => m.id));
    for (let i = this.mines.length - 1; i >= 0; i--) {
      if (!mineIds.has(this.mines[i].state.id)) {
        this.mines[i].sprite.destroy();
        this.mines[i].armRing.destroy();
        this.mines.splice(i, 1);
      }
    }
    for (const m of mines) {
      const existing = this.mines.find((e) => e.state.id === m.id);
      if (existing) {
        existing.state.age = m.age;
      } else {
        const armRing = this.scene.add
          .circle(m.x, m.y, m.triggerRadius)
          .setStrokeStyle(1.6, 0xff1744, 0.55)
          .setFillStyle(0xff1744, 0.08)
          .setDepth(6);
        const sprite = this.scene.add
          .image(m.x, m.y, 'pickup_mine')
          .setScale(scale * 0.88)
          .setDepth(8);
        this.mines.push({
          state: {
            id: m.id,
            ownerIndex: m.ownerIndex,
            x: m.x,
            y: m.y,
            age: m.age,
            armingSec: m.armingSec,
            duration: POWERUP_CONFIG.mineDurationSec,
            triggerRadius: m.triggerRadius,
            blastRadius: POWERUP_CONFIG.mineBlastRadius * scale,
          },
          sprite,
          armRing,
        });
      }
    }

    // 3. Reconcile Ground Spike Zones
    const zoneIds = new Set(spikeZones.map((z) => z.id));
    for (let i = this.spikeZones.length - 1; i >= 0; i--) {
      if (!zoneIds.has(this.spikeZones[i].state.id)) {
        for (const sp of this.spikeZones[i].sprites) sp.destroy();
        this.spikeZones[i].warningRing.destroy();
        this.spikeZones.splice(i, 1);
      }
    }
    for (const z of spikeZones) {
      const existing = this.spikeZones.find((e) => e.state.id === z.id);
      if (existing) {
        existing.state.age = z.age;
      } else {
        const warningRing = this.scene.add
          .circle(z.x, z.y, POWERUP_CONFIG.spikeGroundRadius * scale)
          .setStrokeStyle(1.8, 0xd32f2f, 0.42)
          .setFillStyle(0xd32f2f, 0.07)
          .setDepth(6);
        const sprites = z.nodes.map((node) =>
          this.scene.add
            .image(node.x, node.y, 'decal_ground_spike')
            .setRotation(node.angle)
            .setScale(scale * 0.86)
            .setDepth(7),
        );
        this.spikeZones.push({
          state: {
            id: z.id,
            ownerIndex: 0,
            x: z.x,
            y: z.y,
            age: z.age,
            duration: z.duration,
            nodes: z.nodes.map((n) => ({
              x: n.x,
              y: n.y,
              radius: POWERUP_CONFIG.spikeGroundNodeRadius * scale,
              angle: n.angle,
            })),
          },
          sprites,
          warningRing,
        });
      }
    }

    // 4. Reconcile Cryo Ice Zones
    const cryoIds = new Set(cryoZones.map((z) => z.id));
    for (let i = this.cryoZones.length - 1; i >= 0; i--) {
      if (!cryoIds.has(this.cryoZones[i].state.id)) {
        this.cryoZones[i].disc.destroy();
        this.cryoZones.splice(i, 1);
      }
    }
    for (const z of cryoZones) {
      const existing = this.cryoZones.find((e) => e.state.id === z.id);
      if (existing) {
        existing.state.age = z.age;
      } else {
        const disc = this.scene.add
          .circle(z.x, z.y, z.radius, 0x072638, 0.56)
          .setStrokeStyle(3.0 * scale, 0x041824, 0.88)
          .setDepth(5.5);
        this.cryoZones.push({
          state: {
            id: z.id,
            ownerIndex: z.ownerIndex,
            x: z.x,
            y: z.y,
            radius: z.radius,
            age: z.age,
            duration: z.duration,
          },
          disc,
        });
      }
    }

    // 5. Reconcile Energy Force Barriers (syncing arena grid walls!)
    const barrierIds = new Set(barriers.map((b) => b.id));
    let wallsChanged = false;
    for (let i = this.barriers.length - 1; i >= 0; i--) {
      if (!barrierIds.has(this.barriers[i].id)) {
        removeEnergyBarrierFromArena(this.barriers[i], this.arena);
        this.barriers.splice(i, 1);
        wallsChanged = true;
      }
    }
    for (const b of barriers) {
      const existing = this.barriers.find((e) => e.id === b.id);
      if (existing) {
        existing.age = b.age;
      } else {
        if (b.kind === 'h' && this.arena.grid.hWalls[b.r]?.[b.c] !== undefined) {
          this.arena.grid.hWalls[b.r][b.c] = true;
        } else if (b.kind === 'v' && this.arena.grid.vWalls[b.r]?.[b.c] !== undefined) {
          this.arena.grid.vWalls[b.r][b.c] = true;
        }
        this.barriers.push({ ...b });
        wallsChanged = true;
      }
    }
    if (wallsChanged) {
      rebuildArenaWalls(this.arena);
      this.onWallsModified?.();
    }

    // 6. Reconcile Spatial Warp Beacons
    const beaconIds = new Set(warpBeacons.map((b) => b.id));
    for (let i = this.warpBeacons.length - 1; i >= 0; i--) {
      if (!beaconIds.has(this.warpBeacons[i].state.id)) {
        this.warpBeacons[i].sprite.destroy();
        this.warpBeacons[i].ring.destroy();
        this.warpBeacons.splice(i, 1);
      }
    }
    for (const b of warpBeacons) {
      const existing = this.warpBeacons.find((e) => e.state.id === b.id);
      if (existing) {
        existing.state.age = b.age;
      } else {
        const ring = this.scene.add
          .circle(b.x, b.y, 18 * scale)
          .setStrokeStyle(2.2 * scale, 0xe040fb, 0.78)
          .setFillStyle(0xea80fc, 0.14)
          .setDepth(6.5);
        const sprite = this.scene.add
          .image(b.x, b.y, 'pickup_warp_beacon')
          .setScale(scale * 0.85)
          .setDepth(8.5);
        this.warpBeacons.push({
          state: { ...b },
          sprite,
          ring,
        });
      }
    }
  }

  handleDrillWallImpact(proj: ProjectileKinematics, hitX: number, hitY: number): boolean {
    void proj;
    const res = drillMazeWallAtPoint(this.arena, hitX, hitY);
    if (res.carved) {
      audioManager.playWallDrill();
      this.effectsSystem.emitWallDrilled(res.breakX, res.breakY);
      this.onWallsModified?.();
      this.netEventSink?.({ kind: 'wall_drilled', hitX, hitY });
      return true;
    }
    return false;
  }

  spawnMysteryCrate(
    overridePos?: { x: number; y: number },
    forcedSkill?: SkillId,
    tanks: readonly TankKinematics[] = [],
  ): MysteryCrateState | null {
    const scale = this.arena.scaleRatio;
    let col = 0;
    let row = 0;
    let x = overridePos?.x ?? 0;
    let y = overridePos?.y ?? 0;

    if (!overridePos) {
      const picked = pickMysteryCrateCell(
        this.arena,
        tanks,
        this.crates.map((c) => c.state),
        this.spikeZones.map((z) => z.state),
        this.rng,
        this.maxCratesOnFloor,
      );
      if (!picked) return null;
      col = picked.col;
      row = picked.row;
      x = picked.x;
      y = picked.y;
    } else {
      col = Math.floor((x - this.arena.originX) / this.arena.cellSize);
      row = Math.floor((y - this.arena.originY) / this.arena.cellSize);
    }

    const state: MysteryCrateState & { forcedSkill?: SkillId } = {
      id: this.nextEntityId++,
      col,
      row,
      x,
      y,
      radius: POWERUP_CONFIG.crateRadius * scale,
      spawnAge: 0,
      forcedSkill,
    };

    const ring = this.scene.add
      .circle(x, y, state.radius * 1.45)
      .setStrokeStyle(2, 0xffb300, 0.55)
      .setFillStyle(0xffe082, 0.14)
      .setDepth(9);

    const sprite = this.scene.add
      .image(x, y, 'pickup_wood_crate')
      .setScale(scale * 0.2)
      .setDepth(11);

    this.scene.tweens.add({
      targets: sprite,
      scale: scale * 0.72,
      duration: 260,
      ease: 'Back.easeOut',
    });

    this.crates.push({ state, sprite, ring });
    audioManager.playCrateSpawn();
    this.effectsSystem.emitCrateSpawn(x, y);
    this.netEventSink?.({ kind: 'crate_fx', sub: 'spawn', x, y });
    return state;
  }

  tryHandlePlayerFire(
    tank: Tank,
    walls: readonly WallRect[],
    isHeldFire: boolean,
    consumeBufferedPress: () => boolean,
    allTanks: readonly Tank[] = [tank],
  ): { fired: boolean; hudDirty: boolean } {
    if (!tank.kinematics.alive) {
      return { fired: false, hudDirty: false };
    }

    // Remote Mid-Air Detonation for an active EMP Orb (`2nd BẮN press`!)
    if (!tank.isFrozen() && !tank.isEmpJammed() && this.hasActiveEmpOrb(tank.index)) {
      const empProj = this.projectileSystem
        .getPool()
        .find(
          (p) =>
            p.kinematics.active &&
            p.kinematics.ownerIndex === tank.index &&
            p.kinematics.variant === 'emp_orb' &&
            p.kinematics.age >= 0.08,
        );
      if (empProj && consumeBufferedPress()) {
        const bx = empProj.kinematics.x;
        const by = empProj.kinematics.y;
        empProj.deactivate();
        this.pendingEmpBlasts.push({ x: bx, y: by, ownerIndex: tank.index });
        return { fired: true, hudDirty: true };
      }
    }

    if (!tank.canFire()) {
      return { fired: false, hudDirty: false };
    }

    const skill = tank.getEquippedSkill();
    const scale = this.arena.scaleRatio;

    // 1. Standard Cannon (10 active shells max — also works while Aegis Shield is active!)
    if (!skill) {
      if (this.projectileSystem.getRemainingAmmo(tank.index) <= 0) {
        return { fired: false, hudDirty: false };
      }
      if (!consumeBufferedPress()) {
        return { fired: false, hudDirty: false };
      }
      const shot = this.projectileSystem.tryFireFromTank(tank, walls);
      if (shot.fired) {
        audioManager.playFire();
        this.effectsSystem.emitMuzzleFlash(shot.muzzleX, shot.muzzleY, tank.kinematics.angle);
        this.netEventSink?.({
          kind: 'muzzle_fx',
          variant: 'standard',
          x: shot.muzzleX,
          y: shot.muzzleY,
          angle: tank.kinematics.angle,
        });
        if (shot.immediateBounce) {
          audioManager.playWallBounce(1);
          this.effectsSystem.emitWallBounce(shot.muzzleX, shot.muzzleY);
        }
        return { fired: true, hudDirty: true };
      }
      return { fired: false, hudDirty: false };
    }

    // 2. Gatling (20 rapid-fire rounds with recoil impulse + barrel bloom!)
    if (skill === 'gatling') {
      const triggered = consumeBufferedPress() || isHeldFire;
      if (!triggered) return { fired: false, hudDirty: false };

      const radius =
        BASE_GAMEPLAY.projectileRadius * POWERUP_CONFIG.gatlingRadiusMultiplier * scale;
      const speed =
        BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.gatlingSpeedMultiplier * scale;
      const bloom = (this.rng.nextFloat() - 0.5) * 2 * POWERUP_CONFIG.gatlingSpreadRad;
      const shotAngle = tank.kinematics.angle + bloom;
      const spawn = computeSafeMuzzleSpawn(
        tank.kinematics.x,
        tank.kinematics.y,
        shotAngle,
        tank.getBarrelLength(),
        radius,
        speed,
        walls,
      );

      const proj = this.projectileSystem.spawnCustomProjectile({
        ownerIndex: tank.index,
        x: spawn.x,
        y: spawn.y,
        vx: spawn.vx,
        vy: spawn.vy,
        radius,
        maxLifetime: POWERUP_CONFIG.gatlingLifetimeSec,
        maxBounces: POWERUP_CONFIG.gatlingMaxBounces,
        graceTimer: spawn.immediateBounce ? 0 : BASE_GAMEPLAY.selfHitGraceSec * 0.75,
        variant: 'gatling',
        bounceBehavior: 'reflect',
      });
      if (!proj) return { fired: false, hudDirty: false };

      tank.triggerFireVisual(POWERUP_CONFIG.gatlingCooldownSec);
      tank.applyRecoilImpulse(POWERUP_CONFIG.gatlingRecoilImpulse * scale);
      audioManager.playGatlingFire();
      this.effectsSystem.emitGatlingMuzzle(spawn.x, spawn.y, shotAngle);
      if (spawn.immediateBounce) {
        audioManager.playWallBounce(1);
        this.effectsSystem.emitWallBounce(spawn.x, spawn.y);
      }

      const { depleted } = tank.consumeSkillAmmo(1);
      if (depleted) {
        this.effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
      }
      return { fired: true, hudDirty: true };
    }

    // 3. Flame (80 dense double-plume dragon-fire bursts — long corridor reach!)
    if (skill === 'flame') {
      const triggered = consumeBufferedPress() || isHeldFire;
      if (!triggered) return { fired: false, hudDirty: false };

      const startR = POWERUP_CONFIG.flameStartRadius * scale;
      let spawnedAny = false;
      let muzzleX = tank.kinematics.x;
      let muzzleY = tank.kinematics.y;

      // Spawn 3 staggered fluid-jet parcels per fuel tick (1 tight laminar core + 2 billowing turbulent tongues)
      // inheriting 42% of the tank's linear velocity so sweeping & driving whips the flame stream physically!
      for (let layer = 0; layer < 3; layer++) {
        const isCore = layer === 0;
        const speedMul = isCore ? 1.07 : 0.82 + this.rng.nextFloat() * 0.24;
        const speed =
          BASE_GAMEPLAY.projectileSpeed *
          POWERUP_CONFIG.flameSpeedMultiplier *
          scale *
          speedMul;
        const spreadScale = isCore ? 0.38 : 1.18;
        const spread =
          (this.rng.nextFloat() - 0.5) * 2 * POWERUP_CONFIG.flameSpreadRad * spreadScale;
        const fireAngle = tank.kinematics.angle + spread;

        const spawn = computeSafeMuzzleSpawn(
          tank.kinematics.x,
          tank.kinematics.y,
          fireAngle,
          tank.getBarrelLength() * 0.92,
          startR,
          speed,
          walls,
        );
        muzzleX = spawn.x;
        muzzleY = spawn.y;

        const proj = this.projectileSystem.spawnCustomProjectile({
          ownerIndex: tank.index,
          x: spawn.x,
          y: spawn.y,
          vx: spawn.vx + tank.kinematics.vx * 0.42,
          vy: spawn.vy + tank.kinematics.vy * 0.42,
          radius: startR * (isCore ? 0.88 : 1.14),
          maxLifetime: POWERUP_CONFIG.flameLifetimeSec * (isCore ? 1.02 : 0.84 + layer * 0.06),
          maxBounces: 5,
          graceTimer: 0.28,
          variant: 'flame',
          bounceBehavior: 'slide',
        });
        if (proj) spawnedAny = true;
      }

      if (!spawnedAny) return { fired: false, hudDirty: false };

      tank.triggerFireVisual(POWERUP_CONFIG.flameCooldownSec);
      tank.applyRecoilImpulse(3.2 * scale);
      audioManager.playFlameSpray();
      this.effectsSystem.emitFlameMuzzle(muzzleX, muzzleY, tank.kinematics.angle);
      this.netEventSink?.({
        kind: 'muzzle_fx',
        variant: 'flame',
        x: muzzleX,
        y: muzzleY,
        angle: tank.kinematics.angle,
      });
      const { depleted } = tank.consumeSkillAmmo(1);
      if (depleted) {
        this.effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
      }
      return { fired: true, hudDirty: true };
    }

    // Remaining discrete-trigger skills require a buffered fire press
    if (!consumeBufferedPress()) {
      return { fired: false, hudDirty: false };
    }

    // 4. Scatter (3 broadsides × 5 fan pellets + recoil kick!)
    if (skill === 'scatter') {
      const radius =
        BASE_GAMEPLAY.projectileRadius * POWERUP_CONFIG.scatterRadiusMultiplier * scale;
      const speed =
        BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.scatterSpeedMultiplier * scale;
      const angles = computeScatterAngles(tank.kinematics.angle);

      let muzzleX = tank.kinematics.x;
      let muzzleY = tank.kinematics.y;
      for (const ang of angles) {
        const spawn = computeSafeMuzzleSpawn(
          tank.kinematics.x,
          tank.kinematics.y,
          ang,
          tank.getBarrelLength(),
          radius,
          speed,
          walls,
        );
        muzzleX = spawn.x;
        muzzleY = spawn.y;
        this.projectileSystem.spawnCustomProjectile({
          ownerIndex: tank.index,
          x: spawn.x,
          y: spawn.y,
          vx: spawn.vx,
          vy: spawn.vy,
          radius,
          maxLifetime: POWERUP_CONFIG.scatterLifetimeSec,
          maxBounces: POWERUP_CONFIG.scatterMaxBounces,
          graceTimer: spawn.immediateBounce ? 0 : BASE_GAMEPLAY.selfHitGraceSec,
          variant: 'scatter',
          bounceBehavior: 'reflect',
        });
      }

      tank.triggerFireVisual(POWERUP_CONFIG.scatterCooldownSec);
      tank.applyRecoilImpulse(POWERUP_CONFIG.scatterRecoilImpulse * scale);
      audioManager.playScatterShot();
      this.effectsSystem.emitScatterMuzzle(muzzleX, muzzleY, tank.kinematics.angle);

      const { depleted } = tank.consumeSkillAmmo(1);
      if (depleted) {
        this.effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
      }
      return { fired: true, hudDirty: true };
    }

    // 5. Mine (3 stealth proximity mines laid behind tank)
    if (skill === 'mine') {
      const rearDist = tank.kinematics.radius + 9 * scale;
      const mineDummy: TankKinematics = {
        index: tank.index,
        x: tank.kinematics.x - Math.cos(tank.kinematics.angle) * rearDist,
        y: tank.kinematics.y - Math.sin(tank.kinematics.angle) * rearDist,
        vx: 0,
        vy: 0,
        angle: 0,
        radius: 8 * scale,
        alive: true,
      };
      resolveTankWallCollisions(mineDummy, walls);

      const mineState: ProximityMineState = {
        id: this.nextEntityId++,
        ownerIndex: tank.index,
        x: mineDummy.x,
        y: mineDummy.y,
        age: 0,
        armingSec: POWERUP_CONFIG.mineArmingSec,
        duration: POWERUP_CONFIG.mineDurationSec,
        triggerRadius: POWERUP_CONFIG.mineTriggerRadius * scale,
        blastRadius: POWERUP_CONFIG.mineBlastRadius * scale,
      };

      const armRing = this.scene.add
        .circle(mineState.x, mineState.y, mineState.triggerRadius)
        .setStrokeStyle(1.6, 0xff1744, 0.55)
        .setFillStyle(0xff1744, 0.08)
        .setDepth(6);

      const sprite = this.scene.add
        .image(mineState.x, mineState.y, 'pickup_mine')
        .setScale(scale * 0.88)
        .setDepth(8);

      this.mines.push({ state: mineState, sprite, armRing });
      tank.triggerFireVisual(POWERUP_CONFIG.mineCooldownSec);
      audioManager.playMineDeploy();
      this.effectsSystem.emitMineDeploy(mineState.x, mineState.y);

      const { depleted } = tank.consumeSkillAmmo(1);
      if (depleted) {
        this.effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
      }
      return { fired: true, hudDirty: true };
    }

    // 6. Drill (2 seismic wall-carving drills)
    if (skill === 'drill') {
      const radius =
        BASE_GAMEPLAY.projectileRadius * POWERUP_CONFIG.drillRadiusMultiplier * scale;
      const speed =
        BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.drillSpeedMultiplier * scale;
      const baseX = tank.kinematics.x + Math.cos(tank.kinematics.angle) * (tank.getBarrelLength() * 0.85);
      const baseY = tank.kinematics.y + Math.sin(tank.kinematics.angle) * (tank.getBarrelLength() * 0.85);

      const proj = this.projectileSystem.spawnCustomProjectile({
        ownerIndex: tank.index,
        x: baseX,
        y: baseY,
        vx: Math.cos(tank.kinematics.angle) * speed,
        vy: Math.sin(tank.kinematics.angle) * speed,
        radius,
        maxLifetime: POWERUP_CONFIG.drillLifetimeSec,
        maxBounces: 20,
        graceTimer: BASE_GAMEPLAY.selfHitGraceSec,
        variant: 'drill',
        bounceBehavior: 'drill',
        drillsLeft: POWERUP_CONFIG.drillWallsPerShot,
      });
      if (!proj) return { fired: false, hudDirty: false };

      tank.triggerFireVisual(POWERUP_CONFIG.drillCooldownSec);
      audioManager.playWallDrill();
      this.effectsSystem.emitMuzzleFlash(baseX, baseY, tank.kinematics.angle);

      const { depleted } = tank.consumeSkillAmmo(1);
      if (depleted) {
        this.effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
      }
      return { fired: true, hudDirty: true };
    }

    // 7. Shield (5.5s Aegis Forcefield deflecting bullets & blocking beams!)
    if (skill === 'shield') {
      tank.activateShield(POWERUP_CONFIG.shieldDurationSec);
      audioManager.playShieldActivate();
      this.effectsSystem.emitShieldActivate(tank.kinematics.x, tank.kinematics.y);
      return { fired: true, hudDirty: true };
    }

    // 8. Reaper (4-Stage Gyro Spin -> Laser Shaft -> Sideways Crescent Unfurl -> 180-deg Sweep!)
    if (skill === 'reaper') {
      const randomExtraSpin = (0.35 + this.rng.nextFloat() * 1.55) * Math.PI;
      tank.startReaperSweep(randomExtraSpin);
      audioManager.playReaperActivate();
      return { fired: true, hudDirty: true };
    }

    // 9. Laser (2.0s movement/rotation lock charge -> cross-map parabolic blast)
    if (skill === 'laser') {
      tank.startLaserCharge(POWERUP_CONFIG.laserChargeSec);
      audioManager.playLaserCharge(POWERUP_CONFIG.laserChargeSec);
      return { fired: true, hudDirty: true };
    }

    // 10. Spike Shell (3.0s bounce -> 16 radial spikes + 5.0s ground trap)
    if (skill === 'spike') {
      const radius =
        BASE_GAMEPLAY.projectileRadius * POWERUP_CONFIG.spikeRadiusMultiplier * scale;
      const speed =
        BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.spikeSpeedMultiplier * scale;
      const spawn = computeSafeMuzzleSpawn(
        tank.kinematics.x,
        tank.kinematics.y,
        tank.kinematics.angle,
        tank.getBarrelLength(),
        radius,
        speed,
        walls,
      );

      const proj = this.projectileSystem.spawnCustomProjectile({
        ownerIndex: tank.index,
        x: spawn.x,
        y: spawn.y,
        vx: spawn.vx,
        vy: spawn.vy,
        radius,
        maxLifetime: POWERUP_CONFIG.spikeFlightDetonateSec + 0.25,
        maxBounces: 48,
        graceTimer: spawn.immediateBounce ? 0 : BASE_GAMEPLAY.selfHitGraceSec,
        variant: 'spike_ball',
        bounceBehavior: 'reflect',
      });
      if (!proj) return { fired: false, hudDirty: false };

      tank.triggerFireVisual();
      tank.consumeSkillAmmo(1);
      this.effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
      audioManager.playFire();
      this.effectsSystem.emitMuzzleFlash(spawn.x, spawn.y, tank.kinematics.angle);
      return { fired: true, hudDirty: true };
    }

    // 11. Homing Missile (2.5s bounce -> shortest-path maze seeker!)
    if (skill === 'homing') {
      const radius =
        BASE_GAMEPLAY.projectileRadius * POWERUP_CONFIG.homingRadiusMultiplier * scale;
      const speed =
        BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.homingBallisticSpeedMultiplier * scale;
      const spawn = computeSafeMuzzleSpawn(
        tank.kinematics.x,
        tank.kinematics.y,
        tank.kinematics.angle,
        tank.getBarrelLength(),
        radius,
        speed,
        walls,
      );

      const proj = this.projectileSystem.spawnCustomProjectile({
        ownerIndex: tank.index,
        x: spawn.x,
        y: spawn.y,
        vx: spawn.vx,
        vy: spawn.vy,
        radius,
        maxLifetime: POWERUP_CONFIG.homingTotalLifetimeSec,
        maxBounces: 24,
        graceTimer: spawn.immediateBounce ? 0 : BASE_GAMEPLAY.selfHitGraceSec,
        variant: 'homing_missile',
        bounceBehavior: 'reflect',
      });
      if (!proj) return { fired: false, hudDirty: false };

      tank.triggerFireVisual();
      tank.consumeSkillAmmo(1);
      this.effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
      audioManager.playFire();
      this.effectsSystem.emitMuzzleFlash(spawn.x, spawn.y, tank.kinematics.angle);
      return { fired: true, hudDirty: true };
    }

    // 12. EMP Grenade (`Lựu Đạn Xung Điện EMP` — 1 bouncing orb, press 2nd time or wait 2.0s to detonate!)
    if (skill === 'emp') {
      const radius =
        BASE_GAMEPLAY.projectileRadius * POWERUP_CONFIG.empOrbRadiusMultiplier * scale;
      const speed =
        BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.empOrbSpeedMultiplier * scale;
      const spawn = computeSafeMuzzleSpawn(
        tank.kinematics.x,
        tank.kinematics.y,
        tank.kinematics.angle,
        tank.getBarrelLength(),
        radius,
        speed,
        walls,
      );

      const proj = this.projectileSystem.spawnCustomProjectile({
        ownerIndex: tank.index,
        x: spawn.x,
        y: spawn.y,
        vx: spawn.vx,
        vy: spawn.vy,
        radius,
        maxLifetime: POWERUP_CONFIG.empFlightDetonateSec,
        maxBounces: POWERUP_CONFIG.empOrbMaxBounces,
        graceTimer: BASE_GAMEPLAY.selfHitGraceSec,
        variant: 'emp_orb',
        bounceBehavior: 'reflect',
      });
      if (!proj) return { fired: false, hudDirty: false };

      tank.triggerFireVisual(0.1);
      tank.consumeSkillAmmo(1);
      audioManager.playEmpLaunch();
      this.effectsSystem.emitEmpMuzzle(spawn.x, spawn.y, tank.kinematics.angle);
      this.netEventSink?.({
        kind: 'muzzle_fx',
        variant: 'emp_orb',
        x: spawn.x,
        y: spawn.y,
        angle: tank.kinematics.angle,
      });
      return { fired: true, hudDirty: true };
    }

    // 13. Phantom Phase (`Giáp Bóng Ma Xuyên Tường` — 3.5s interior wall phase + +20% speed + standard cannon!)
    if (skill === 'phantom') {
      tank.activatePhantom(POWERUP_CONFIG.phantomDurationSec);
      audioManager.playPhantomActivate();
      this.effectsSystem.emitPhantomActivate(tank.kinematics.x, tank.kinematics.y);
      this.netEventSink?.({
        kind: 'hazard_fx',
        sub: 'phantom_activate',
        x: tank.kinematics.x,
        y: tank.kinematics.y,
      });
      return { fired: true, hudDirty: true };
    }

    // 14. Cryo Cannon (`Pháo Đóng Băng` — 2 bouncing cryo orbs -> direct freeze + 6s slippery ice zone!)
    if (skill === 'cryo') {
      const radius =
        BASE_GAMEPLAY.projectileRadius * POWERUP_CONFIG.cryoOrbRadiusMultiplier * scale;
      const speed =
        BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.cryoOrbSpeedMultiplier * scale;
      const spawn = computeSafeMuzzleSpawn(
        tank.kinematics.x,
        tank.kinematics.y,
        tank.kinematics.angle,
        tank.getBarrelLength(),
        radius,
        speed,
        walls,
      );

      const proj = this.projectileSystem.spawnCustomProjectile({
        ownerIndex: tank.index,
        x: spawn.x,
        y: spawn.y,
        vx: spawn.vx,
        vy: spawn.vy,
        radius,
        maxLifetime: POWERUP_CONFIG.cryoOrbLifetimeSec,
        maxBounces: POWERUP_CONFIG.cryoOrbMaxBounces,
        graceTimer: BASE_GAMEPLAY.selfHitGraceSec,
        variant: 'cryo_orb',
        bounceBehavior: 'reflect',
      });
      if (!proj) return { fired: false, hudDirty: false };

      tank.triggerFireVisual(POWERUP_CONFIG.cryoCooldownSec);
      audioManager.playCryoShot();
      this.effectsSystem.emitCryoMuzzle(spawn.x, spawn.y, tank.kinematics.angle);
      this.netEventSink?.({
        kind: 'muzzle_fx',
        variant: 'cryo_orb',
        x: spawn.x,
        y: spawn.y,
        angle: tank.kinematics.angle,
      });

      const { depleted } = tank.consumeSkillAmmo(1);
      if (depleted) {
        this.effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
      }
      return { fired: true, hudDirty: true };
    }

    // 15. Energy Barrier (`Súng Xây Tường Năng Lượng` — 3 deployable 8.0s maze force-walls!)
    if (skill === 'barrier') {
      const barrier = deployEnergyBarrierAhead(
        tank.kinematics,
        this.arena,
        allTanks.map((t) => t.kinematics),
        this.nextEntityId++,
        POWERUP_CONFIG.barrierDurationSec,
      );
      if (!barrier) {
        return { fired: false, hudDirty: false };
      }

      this.barriers.push(barrier);
      this.onWallsModified?.();
      tank.triggerFireVisual(POWERUP_CONFIG.barrierCooldownSec);
      audioManager.playBarrierDeploy();
      this.effectsSystem.emitBarrierDeploy(barrier.x0, barrier.y0, barrier.x1, barrier.y1);
      this.netEventSink?.({
        kind: 'hazard_fx',
        sub: 'barrier_deploy',
        x: barrier.x0,
        y: barrier.y0,
        x2: barrier.x1,
        y2: barrier.y1,
      });

      const { depleted } = tank.consumeSkillAmmo(1);
      if (depleted) {
        this.effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
      }
      return { fired: true, hudDirty: true };
    }

    // 16. Spatial Warp Beacon (`Mỏ Neo Không Gian` — 1st press plants beacon, 2nd press teleports + rift blast!)
    if (skill === 'warp') {
      const existingIdx = this.warpBeacons.findIndex(
        (b) => b.state.ownerIndex === tank.index,
      );

      if (!tank.isWarpBeaconPlaced() || existingIdx < 0) {
        if (existingIdx >= 0) {
          this.warpBeacons[existingIdx].sprite.destroy();
          this.warpBeacons[existingIdx].ring.destroy();
          this.warpBeacons.splice(existingIdx, 1);
        }
        const bx = tank.kinematics.x;
        const by = tank.kinematics.y;
        const ring = this.scene.add
          .circle(bx, by, 18 * scale)
          .setStrokeStyle(2.2 * scale, 0xe040fb, 0.78)
          .setFillStyle(0xea80fc, 0.14)
          .setDepth(6.5);
        const sprite = this.scene.add
          .image(bx, by, 'pickup_warp_beacon')
          .setScale(scale * 0.85)
          .setDepth(8.5);
        this.warpBeacons.push({
          state: {
            id: this.nextEntityId++,
            ownerIndex: tank.index,
            x: bx,
            y: by,
            age: 0,
            maxDuration: POWERUP_CONFIG.warpBeaconDurationSec,
          },
          sprite,
          ring,
        });
        tank.setWarpBeaconPlaced(true);
        tank.triggerFireVisual(0.24);
        audioManager.playWarpBeacon();
        this.effectsSystem.emitWarpBeaconPlant(bx, by);
        this.netEventSink?.({ kind: 'hazard_fx', sub: 'warp_plant', x: bx, y: by });
        return { fired: true, hudDirty: true };
      }

      const beaconEntry = this.warpBeacons[existingIdx];
      const fromX = tank.kinematics.x;
      const fromY = tank.kinematics.y;
      const toX = beaconEntry.state.x;
      const toY = beaconEntry.state.y;
      const blastR = POWERUP_CONFIG.warpBlastRadius * scale;

      beaconEntry.sprite.destroy();
      beaconEntry.ring.destroy();
      this.warpBeacons.splice(existingIdx, 1);

      tank.kinematics.x = toX;
      tank.kinematics.y = toY;
      tank.kinematics.vx = 0;
      tank.kinematics.vy = 0;
      ejectTankFromInteriorWalls(tank.kinematics, this.arena);
      tank.triggerFireVisual(0.2);
      tank.clearSkill();

      audioManager.playWarpTeleport();
      this.effectsSystem.emitWarpTeleport(fromX, fromY, toX, toY, blastR);
      this.triggerWarpCataclysmVisual(fromX, fromY, toX, toY, blastR);
      this.netEventSink?.({
        kind: 'hazard_fx',
        sub: 'warp_teleport',
        x: fromX,
        y: fromY,
        x2: toX,
        y2: toY,
        radius: blastR,
      });
      this.pendingWarpBlasts.push({ x: fromX, y: fromY, ownerIndex: tank.index });
      return { fired: true, hudDirty: true };
    }

    return { fired: false, hudDirty: false };
  }

  checkBarrierBounceRipple(worldX: number, worldY: number): void {
    if (this.barriers.length === 0) return;
    const maxDist = 14 * this.arena.scaleRatio;
    for (const b of this.barriers) {
      const dx = b.x1 - b.x0;
      const dy = b.y1 - b.y0;
      const lenSq = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((worldX - b.x0) * dx + (worldY - b.y0) * dy) / lenSq));
      const px = b.x0 + dx * t;
      const py = b.y0 + dy * t;
      if (Math.hypot(worldX - px, worldY - py) <= maxDist) {
        this.effectsSystem.emitBarrierImpactRipple(worldX, worldY);
        return;
      }
    }
  }

  handleProjectileExpired(
    x: number,
    y: number,
    variant: ProjectileKinematics['variant'],
    ownerIndex: PlayerIndex,
  ): void {
    if (variant === 'cryo_orb') {
      this.spawnCryoZone(x, y, ownerIndex);
    } else if (variant === 'emp_orb') {
      this.pendingEmpBlasts.push({ x, y, ownerIndex });
    }
  }

  triggerEmpCataclysmVisual(x: number, y: number, radius: number): void {
    this.activeEmpCataclysms.push({
      x,
      y,
      radius,
      age: 0,
      duration: 0.88,
    });
  }

  triggerWarpCataclysmVisual(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    blastRadius: number,
  ): void {
    this.activeWarpCataclysms.push({
      fromX,
      fromY,
      toX,
      toY,
      blastRadius,
      age: 0,
      duration: 0.82,
    });
  }

  private spawnCryoZone(cx: number, cy: number, ownerIndex: PlayerIndex): void {
    const scale = this.arena.scaleRatio;
    const zoneR = this.arena.cellSize * POWERUP_CONFIG.cryoZoneCellsRadius;
    audioManager.playCryoShatter();
    this.effectsSystem.emitCryoShatter(cx, cy, zoneR);
    this.netEventSink?.({
      kind: 'hazard_fx',
      sub: 'cryo_shatter',
      x: cx,
      y: cy,
      radius: zoneR,
    });

    const disc = this.scene.add
      .circle(cx, cy, zoneR, 0x072638, 0.56)
      .setStrokeStyle(3.0 * scale, 0x041824, 0.88)
      .setDepth(5.5);
    this.cryoZones.push({
      state: {
        id: this.nextEntityId++,
        ownerIndex,
        x: cx,
        y: cy,
        radius: zoneR,
        age: 0,
        duration: POWERUP_CONFIG.cryoZoneDurationSec,
      },
      disc,
    });
  }

  private executeEmpBlast(
    cx: number,
    cy: number,
    ownerIndex: PlayerIndex,
    tanks: readonly Tank[],
    onSkillHitTank: (victim: Tank, source: 'emp_blast') => void,
  ): boolean {
    let hudDirty = false;
    const blastR = this.arena.cellSize * POWERUP_CONFIG.empBlastCellsRadius;
    audioManager.playEmpBlast();
    this.effectsSystem.emitEmpBlast(cx, cy, blastR);
    this.triggerEmpCataclysmVisual(cx, cy, blastR);
    this.netEventSink?.({
      kind: 'hazard_fx',
      sub: 'emp_blast',
      x: cx,
      y: cy,
      radius: blastR,
    });

    const impact = computeEmpBlastImpact(
      cx,
      cy,
      blastR,
      ownerIndex,
      tanks.map((t) => t.kinematics),
      this.mines.map((m) => m.state),
      this.barriers,
    );

    if (impact.clearedMineIds.length > 0) {
      const clearSet = new Set(impact.clearedMineIds);
      for (let i = this.mines.length - 1; i >= 0; i--) {
        if (clearSet.has(this.mines[i].state.id)) {
          this.effectsSystem.emitBulletIncinerated(
            this.mines[i].state.x,
            this.mines[i].state.y,
          );
          this.mines[i].sprite.destroy();
          this.mines[i].armRing.destroy();
          this.mines.splice(i, 1);
        }
      }
    }

    if (impact.clearedBarrierIds.length > 0) {
      const clearBarriers = new Set(impact.clearedBarrierIds);
      let modified = false;
      for (let i = this.barriers.length - 1; i >= 0; i--) {
        if (clearBarriers.has(this.barriers[i].id)) {
          const b = this.barriers[i];
          this.effectsSystem.emitBarrierShatter(b.x0, b.y0, b.x1, b.y1);
          removeEnergyBarrierFromArena(b, this.arena);
          this.barriers.splice(i, 1);
          modified = true;
        }
      }
      if (modified) this.onWallsModified?.();
    }

    for (const vIdx of impact.hitEnemyIndices) {
      const victim = tanks.find((t) => t.index === vIdx);
      if (!victim || !victim.kinematics.alive) continue;
      const jamRes = victim.applyEmpJam(POWERUP_CONFIG.empJamDurationSec);
      if (jamRes.brokeShield || jamRes.interruptedChannel) {
        this.effectsSystem.emitSuitRevert(victim.kinematics.x, victim.kinematics.y);
      }
      onSkillHitTank(victim, 'emp_blast');
      hudDirty = true;
    }

    const shooter = tanks.find((t) => t.index === ownerIndex);
    if (shooter && !shooter.getEquippedSkill()) {
      this.effectsSystem.emitSuitRevert(shooter.kinematics.x, shooter.kinematics.y);
      hudDirty = true;
    }

    return hudDirty;
  }

  preProjectileSubStep(
    subDt: number,
    tanks: readonly Tank[],
    phase: RoundPhase,
    onSkillHitTank: (
      victim: Tank,
      source: 'laser' | 'reaper' | 'emp_blast' | 'warp_blast',
    ) => void,
    onLaserBeamFired?: (points: Array<{ x: number; y: number }>) => void,
  ): { hudDirty: boolean } {
    let hudDirty = false;
    const scale = this.arena.scaleRatio;
    const tankKinematics = tanks.map((t) => t.kinematics);
    const shieldedIndices = new Set<PlayerIndex>(
      tanks.filter((t) => t.isShielded()).map((t) => t.index),
    );

    // 1. Spawn Mystery Wooden Crate according to live match rules (0 = OFF)
    if (phase === 'playing' && this.spawnIntervalSec > 0 && this.enabledSkills.length > 0) {
      this.spawnTimerSec -= subDt;
      if (this.spawnTimerSec <= 0) {
        this.spawnTimerSec += this.spawnIntervalSec;
        this.spawnMysteryCrate(undefined, undefined, tankKinematics);
      }
    }

    // 2. Deflect projectiles off active Aegis Shields + step Flame thermodynamics & bullet incineration!
    const kinematicsList = this.projectileSystem.getKinematicsList();
    if (shieldedIndices.size > 0) {
      const deflections = deflectProjectilesAgainstShields(
        kinematicsList,
        tankKinematics,
        shieldedIndices,
        scale,
      );
      for (const d of deflections) {
        audioManager.playShieldDeflect();
        this.effectsSystem.emitShieldDeflect(d.x, d.y);
      }
    }

    stepFlameThermodynamics(kinematicsList, subDt, scale);
    const burned = incinerateProjectilesWithFlames(kinematicsList);
    for (const b of burned) {
      this.effectsSystem.emitBulletIncinerated(b.x, b.y);
    }

    // 3. Laser 2.0s charge FX & cross-map parabolic discharge
    this.chargeFxAccumulator += subDt;
    const emitChargeParticle = this.chargeFxAccumulator >= 0.055;
    if (emitChargeParticle) this.chargeFxAccumulator = 0;

    for (const tank of tanks) {
      if (!tank.kinematics.alive) continue;
      const chargeProg = tank.getLaserChargeProgress();
      if (chargeProg !== null && emitChargeParticle) {
        const muzzle = tank.getMuzzleWorldPos();
        this.effectsSystem.emitLaserChargeTick(muzzle.x, muzzle.y, chargeProg);
      }

      if (tank.consumeReadyLaserDischarge()) {
        const muzzle = tank.getMuzzleWorldPos();
        const beam = computeLaserBeam(
          muzzle.x,
          muzzle.y,
          tank.kinematics.angle,
          tank.index,
          tankKinematics,
          this.arena,
        );
        const victimCoords = beam.hitVictimIndices
          .map((vIdx) => tanks.find((t) => t.index === vIdx))
          .filter((v): v is Tank => Boolean(v && v.kinematics.alive))
          .map((v) => ({ x: v.kinematics.x, y: v.kinematics.y }));
        audioManager.playLaserBlast();
        this.effectsSystem.emitLaserBeamBlast(beam.points, victimCoords);
        onLaserBeamFired?.(beam.points);
        if (this.barriers.length > 0) {
          const hitBarriers = findBarriersHitByPolyline(
            beam.points,
            POWERUP_CONFIG.laserBeamHalfWidth * scale,
            this.barriers,
          );
          if (hitBarriers.length > 0) {
            const hitSet = new Set(hitBarriers);
            for (let i = this.barriers.length - 1; i >= 0; i--) {
              if (hitSet.has(this.barriers[i].id)) {
                const b = this.barriers[i];
                this.effectsSystem.emitBarrierShatter(b.x0, b.y0, b.x1, b.y1);
                removeEnergyBarrierFromArena(b, this.arena);
                this.barriers.splice(i, 1);
              }
            }
            this.onWallsModified?.();
          }
        }
        this.netEventSink?.({
          kind: 'laser_blast',
          points: beam.points,
          victims: victimCoords,
        });
        tank.triggerFireVisual(0.22);
        tank.clearSkill();
        this.effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
        hudDirty = true;

        for (const vIdx of beam.hitVictimIndices) {
          const victim = tanks.find((t) => t.index === vIdx);
          if (!victim || !victim.kinematics.alive) continue;
          if (shieldedIndices.has(vIdx)) {
            audioManager.playShieldDeflect();
            this.effectsSystem.emitShieldDeflect(victim.kinematics.x, victim.kinematics.y);
          } else {
            onSkillHitTank(victim, 'laser');
          }
        }
      }
    }

    // 4. Reaper 360-deg Twin Crescent Plasma Scythe windup, unfurl & sweep!
    this.reaperSparkAccumulator += subDt;
    const emitReaperSparks = this.reaperSparkAccumulator >= 0.045;
    if (emitReaperSparks) this.reaperSparkAccumulator = 0;

    for (const tank of tanks) {
      if (!tank.kinematics.alive) continue;

      const windupProg = tank.getReaperWindupProgress();
      if (windupProg !== null && emitReaperSparks) {
        this.effectsSystem.emitReaperWindupTick(
          tank.kinematics.x,
          tank.kinematics.y,
          windupProg,
        );
      }

      if (tank.consumeReaperShaftLaunchEvent()) {
        audioManager.playLaserBlast();
        this.effectsSystem.emitReaperUnfurlBurst(tank.kinematics.x, tank.kinematics.y);
      }

      if (!tank.isReaperSweeping()) continue;
      const extend = tank.getReaperExtendProgress();
      const crescentExtend = tank.getReaperCrescentProgress();
      const bladeLen =
        this.arena.cellSize * POWERUP_CONFIG.reaperBladeCellsLength * extend;
      const sweep = computeReaperBlades(
        tank.kinematics.x,
        tank.kinematics.y,
        tank.kinematics.angle,
        tank.index,
        bladeLen,
        tankKinematics,
        scale,
        crescentExtend,
      );

      if (tank.consumeReaperUnfurlEvent()) {
        audioManager.playSpikeBurst();
        this.effectsSystem.emitReaperUnfurlBurst(sweep.bladeA.x1, sweep.bladeA.y1);
        this.effectsSystem.emitReaperUnfurlBurst(sweep.bladeB.x1, sweep.bladeB.y1);
      }

      if (emitReaperSparks && bladeLen > 8) {
        this.effectsSystem.emitReaperSpark(sweep.bladeA.x1, sweep.bladeA.y1);
        this.effectsSystem.emitReaperSpark(sweep.bladeB.x1, sweep.bladeB.y1);
        if (sweep.crescentA.length > 0 && sweep.crescentB.length > 0) {
          const tipA = sweep.crescentA[sweep.crescentA.length - 1];
          const tipB = sweep.crescentB[sweep.crescentB.length - 1];
          this.effectsSystem.emitReaperSpark(tipA.x, tipA.y);
          this.effectsSystem.emitReaperSpark(tipB.x, tipB.y);
        }
      }
      for (const vIdx of sweep.hitVictimIndices) {
        const victim = tanks.find((t) => t.index === vIdx);
        if (!victim || !victim.kinematics.alive) continue;
        if (shieldedIndices.has(vIdx)) {
          audioManager.playShieldDeflect();
          this.effectsSystem.emitShieldDeflect(victim.kinematics.x, victim.kinematics.y);
        } else {
          onSkillHitTank(victim, 'reaper');
        }
      }
    }

    // 5. Check crate pickups by living tanks
    for (let cIdx = this.crates.length - 1; cIdx >= 0; cIdx--) {
      const entry = this.crates[cIdx];
      entry.state.spawnAge += subDt;

      for (const tank of tanks) {
        if (!tank.kinematics.alive) continue;
        if (!canPickupCrate(tank.getSkillState(), tank.hasPendingLaserDischarge())) continue;

        const dist = Math.hypot(
          tank.kinematics.x - entry.state.x,
          tank.kinematics.y - entry.state.y,
        );
        if (dist <= tank.kinematics.radius + entry.state.radius) {
          const forced = (entry.state as MysteryCrateState & { forcedSkill?: SkillId }).forcedSkill;
          if (!forced && this.enabledSkills.length === 0) {
            entry.sprite.destroy();
            entry.ring.destroy();
            this.crates.splice(cIdx, 1);
            break;
          }
          const rolled = forced ?? rollWeightedSkill(this.rng, this.enabledSkills);
          const pickupRes = tryApplyCratePickup(
            tank.getSkillState(),
            rolled,
            tank.hasPendingLaserDischarge(),
          );
          if (pickupRes.pickedUp) {
            const desc = getSkillDescriptor(rolled);
            tank.equipSkill(rolled, desc.ammo);
            audioManager.playPowerUpEquip();
            this.effectsSystem.emitCratePickup(
              tank.kinematics.x,
              tank.kinematics.y,
              desc.name,
              desc.accentHex,
              desc.accentColor,
            );
            this.netEventSink?.({
              kind: 'crate_fx',
              sub: 'pickup',
              x: tank.kinematics.x,
              y: tank.kinematics.y,
              skillId: rolled,
            });
            entry.sprite.destroy();
            entry.ring.destroy();
            this.crates.splice(cIdx, 1);
            hudDirty = true;
            break;
          }
        }
      }
    }

    // 6. Steer Homing Missiles & emit rocket plumes
    this.huntedTargetIndices.clear();
    this.missileTrailAccumulator += subDt;
    const emitTrail = this.missileTrailAccumulator >= 0.032;
    if (emitTrail) this.missileTrailAccumulator = 0;

    for (const proj of this.projectileSystem.getPool()) {
      const k = proj.kinematics;
      if (!k.active) continue;
      if (k.variant === 'drill' && emitTrail) {
        this.effectsSystem.emitDrillTrail(k.x, k.y, Math.atan2(k.vy, k.vx));
      }
      if (k.variant === 'emp_orb' && emitTrail) {
        this.effectsSystem.emitEmpOrbFlightTick(k.x, k.y);
      }
      if (k.variant === 'cryo_orb' && emitTrail) {
        this.effectsSystem.emitCryoOrbFlightTick(k.x, k.y);
      }
      if (k.variant === 'flame' && emitTrail && (k.id & 3) === 0) {
        this.effectsSystem.emitFlameStreamEmber(
          k.x,
          k.y,
          k.age / Math.max(0.05, k.maxLifetime),
        );
      }
      if (k.variant !== 'homing_missile') continue;

      const res = steerHomingMissile(k, tankKinematics, this.arena, subDt);
      if (res.seeking) {
        if (!proj.hasIgnitedSeeker) {
          proj.hasIgnitedSeeker = true;
          audioManager.playMissileLock();
          this.effectsSystem.emitMissileIgnition(k.x, k.y);
        }
        if (res.targetIndex !== null) {
          this.huntedTargetIndices.add(res.targetIndex);
        }
      }
      if (emitTrail) {
        this.effectsSystem.emitMissileTrail(k.x, k.y, Math.atan2(k.vy, k.vx), res.seeking);
      }
    }

    // 6B. Continuous Phantom Afterimage Clones, EMP Jam Sparks & Ice-Drift Snow Spray!
    this.ghostTrailAccumulator += subDt;
    const emitGhostClone = this.ghostTrailAccumulator >= 0.085;
    if (emitGhostClone) this.ghostTrailAccumulator = 0;

    this.statusVfxAccumulator += subDt;
    const emitStatusTick = this.statusVfxAccumulator >= 0.095;
    if (emitStatusTick) this.statusVfxAccumulator = 0;

    for (const t of tanks) {
      if (!t.kinematics.alive) continue;
      const speed = Math.hypot(t.kinematics.vx, t.kinematics.vy);
      if (emitGhostClone && t.isPhantom() && speed > 18 * scale) {
        this.effectsSystem.emitPhantomAfterimage(
          t.kinematics.x,
          t.kinematics.y,
          t.kinematics.angle,
          t.palette.id,
        );
      }
      if (emitStatusTick && t.isEmpJammed()) {
        this.effectsSystem.emitEmpJammedTick(t.kinematics.x, t.kinematics.y);
      }
      if (emitStatusTick && t.isOnIceFloor() && !t.isFrozen() && speed > 22 * scale) {
        this.effectsSystem.emitIceDriftSpray(
          t.kinematics.x,
          t.kinematics.y,
          t.kinematics.angle,
        );
      }
    }

    // 7. Resolve queued Mid-Air EMP Detonations & Spatial Warp Departure Blasts
    while (this.pendingEmpBlasts.length > 0) {
      const ev = this.pendingEmpBlasts.shift()!;
      if (this.executeEmpBlast(ev.x, ev.y, ev.ownerIndex, tanks, onSkillHitTank)) {
        hudDirty = true;
      }
    }

    while (this.pendingWarpBlasts.length > 0) {
      const ev = this.pendingWarpBlasts.shift()!;
      const blastR = POWERUP_CONFIG.warpBlastRadius * scale;
      const victims = computeWarpBlastVictims(
        ev.x,
        ev.y,
        ev.ownerIndex,
        blastR,
        tanks.map((t) => t.kinematics),
      );
      for (const vIdx of victims) {
        const victim = tanks.find((t) => t.index === vIdx);
        if (!victim || !victim.kinematics.alive) continue;
        if (victim.isShielded()) {
          audioManager.playShieldDeflect();
          this.effectsSystem.emitShieldDeflect(victim.kinematics.x, victim.kinematics.y);
        } else {
          onSkillHitTank(victim, 'warp_blast');
          hudDirty = true;
        }
      }
    }

    return { hudDirty };
  }

  postProjectileSubStep(
    subDt: number,
    tanks: readonly Tank[],
    hits: readonly ProjectileHitEvent[],
    onHazardHitTank: (
      victim: Tank,
      source: 'ground_spike' | 'mine' | 'emp_blast' | 'warp_blast',
    ) => void,
  ): boolean {
    let hudDirty = false;
    const tankKinematics = tanks.map((t) => t.kinematics);
    const shieldedIndices = new Set<PlayerIndex>(
      tanks.filter((t) => t.isShielded()).map((t) => t.index),
    );

    // 1. Spike Ball, EMP Orb & Cryo Orb impacts or timed detonations!
    for (const hit of hits) {
      const proj = this.projectileSystem.getProjectileById(hit.projectileId);
      if (!proj) continue;
      const v = proj.kinematics.variant;
      if (v === 'spike_ball') {
        this.detonateSpikeBall(hit.x, hit.y, hit.ownerIndex);
      } else if (v === 'emp_orb') {
        if (this.executeEmpBlast(hit.x, hit.y, hit.ownerIndex, tanks, onHazardHitTank)) {
          hudDirty = true;
        }
      } else if (v === 'cryo_orb') {
        const victim = tanks.find((t) => t.index === hit.victimIndex);
        if (victim && !victim.isShielded()) {
          victim.applyCryoFreeze(POWERUP_CONFIG.cryoFreezeDurationSec);
        }
        this.spawnCryoZone(hit.x, hit.y, hit.ownerIndex);
      }
    }

    for (const proj of this.projectileSystem.getPool()) {
      const k = proj.kinematics;
      if (
        k.active &&
        k.variant === 'spike_ball' &&
        k.age >= POWERUP_CONFIG.spikeFlightDetonateSec
      ) {
        const bx = k.x;
        const by = k.y;
        const owner = k.ownerIndex;
        proj.deactivate();
        this.detonateSpikeBall(bx, by, owner);
      }
    }

    // 2. Age Ground Spike Zones & check lethal tank impalement
    for (let zIdx = this.spikeZones.length - 1; zIdx >= 0; zIdx--) {
      const z = this.spikeZones[zIdx];
      z.state.age += subDt;
      if (z.state.age >= z.state.duration) {
        for (const sp of z.sprites) sp.destroy();
        z.warningRing.destroy();
        this.spikeZones.splice(zIdx, 1);
      }
    }

    if (this.spikeZones.length > 0) {
      const victims = findGroundSpikeVictims(
        this.spikeZones.map((z) => z.state),
        tankKinematics,
      );
      for (const vIdx of victims) {
        if (shieldedIndices.has(vIdx)) continue;
        const victim = tanks.find((t) => t.index === vIdx);
        if (victim && victim.kinematics.alive) {
          onHazardHitTank(victim, 'ground_spike');
        }
      }
    }

    // 3. Age Stealth Proximity Mines & resolve proximity / bullet / chain-reaction blasts!
    for (let mIdx = this.mines.length - 1; mIdx >= 0; mIdx--) {
      const m = this.mines[mIdx];
      m.state.age += subDt;
      if (m.state.age >= m.state.duration) {
        m.sprite.destroy();
        m.armRing.destroy();
        this.mines.splice(mIdx, 1);
      }
    }

    if (this.mines.length > 0) {
      const blasts = findTriggeredMines(
        this.mines.map((m) => m.state),
        tankKinematics,
        this.projectileSystem.getKinematicsList(),
      );

      if (blasts.length > 0) {
        const blownIds = new Set(blasts.map((b) => b.mineId));
        for (let mIdx = this.mines.length - 1; mIdx >= 0; mIdx--) {
          if (blownIds.has(this.mines[mIdx].state.id)) {
            this.mines[mIdx].sprite.destroy();
            this.mines[mIdx].armRing.destroy();
            this.mines.splice(mIdx, 1);
          }
        }

        for (const blast of blasts) {
          audioManager.playTankExplosion();
          this.effectsSystem.emitMineExplosion(blast.x, blast.y);
          for (const vIdx of blast.victimIndices) {
            const victim = tanks.find((t) => t.index === vIdx);
            if (!victim || !victim.kinematics.alive) continue;
            if (shieldedIndices.has(vIdx)) {
              audioManager.playShieldDeflect();
              this.effectsSystem.emitShieldDeflect(victim.kinematics.x, victim.kinematics.y);
            } else {
              onHazardHitTank(victim, 'mine');
            }
          }
        }
      }
    }

    // 4. Age Cryo Ice Zones & apply low-traction Ice Drift to rival tanks!
    for (let i = this.cryoZones.length - 1; i >= 0; i--) {
      const z = this.cryoZones[i];
      z.state.age += subDt;
      if (z.state.age >= z.state.duration) {
        z.disc.destroy();
        this.cryoZones.splice(i, 1);
      }
    }
    const slidingIndices = findTanksInCryoZones(
      this.cryoZones.map((z) => z.state),
      tankKinematics,
    );
    for (const t of tanks) {
      t.setOnIceFloor(slidingIndices.has(t.index) && !t.isShielded());
    }

    // 5. Age Energy Force Barriers & detect external demolition (Drill / TNT Barrel)
    if (this.barriers.length > 0) {
      let modifiedWalls = false;
      for (let i = this.barriers.length - 1; i >= 0; i--) {
        const b = this.barriers[i];
        b.age += subDt;
        const stillInGrid =
          b.kind === 'h'
            ? Boolean(this.arena.grid.hWalls[b.r]?.[b.c])
            : Boolean(this.arena.grid.vWalls[b.r]?.[b.c]);

        if (!stillInGrid) {
          this.effectsSystem.emitBarrierShatter(b.x0, b.y0, b.x1, b.y1);
          this.barriers.splice(i, 1);
          modifiedWalls = true;
        } else if (b.age >= b.duration) {
          this.effectsSystem.emitBarrierShatter(b.x0, b.y0, b.x1, b.y1);
          this.netEventSink?.({
            kind: 'hazard_fx',
            sub: 'barrier_shatter',
            x: b.x0,
            y: b.y0,
            x2: b.x1,
            y2: b.y1,
          });
          removeEnergyBarrierFromArena(b, this.arena);
          this.barriers.splice(i, 1);
          modifiedWalls = true;
        }
      }
      if (modifiedWalls) {
        this.onWallsModified?.();
      }
    }

    // 6. Age Spatial Warp Beacons (expire cleanly if 12s elapses or owner replaced/lost skill)
    for (let i = this.warpBeacons.length - 1; i >= 0; i--) {
      const b = this.warpBeacons[i];
      b.state.age += subDt;
      const owner = tanks.find((t) => t.index === b.state.ownerIndex);
      const orphaned = !owner || !owner.kinematics.alive || owner.getEquippedSkill() !== 'warp';
      const timedOut = b.state.age >= b.state.maxDuration;
      if (orphaned || timedOut) {
        if (timedOut && owner && owner.getEquippedSkill() === 'warp') {
          owner.clearSkill();
          this.effectsSystem.emitSuitRevert(owner.kinematics.x, owner.kinematics.y);
          hudDirty = true;
        }
        b.sprite.destroy();
        b.ring.destroy();
        this.warpBeacons.splice(i, 1);
      }
    }

    return hudDirty;
  }

  private detonateSpikeBall(bx: number, by: number, ownerIndex: PlayerIndex): void {
    const scale = this.arena.scaleRatio;
    audioManager.playSpikeBurst();
    this.effectsSystem.emitSpikeDetonation(bx, by);

    const payload = createSpikeBurstPayload(bx, by, this.arena, this.rng);

    const shardRadius = 3.2 * scale;
    for (const vel of payload.shrapnelVelocities) {
      this.projectileSystem.spawnCustomProjectile({
        ownerIndex,
        x: bx,
        y: by,
        vx: vel.vx,
        vy: vel.vy,
        radius: shardRadius,
        maxLifetime: POWERUP_CONFIG.spikeShrapnelLifetimeSec,
        maxBounces: 0,
        graceTimer: 0,
        variant: 'spike_shard',
        bounceBehavior: 'shatter',
      });
    }

    const zoneState: GroundSpikeZone = {
      id: this.nextEntityId++,
      ownerIndex,
      x: bx,
      y: by,
      age: 0,
      duration: POWERUP_CONFIG.spikeGroundDurationSec,
      nodes: payload.groundNodes,
    };

    const warningRing = this.scene.add
      .circle(bx, by, POWERUP_CONFIG.spikeGroundRadius * scale)
      .setStrokeStyle(1.8, 0xd32f2f, 0.42)
      .setFillStyle(0xd32f2f, 0.07)
      .setDepth(6);

    const sprites = payload.groundNodes.map((node) => {
      const img = this.scene.add
        .image(node.x, node.y, 'decal_ground_spike')
        .setRotation(node.angle)
        .setScale(scale * 0.2)
        .setDepth(7);
      this.scene.tweens.add({
        targets: img,
        scale: scale * 0.86,
        duration: 160,
        ease: 'Back.easeOut',
      });
      return img;
    });

    this.spikeZones.push({ state: zoneState, sprites, warningRing });
  }

  syncVisuals(dt: number, tanks: readonly Tank[]): void {
    this.animClock += dt;
    const scale = this.arena.scaleRatio;

    for (const entry of this.crates) {
      const bob = Math.sin(this.animClock * 4.2 + entry.state.id) * 2.2 * scale;
      entry.sprite.setY(entry.state.y + bob);
      entry.ring.setScale(1 + Math.sin(this.animClock * 5 + entry.state.id) * 0.1);
    }

    for (const z of this.spikeZones) {
      const rem = z.state.duration - z.state.age;
      if (rem < 1.0) {
        const alpha = 0.3 + 0.7 * Math.abs(Math.sin(rem * 20));
        z.warningRing.setAlpha(alpha * 0.6);
        for (const sp of z.sprites) sp.setAlpha(alpha);
      }
    }

    // Update Stealth Proximity Mine visibility (blinks during 1.6s arming, then cloaks!)
    for (const m of this.mines) {
      if (m.state.age < m.state.armingSec) {
        const blink = Math.sin(m.state.age * 24) > 0;
        m.sprite.setAlpha(blink ? 1 : 0.45);
        m.armRing.setVisible(true).setAlpha(blink ? 0.65 : 0.2);
      } else {
        m.armRing.setVisible(false);
        const phase = (m.state.age - m.state.armingSec) % 3.2;
        const glint = phase < 0.16 ? 0.32 : 0.04;
        m.sprite.setAlpha(glint);
      }
    }

    // Update Cryo Zones, Energy Force Barriers, Warp Stargates & Reaper-Tier Cataclysms!
    this.zoneGraphics.clear();
    this.holoGraphics.clear();
    this.reaperShadowGraphics.clear();
    this.reaperGraphics.clear();

    // A. Live Tactical Detonation Range Ring around flying `emp_orb`!
    for (const proj of this.projectileSystem.getPool()) {
      const k = proj.kinematics;
      if (!k.active || k.variant !== 'emp_orb') continue;
      const blastR = this.arena.cellSize * POWERUP_CONFIG.empBlastCellsRadius;
      const pulse = 0.7 + 0.3 * Math.sin(this.animClock * 14);
      this.zoneGraphics.lineStyle(2.2 * scale, 0x0c091e, 0.36 * pulse);
      this.zoneGraphics.strokeCircle(k.x, k.y, blastR);
      const segs = 18;
      for (let sIdx = 0; sIdx < segs; sIdx += 2) {
        const a0 = this.animClock * 1.4 + (sIdx / segs) * Math.PI * 2;
        const a1 = a0 + (Math.PI * 2) / (segs * 1.6);
        this.zoneGraphics.lineStyle(2.0 * scale, 0x651fff, 0.62 * pulse);
        this.zoneGraphics.beginPath();
        this.zoneGraphics.arc(k.x, k.y, blastR, a0, a1, false);
        this.zoneGraphics.strokePath();
      }
    }

    // B. Deep Midnight-Sapphire Glacial Cathedral (`cryoZones` — razor-sharp contrast on #F3F3F1!)
    for (const cz of this.cryoZones) {
      const rem = cz.state.duration - cz.state.age;
      const fade = rem < 1.0 ? Math.max(0.1, rem) : 1;
      const cx = cz.state.x;
      const cy = cz.state.y;
      const r = cz.state.radius;
      cz.disc.setAlpha((0.54 + 0.06 * Math.sin(this.animClock * 5 + cz.state.id)) * fade);

      // 1. Jagged 16-tooth outer glacial ice cliff + inner cyan crystal ring
      this.zoneGraphics.fillStyle(0x00838f, 0.42 * fade);
      this.zoneGraphics.lineStyle(2.8 * scale, 0x00e5ff, 0.92 * fade);
      this.zoneGraphics.beginPath();
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + cz.state.id * 0.3;
        const jr = r * (i % 2 === 0 ? 1.03 : 0.91);
        const px = cx + Math.cos(a) * jr;
        const py = cy + Math.sin(a) * jr;
        if (i === 0) this.zoneGraphics.moveTo(px, py);
        else this.zoneGraphics.lineTo(px, py);
      }
      this.zoneGraphics.closePath();
      this.zoneGraphics.fillPath();
      this.zoneGraphics.strokePath();

      // 2. Rotating 6-Pointed Diamond-Faceted Snowflake Cathedral!
      const slowRot = this.animClock * 0.55 + cz.state.id;
      for (let i = 0; i < 6; i++) {
        const a = slowRot + (i * Math.PI) / 3;
        const ux = Math.cos(a);
        const uy = Math.sin(a);
        const nx = -uy;
        const ny = ux;
        const tipR = r * 0.88;
        const midR = r * 0.48;
        const wingW = r * 0.13;

        // Faceted ice spear blade (dark sapphire outline + bright cyan-white fill!)
        this.zoneGraphics.fillStyle(0x84ffff, 0.72 * fade);
        this.zoneGraphics.lineStyle(1.8 * scale, 0x041824, 0.9 * fade);
        this.zoneGraphics.beginPath();
        this.zoneGraphics.moveTo(cx, cy);
        this.zoneGraphics.lineTo(cx + ux * midR + nx * wingW, cy + uy * midR + ny * wingW);
        this.zoneGraphics.lineTo(cx + ux * tipR, cy + uy * tipR);
        this.zoneGraphics.lineTo(cx + ux * midR - nx * wingW, cy + uy * midR - ny * wingW);
        this.zoneGraphics.closePath();
        this.zoneGraphics.fillPath();
        this.zoneGraphics.strokePath();

        // Pure white razor spine + barbs
        this.zoneGraphics.lineStyle(2.0 * scale, 0xffffff, 0.94 * fade);
        this.zoneGraphics.lineBetween(cx, cy, cx + ux * tipR, cy + uy * tipR);
        const bx = cx + ux * (r * 0.58);
        const by = cy + uy * (r * 0.58);
        for (const side of [-0.58, 0.58]) {
          this.zoneGraphics.lineBetween(
            bx,
            by,
            bx + Math.cos(a + side) * (r * 0.24),
            by + Math.sin(a + side) * (r * 0.24),
          );
        }
      }

      // 3. Central Arctic Core Gem
      this.zoneGraphics.fillStyle(0x041824, 0.92 * fade);
      this.zoneGraphics.fillCircle(cx, cy, 7.5 * scale);
      this.zoneGraphics.fillStyle(0xffffff, 0.96 * fade);
      this.zoneGraphics.fillCircle(cx, cy, 4.2 * scale);
    }

    // C. Chrono-Abyssal Stargate (`warpBeacons` — Black-Hole Event Horizon + Clockwork Runes!)
    for (const wb of this.warpBeacons) {
      wb.sprite.rotation += dt * 2.8;
      const rem = wb.state.maxDuration - wb.state.age;
      const ratio = Math.max(0, Math.min(1, rem / wb.state.maxDuration));
      const blink = rem < 2.0 ? 0.4 + 0.6 * Math.abs(Math.sin(rem * 16)) : 1;
      const bx = wb.state.x;
      const by = wb.state.y;
      wb.sprite.setAlpha(blink);
      wb.ring.setVisible(false);

      const gateR = 25 * scale;
      // 1. Pitch-black Void Event Horizon Pool (`zoneGraphics`, `NORMAL` blend!)
      this.zoneGraphics.fillStyle(0x070412, 0.88 * blink);
      this.zoneGraphics.fillCircle(bx, by, gateR);
      this.zoneGraphics.lineStyle(3.2 * scale, 0xe040fb, 0.95 * blink);
      this.zoneGraphics.strokeCircle(bx, by, gateR);

      // 12-tick Clockwork Duration Dial around Stargate
      this.zoneGraphics.lineStyle(3.0 * scale, 0x00e5ff, 0.95 * blink);
      this.zoneGraphics.beginPath();
      this.zoneGraphics.arc(bx, by, gateR * 1.16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio, false);
      this.zoneGraphics.strokePath();

      // 2. Counter-rotating Sacred-Geometry Hexagram Sigils (`holoGraphics` + `zoneGraphics`)
      for (const [dir, col] of [
        [1, 0xe040fb],
        [-1.35, 0x00e5ff],
      ] as const) {
        const rot = this.animClock * 2.5 * dir + wb.state.id;
        this.zoneGraphics.lineStyle(1.9 * scale, col, 0.88 * blink);
        this.zoneGraphics.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = rot + (k * Math.PI) / 2;
          const px = bx + Math.cos(a) * (gateR * 0.84);
          const py = by + Math.sin(a) * (gateR * 0.84);
          if (k === 0) this.zoneGraphics.moveTo(px, py);
          else this.zoneGraphics.lineTo(px, py);
        }
        this.zoneGraphics.closePath();
        this.zoneGraphics.strokePath();
      }

      for (let m = 0; m < 4; m++) {
        const ma = this.animClock * 5.2 + (m * Math.PI) / 2;
        const mx = bx + Math.cos(ma) * (gateR * 1.24);
        const my = by + Math.sin(ma) * (gateR * 1.24);
        this.zoneGraphics.fillStyle(0x070412, 0.95 * blink);
        this.zoneGraphics.fillCircle(mx, my, 4.0 * scale);
        this.zoneGraphics.fillStyle(m % 2 === 0 ? 0x00e5ff : 0xe040fb, 0.98 * blink);
        this.zoneGraphics.fillCircle(mx, my, 2.4 * scale);
      }

      // 3. High-contrast Obsidian-Shrouded Quantum Tether pulsing to owner tank!
      const owner = tanks.find((t) => t.index === wb.state.ownerIndex && t.kinematics.alive);
      if (owner && owner.isWarpBeaconPlaced()) {
        const dx = owner.kinematics.x - bx;
        const dy = owner.kinematics.y - by;
        const dist = Math.hypot(dx, dy);
        if (dist > 28 * scale) {
          const dots = Math.min(16, Math.max(4, Math.floor(dist / (30 * scale))));
          const phaseShift = (this.animClock * 2.4) % 1;
          for (let d = 0; d < dots; d++) {
            const u = 1 - ((d + phaseShift) / dots);
            const px = bx + dx * u;
            const py = by + dy * u;
            this.zoneGraphics.fillStyle(0x090614, 0.65 * blink);
            this.zoneGraphics.fillCircle(px, py, 3.2 * scale);
            this.zoneGraphics.fillStyle(d % 2 === 0 ? 0xe040fb : 0x00e5ff, 0.92 * blink);
            this.zoneGraphics.fillCircle(px, py, 1.9 * scale);
          }
        }
      }
    }

    // D. High-Contrast Tactical Laser Blueprint when holding `barrier`!
    for (const tank of tanks) {
      if (!tank.kinematics.alive || tank.getEquippedSkill() !== 'barrier') continue;
      const preview = previewEnergyBarrierEdge(tank.kinematics, this.arena);
      if (!preview) continue;
      const pulse = 0.65 + 0.35 * Math.sin(this.animClock * 10);
      this.zoneGraphics.lineStyle(9 * scale, 0x071f14, 0.48 * pulse);
      this.zoneGraphics.lineBetween(preview.x0, preview.y0, preview.x1, preview.y1);

      const segs = 7;
      for (let sIdx = 0; sIdx < segs; sIdx += 2) {
        const f0 = sIdx / segs;
        const f1 = Math.min(1, (sIdx + 1) / segs);
        this.zoneGraphics.lineStyle(3.4 * scale, 0x00e676, 0.92 * pulse);
        this.zoneGraphics.lineBetween(
          preview.x0 + (preview.x1 - preview.x0) * f0,
          preview.y0 + (preview.y1 - preview.y0) * f0,
          preview.x0 + (preview.x1 - preview.x0) * f1,
          preview.y0 + (preview.y1 - preview.y0) * f1,
        );
      }
      for (const [px, py] of [
        [preview.x0, preview.y0],
        [preview.x1, preview.y1],
      ]) {
        this.zoneGraphics.fillStyle(0x071f14, 0.9 * pulse);
        this.zoneGraphics.fillCircle(px, py, 5.2 * scale);
        this.zoneGraphics.fillStyle(0x69f0ae, 0.96 * pulse);
        this.zoneGraphics.fillCircle(px, py, 2.8 * scale);
      }
    }

    // E. Titan Hard-Light Plasma Bastion (`barriers` — Obsidian Shroud + Honeycomb + Live Plasma Arc!)
    this.barrierGraphics.clear();
    for (const b of this.barriers) {
      const rem = b.duration - b.age;
      const blink = rem < 1.5 ? 0.4 + 0.6 * Math.abs(Math.sin(rem * 18)) : 1;
      const dx = b.x1 - b.x0;
      const dy = b.y1 - b.y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;

      // 1. Dark Obsidian-Emerald Containment Shroud (`barrierGraphics`, `NORMAL` blend!)
      this.barrierGraphics.lineStyle(16.5 * scale, 0x061b11, 0.88 * blink);
      this.barrierGraphics.lineBetween(b.x0, b.y0, b.x1, b.y1);
      this.barrierGraphics.lineStyle(9.5 * scale, 0x00c853, 0.95 * blink);
      this.barrierGraphics.lineBetween(b.x0, b.y0, b.x1, b.y1);
      this.barrierGraphics.lineStyle(3.6 * scale, 0xffffff, 0.98 * blink);
      this.barrierGraphics.lineBetween(b.x0, b.y0, b.x1, b.y1);

      // 2. Additive Emerald-Cyan Glow + Live Crackling Lightning Arc (`reaperGraphics` `ADD` blend!)
      this.reaperGraphics.lineStyle(20 * scale, 0x00e676, 0.34 * blink);
      this.reaperGraphics.lineBetween(b.x0, b.y0, b.x1, b.y1);

      this.reaperGraphics.lineStyle(2.2 * scale, 0x84ffff, 0.95 * blink);
      this.reaperGraphics.beginPath();
      const arcSteps = 8;
      for (let k = 0; k <= arcSteps; k++) {
        const f = k / arcSteps;
        const jit = k > 0 && k < arcSteps ? (Math.random() - 0.5) * 11 * scale : 0;
        const px = b.x0 + dx * f + nx * jit;
        const py = b.y0 + dy * f + ny * jit;
        if (k === 0) this.reaperGraphics.moveTo(px, py);
        else this.reaperGraphics.lineTo(px, py);
      }
      this.reaperGraphics.strokePath();

      // Scrolling Hard-Light Hexagonal Chevrons & Side Force-Fins!
      const scroll = (this.animClock * 1.8) % 1;
      for (let k = 0; k < 5; k++) {
        const f = (k / 5 + scroll) % 1;
        const px = b.x0 + dx * f;
        const py = b.y0 + dy * f;
        const rib = 8.2 * scale;
        this.barrierGraphics.lineStyle(3.2 * scale, 0x061b11, 0.85 * blink);
        this.barrierGraphics.lineBetween(px - nx * rib, py - ny * rib, px + nx * rib, py + ny * rib);
        this.barrierGraphics.lineStyle(1.8 * scale, 0x69f0ae, 0.98 * blink);
        this.barrierGraphics.lineBetween(px - nx * rib, py - ny * rib, px + nx * rib, py + ny * rib);
      }

      // 3. Heavy Octagonal Obsidian-Emerald Anchor Pylons at both ends
      for (const [px, py] of [
        [b.x0, b.y0],
        [b.x1, b.y1],
      ]) {
        this.barrierGraphics.fillStyle(0x061b11, 0.98 * blink);
        this.barrierGraphics.fillCircle(px, py, 9.2 * scale);
        this.barrierGraphics.lineStyle(2.4 * scale, 0x00e676, 0.98 * blink);
        this.barrierGraphics.strokeCircle(px, py, 9.2 * scale);
        this.barrierGraphics.fillStyle(0xffffff, 0.98 * blink);
        this.barrierGraphics.fillCircle(px, py, 3.6 * scale);
      }
    }

    // F. Reaper-Class 60-FPS Frame-Animated EMP Thunder-God Array (Open Concentric Runic Rings + Giant Thunderbolts!)
    for (let i = this.activeEmpCataclysms.length - 1; i >= 0; i--) {
      const emp = this.activeEmpCataclysms[i];
      emp.age += dt;
      if (emp.age >= emp.duration) {
        this.activeEmpCataclysms.splice(i, 1);
        continue;
      }
      const p = emp.age / emp.duration;
      const expand = p < 0.16 ? 1 - Math.pow(1 - p / 0.16, 3) : 1.0;
      const fade = p > 0.62 ? Math.max(0, 1 - (p - 0.62) / 0.38) : 1.0;
      const r = emp.radius * expand;

      // 1. Open Concentric Obsidian-Violet Magic Rings & Hexagram (keeps arena walls crisp underneath!)
      this.reaperShadowGraphics.fillStyle(0x080618, 0.16 * fade);
      this.reaperShadowGraphics.fillCircle(emp.x, emp.y, r);
      this.reaperShadowGraphics.lineStyle(9.5 * scale, 0x080618, 0.92 * fade);
      this.reaperShadowGraphics.strokeCircle(emp.x, emp.y, r);
      this.reaperShadowGraphics.lineStyle(5.5 * scale, 0x080618, 0.85 * fade);
      this.reaperShadowGraphics.strokeCircle(emp.x, emp.y, r * 0.64);

      const runeSpin = emp.age * 3.6;
      // Rotating 6-Pointed Thunder-God Star inside the ring!
      for (const starOffset of [0, Math.PI / 3]) {
        this.reaperShadowGraphics.lineStyle(4.8 * scale, 0x080618, 0.78 * fade);
        this.reaperShadowGraphics.beginPath();
        for (let v = 0; v < 3; v++) {
          const va = runeSpin + starOffset + (v * Math.PI * 2) / 3;
          const vx = emp.x + Math.cos(va) * (r * 0.88);
          const vy = emp.y + Math.sin(va) * (r * 0.88);
          if (v === 0) this.reaperShadowGraphics.moveTo(vx, vy);
          else this.reaperShadowGraphics.lineTo(vx, vy);
        }
        this.reaperShadowGraphics.closePath();
        this.reaperShadowGraphics.strokePath();

        this.reaperGraphics.lineStyle(2.4 * scale, starOffset === 0 ? 0x651fff : 0x00e5ff, 0.92 * fade);
        this.reaperGraphics.beginPath();
        for (let v = 0; v < 3; v++) {
          const va = runeSpin + starOffset + (v * Math.PI * 2) / 3;
          const vx = emp.x + Math.cos(va) * (r * 0.88);
          const vy = emp.y + Math.sin(va) * (r * 0.88);
          if (v === 0) this.reaperGraphics.moveTo(vx, vy);
          else this.reaperGraphics.lineTo(vx, vy);
        }
        this.reaperGraphics.closePath();
        this.reaperGraphics.strokePath();
      }

      // Outer Blazing Plasma Rim + Expanding Shockwave Ring
      this.reaperGraphics.lineStyle(10 * scale, 0x651fff, 0.65 * fade);
      this.reaperGraphics.strokeCircle(emp.x, emp.y, r);
      this.reaperGraphics.lineStyle(3.6 * scale, 0x00e5ff, 0.98 * fade);
      this.reaperGraphics.strokeCircle(emp.x, emp.y, r);
      this.reaperGraphics.lineStyle(2.4 * scale, 0xffea00, 0.9 * fade);
      this.reaperGraphics.strokeCircle(emp.x, emp.y, r * 0.64);

      for (let k = 0; k < 16; k++) {
        const a = -runeSpin * 1.4 + (k / 16) * Math.PI * 2;
        this.reaperGraphics.lineStyle(2.8 * scale, k % 2 === 0 ? 0x00e5ff : 0xffea00, 0.96 * fade);
        this.reaperGraphics.lineBetween(
          emp.x + Math.cos(a) * (r * 0.88),
          emp.y + Math.sin(a) * (r * 0.88),
          emp.x + Math.cos(a) * (r * 1.05),
          emp.y + Math.sin(a) * (r * 1.05),
        );
      }

      // 2. 10 Live Re-Striking Forked Thunderbolts (`Obsidian Shroud + Cyan/Gold Core`!)
      const bolts = 10;
      for (let b = 0; b < bolts; b++) {
        const baseA = -runeSpin * 0.5 + (b / bolts) * Math.PI * 2;
        const pts: Array<{ x: number; y: number }> = [{ x: emp.x, y: emp.y }];
        const segs = 5;
        for (let sIdx = 1; sIdx <= segs; sIdx++) {
          const f = sIdx / segs;
          const jit = sIdx < segs ? (Math.random() - 0.5) * 0.36 : 0;
          pts.push({
            x: emp.x + Math.cos(baseA + jit) * (r * f),
            y: emp.y + Math.sin(baseA + jit) * (r * f),
          });
        }

        this.reaperShadowGraphics.lineStyle(8.5 * scale, 0x080618, 0.88 * fade);
        this.reaperShadowGraphics.beginPath();
        for (let sIdx = 0; sIdx < pts.length; sIdx++) {
          if (sIdx === 0) this.reaperShadowGraphics.moveTo(pts[sIdx].x, pts[sIdx].y);
          else this.reaperShadowGraphics.lineTo(pts[sIdx].x, pts[sIdx].y);
        }
        this.reaperShadowGraphics.strokePath();

        this.reaperGraphics.lineStyle(
          (b % 2 === 0 ? 4.4 : 3.0) * scale,
          b % 3 === 0 ? 0xffea00 : 0x00e5ff,
          0.98 * fade,
        );
        this.reaperGraphics.beginPath();
        for (let sIdx = 0; sIdx < pts.length; sIdx++) {
          if (sIdx === 0) this.reaperGraphics.moveTo(pts[sIdx].x, pts[sIdx].y);
          else this.reaperGraphics.lineTo(pts[sIdx].x, pts[sIdx].y);
        }
        this.reaperGraphics.strokePath();
      }

      // Blazing central Tesla Singularity Eye
      this.reaperShadowGraphics.fillStyle(0x080618, 0.96 * fade);
      this.reaperShadowGraphics.fillCircle(emp.x, emp.y, 18 * scale);
      this.reaperGraphics.fillStyle(0x651fff, 0.85 * fade);
      this.reaperGraphics.fillCircle(emp.x, emp.y, 15 * scale);
      this.reaperGraphics.fillStyle(0x00e5ff, 0.95 * fade);
      this.reaperGraphics.fillCircle(emp.x, emp.y, 10 * scale);
      this.reaperGraphics.fillStyle(0xffffff, 1.0 * fade);
      this.reaperGraphics.fillCircle(emp.x, emp.y, 5 * scale);
    }

    // G. Reaper-Class 60-FPS Frame-Animated Black-Hole Singularity & Dimensional Cleave (`activeWarpCataclysms`)!
    for (let i = this.activeWarpCataclysms.length - 1; i >= 0; i--) {
      const wp = this.activeWarpCataclysms[i];
      wp.age += dt;
      if (wp.age >= wp.duration) {
        this.activeWarpCataclysms.splice(i, 1);
        continue;
      }
      const p = wp.age / wp.duration;
      const expand = p < 0.18 ? 1 - Math.pow(1 - p / 0.18, 3) : 1.0;
      const fade = p > 0.58 ? Math.max(0, 1 - (p - 0.58) / 0.42) : 1.0;
      const r = wp.blastRadius * expand;

      // 1. Massive Reaper-Width Abyssal Dimensional Cleave Slash + Jagged Chrono-Lightning (`from -> to`)!
      const beamFade = Math.max(0, 1 - p * 1.08);
      if (beamFade > 0.02) {
        this.reaperShadowGraphics.lineStyle(22 * scale * beamFade, 0x070412, 0.9 * beamFade);
        this.reaperShadowGraphics.lineBetween(wp.fromX, wp.fromY, wp.toX, wp.toY);
        this.reaperShadowGraphics.lineStyle(8 * scale * beamFade, 0xd500f9, 0.95 * beamFade);
        this.reaperShadowGraphics.lineBetween(wp.fromX, wp.fromY, wp.toX, wp.toY);
        this.reaperGraphics.lineStyle(14 * scale * beamFade, 0xe040fb, 0.78 * beamFade);
        this.reaperGraphics.lineBetween(wp.fromX, wp.fromY, wp.toX, wp.toY);
        this.reaperGraphics.lineStyle(4.2 * scale * beamFade, 0x00e5ff, 0.98 * beamFade);
        this.reaperGraphics.lineBetween(wp.fromX, wp.fromY, wp.toX, wp.toY);

        // Crackling white-cyan void lightning along the Dimensional Cleave!
        const bdx = wp.toX - wp.fromX;
        const bdy = wp.toY - wp.fromY;
        const bLen = Math.hypot(bdx, bdy) || 1;
        const bnx = -bdy / bLen;
        const bny = bdx / bLen;
        this.reaperGraphics.lineStyle(2.6 * scale, 0xffffff, 0.98 * beamFade);
        this.reaperGraphics.beginPath();
        const lSteps = 12;
        for (let k = 0; k <= lSteps; k++) {
          const f = k / lSteps;
          const jit = k > 0 && k < lSteps ? (Math.random() - 0.5) * 16 * scale : 0;
          const lx = wp.fromX + bdx * f + bnx * jit;
          const ly = wp.fromY + bdy * f + bny * jit;
          if (k === 0) this.reaperGraphics.moveTo(lx, ly);
          else this.reaperGraphics.lineTo(lx, ly);
        }
        this.reaperGraphics.strokePath();
      }

      // 2. Departure Black-Hole Singularity + 4 Spinning Curved Accretion Scythe Arms!
      this.reaperShadowGraphics.fillStyle(0x06030f, 0.92 * fade);
      this.reaperShadowGraphics.fillCircle(wp.fromX, wp.fromY, r * 0.78);
      this.reaperShadowGraphics.lineStyle(7.5 * scale, 0x090516, 0.95 * fade);
      this.reaperShadowGraphics.strokeCircle(wp.fromX, wp.fromY, r * 1.15);

      this.reaperGraphics.lineStyle(8.5 * scale, 0xe040fb, 0.92 * fade);
      this.reaperGraphics.strokeCircle(wp.fromX, wp.fromY, r * 1.15);
      this.reaperGraphics.lineStyle(3.2 * scale, 0x00e5ff, 0.98 * fade);
      this.reaperGraphics.strokeCircle(wp.fromX, wp.fromY, r * 0.78);

      const swirl = -wp.age * 9.5;
      for (let arm = 0; arm < 4; arm++) {
        const a0 = swirl + (arm * Math.PI) / 2;
        this.reaperShadowGraphics.lineStyle(8.5 * scale, 0x070412, 0.85 * fade);
        this.reaperShadowGraphics.beginPath();
        for (let sIdx = 0; sIdx <= 8; sIdx++) {
          const f = sIdx / 8;
          const a = a0 + f * 1.55;
          const rad = r * (0.2 + f * 1.18);
          const px = wp.fromX + Math.cos(a) * rad;
          const py = wp.fromY + Math.sin(a) * rad;
          if (sIdx === 0) this.reaperShadowGraphics.moveTo(px, py);
          else this.reaperShadowGraphics.lineTo(px, py);
        }
        this.reaperShadowGraphics.strokePath();

        this.reaperGraphics.lineStyle(4.5 * scale, arm % 2 === 0 ? 0xe040fb : 0x00e5ff, 0.98 * fade);
        this.reaperGraphics.beginPath();
        for (let sIdx = 0; sIdx <= 8; sIdx++) {
          const f = sIdx / 8;
          const a = a0 + f * 1.55;
          const rad = r * (0.2 + f * 1.18);
          const px = wp.fromX + Math.cos(a) * rad;
          const py = wp.fromY + Math.sin(a) * rad;
          if (sIdx === 0) this.reaperGraphics.moveTo(px, py);
          else this.reaperGraphics.lineTo(px, py);
        }
        this.reaperGraphics.strokePath();
      }

      // 3. Arrival Chrono-Starburst Nova at `(toX, toY)`!
      const arrR = (42 * scale) * (1 - p * 0.3);
      this.reaperShadowGraphics.fillStyle(0x070412, 0.82 * fade);
      this.reaperShadowGraphics.fillCircle(wp.toX, wp.toY, arrR * 0.65);
      this.reaperShadowGraphics.lineStyle(6.5 * scale, 0x070412, 0.9 * fade);
      this.reaperShadowGraphics.strokeCircle(wp.toX, wp.toY, arrR);
      this.reaperGraphics.lineStyle(4.5 * scale, 0x00e5ff, 0.98 * fade);
      this.reaperGraphics.strokeCircle(wp.toX, wp.toY, arrR);
      for (let k = 0; k < 8; k++) {
        const ka = wp.age * 6 + (k * Math.PI) / 4;
        const len = arrR * (k % 2 === 0 ? 1.5 : 0.95);
        this.reaperShadowGraphics.lineStyle(5.2 * scale, 0x070412, 0.82 * fade);
        this.reaperShadowGraphics.lineBetween(
          wp.toX,
          wp.toY,
          wp.toX + Math.cos(ka) * len,
          wp.toY + Math.sin(ka) * len,
        );
        this.reaperGraphics.lineStyle(2.8 * scale, k % 2 === 0 ? 0xe040fb : 0x80d8ff, 0.98 * fade);
        this.reaperGraphics.lineBetween(
          wp.toX,
          wp.toY,
          wp.toX + Math.cos(ka) * len,
          wp.toY + Math.sin(ka) * len,
        );
      }
    }

    // Draw Twin Giant Obsidian-Black & Blood-Crimson Crescent Scythes + Shadow Afterimages!
    for (const tank of tanks) {
      if (!tank.kinematics.alive || !tank.isReaperSweeping()) continue;
      const extend = tank.getReaperExtendProgress();
      if (extend <= 0.01) continue;
      const crescentExtend = tank.getReaperCrescentProgress();
      const bladeLen =
        this.arena.cellSize * POWERUP_CONFIG.reaperBladeCellsLength * extend;
      const cx = tank.kinematics.x;
      const cy = tank.kinematics.y;

      const drawScytheAtAngle = (ang: number, alphaMul: number, isPrimary: boolean) => {
        const sweep = computeReaperBlades(
          cx,
          cy,
          ang,
          tank.index,
          bladeLen,
          [],
          scale,
          crescentExtend,
        );
        const x0 = sweep.bladeB.x1;
        const y0 = sweep.bladeB.y1;
        const x1 = sweep.bladeA.x1;
        const y1 = sweep.bladeA.y1;

        // 1A. Obsidian-Black Abyssal Core Shroud (`NORMAL` blend so pure black pops boldly!)
        this.reaperShadowGraphics.lineStyle(26 * scale, 0x090a0e, 0.76 * alphaMul);
        this.reaperShadowGraphics.lineBetween(x0, y0, x1, y1);
        this.reaperShadowGraphics.lineStyle(12 * scale, 0x16181f, 0.92 * alphaMul);
        this.reaperShadowGraphics.lineBetween(x0, y0, x1, y1);

        // 1B. Blood-Crimson Laser-Shaft Plasma Aura & Scarlet Lightning (`ADD` blend)
        this.reaperGraphics.lineStyle(22 * scale, 0xb71c1c, 0.36 * alphaMul);
        this.reaperGraphics.lineBetween(x0, y0, x1, y1);
        this.reaperGraphics.lineStyle(9.5 * scale, 0xff1744, 0.88 * alphaMul);
        this.reaperGraphics.lineBetween(x0, y0, x1, y1);
        if (isPrimary) {
          this.reaperGraphics.lineStyle(3.8 * scale, 0xffebee, 0.96);
          this.reaperGraphics.lineBetween(x0, y0, x1, y1);

          // Glowing laser tip nodes at both ends while the shaft shoots out to peak!
          this.reaperGraphics.fillStyle(0xff1744, 0.55);
          this.reaperGraphics.fillCircle(x0, y0, 10 * scale);
          this.reaperGraphics.fillCircle(x1, y1, 10 * scale);
          this.reaperGraphics.fillStyle(0xffffff, 0.95);
          this.reaperGraphics.fillCircle(x0, y0, 4.2 * scale);
          this.reaperGraphics.fillCircle(x1, y1, 4.2 * scale);

          // Crackling blood-crimson lightning along the twin obsidian shafts!
          this.reaperGraphics.lineStyle(2.2 * scale, 0xff1744, 0.95);
          this.reaperGraphics.beginPath();
          const steps = 14;
          for (let sIdx = 0; sIdx <= steps; sIdx++) {
            const f = sIdx / steps;
            const lx =
              x0 +
              (x1 - x0) * f +
              (sIdx > 0 && sIdx < steps ? (Math.random() - 0.5) * 14 * scale : 0);
            const ly =
              y0 +
              (y1 - y0) * f +
              (sIdx > 0 && sIdx < steps ? (Math.random() - 0.5) * 14 * scale : 0);
            if (sIdx === 0) this.reaperGraphics.moveTo(lx, ly);
            else this.reaperGraphics.lineTo(lx, ly);
          }
          this.reaperGraphics.strokePath();
        }

        // 2. Twin Transverse Obsidian-Black + Blood-Crimson Crescent Scythe Blades (`Lưỡi Liềm`)
        //    Only drawn once `crescentExtend > 0.02` (after the laser shaft reaches 100% peak!)
        const drawCrescentHead = (outerPts: ReadonlyArray<{ x: number; y: number }>, dirSign: 1 | -1) => {
          if (outerPts.length < 2) return;
          const ux = Math.cos(ang) * dirSign;
          const uy = Math.sin(ang) * dirSign;

          // Pitch-black obsidian inner scythe blade body (`reaperShadowGraphics`)
          this.reaperShadowGraphics.fillStyle(0x0b0c10, (isPrimary ? 0.92 : 0.42) * alphaMul);
          this.reaperShadowGraphics.lineStyle(2.5 * scale, 0x1a1c23, 0.85 * alphaMul);
          this.reaperShadowGraphics.beginPath();
          for (let i = 0; i < outerPts.length; i++) {
            if (i === 0) this.reaperShadowGraphics.moveTo(outerPts[i].x, outerPts[i].y);
            else this.reaperShadowGraphics.lineTo(outerPts[i].x, outerPts[i].y);
          }
          for (let i = outerPts.length - 1; i >= 0; i--) {
            const arch = Math.sin((i / (outerPts.length - 1)) * Math.PI);
            const inset = bladeLen * 0.135 * arch * Math.min(1, crescentExtend);
            this.reaperShadowGraphics.lineTo(
              outerPts[i].x - ux * inset,
              outerPts[i].y - uy * inset,
            );
          }
          this.reaperShadowGraphics.closePath();
          this.reaperShadowGraphics.fillPath();
          this.reaperShadowGraphics.strokePath();

          // Blazing crimson-scarlet glowing cutting edge (`reaperGraphics`)!
          const strokePoly = (w: number, col: number, a: number) => {
            this.reaperGraphics.lineStyle(w, col, a * alphaMul);
            this.reaperGraphics.beginPath();
            for (let i = 0; i < outerPts.length; i++) {
              if (i === 0) this.reaperGraphics.moveTo(outerPts[i].x, outerPts[i].y);
              else this.reaperGraphics.lineTo(outerPts[i].x, outerPts[i].y);
            }
            this.reaperGraphics.strokePath();
          };

          strokePoly(20 * scale, 0xd50000, 0.42);
          strokePoly(9.5 * scale, 0xff1744, 0.92);
          if (isPrimary) {
            strokePoly(3.8 * scale, 0xffcdd2, 1.0);
          }
        };

        drawCrescentHead(sweep.crescentA, 1);
        drawCrescentHead(sweep.crescentB, -1);
      };

      // Only draw rotational shadow wakes during Stage 4 (`isReaperRotating()`) when actually spinning!
      if (tank.isReaperRotating()) {
        drawScytheAtAngle(tank.kinematics.angle - 0.14, 0.22, false);
        drawScytheAtAngle(tank.kinematics.angle - 0.07, 0.44, false);
      }
      drawScytheAtAngle(tank.kinematics.angle, 1.0, true);
    }

    // Draw spinning red lock-on crosshair around any tank hunted by a Phase-2 Homing Missile
    this.reticleGraphics.clear();
    if (this.huntedTargetIndices.size > 0) {
      for (const idx of this.huntedTargetIndices) {
        const target = tanks.find((t) => t.index === idx);
        if (!target || !target.kinematics.alive) continue;

        const r = target.kinematics.radius * 1.65;
        const rot = this.animClock * 4.5;
        this.reticleGraphics.lineStyle(2.2 * scale, 0xff1744, 0.9);
        this.reticleGraphics.strokeCircle(target.kinematics.x, target.kinematics.y, r);

        for (let c = 0; c < 4; c++) {
          const a = rot + (c * Math.PI) / 2;
          this.reticleGraphics.lineBetween(
            target.kinematics.x + Math.cos(a) * (r * 0.72),
            target.kinematics.y + Math.sin(a) * (r * 0.72),
            target.kinematics.x + Math.cos(a) * (r * 1.25),
            target.kinematics.y + Math.sin(a) * (r * 1.25),
          );
        }
      }
    }
  }

  destroy(): void {
    for (const c of this.crates) {
      c.sprite.destroy();
      c.ring.destroy();
    }
    this.crates.length = 0;

    for (const z of this.spikeZones) {
      for (const sp of z.sprites) sp.destroy();
      z.warningRing.destroy();
    }
    this.spikeZones.length = 0;

    for (const m of this.mines) {
      m.sprite.destroy();
      m.armRing.destroy();
    }
    this.mines.length = 0;

    for (const cz of this.cryoZones) {
      cz.disc.destroy();
    }
    this.cryoZones.length = 0;

    for (const wb of this.warpBeacons) {
      wb.sprite.destroy();
      wb.ring.destroy();
    }
    this.warpBeacons.length = 0;
    this.barriers.length = 0;
    this.pendingEmpBlasts.length = 0;
    this.pendingWarpBlasts.length = 0;
    this.activeEmpCataclysms.length = 0;
    this.activeWarpCataclysms.length = 0;

    this.zoneGraphics.destroy();
    this.barrierGraphics.destroy();
    this.holoGraphics.destroy();
    this.reaperShadowGraphics.destroy();
    this.reaperGraphics.destroy();
    this.reticleGraphics.destroy();
  }
}
