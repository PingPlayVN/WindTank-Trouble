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
import { SeededRng } from './MazeSystem';
import {
  canPickupCrate,
  computeLaserBeam,
  computeReaperBlades,
  computeScatterAngles,
  createSpikeBurstPayload,
  deflectProjectilesAgainstShields,
  drillMazeWallAtPoint,
  findGroundSpikeVictims,
  findTriggeredMines,
  incinerateProjectilesWithFlames,
  pickMysteryCrateCell,
  rollWeightedSkill,
  steerHomingMissile,
  stepFlameThermodynamics,
  tryApplyCratePickup,
  type GroundSpikeZone,
  type MysteryCrateState,
  type ProximityMineState,
} from './PowerUpSim';
import type { ProjectileSystem } from './ProjectileSystem';
import type {
  NetCrateSnapshot,
  NetGameEvent,
  NetMineSnapshot,
  NetSpikeZoneSnapshot,
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

  private readonly crates: CrateVisualEntry[] = [];
  private readonly spikeZones: SpikeZoneVisualEntry[] = [];
  private readonly mines: MineVisualEntry[] = [];
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

  getGroundHazardCount(): number {
    return this.spikeZones.length + this.mines.length;
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
    };
  }

  applyNetworkWorldEntities(
    crates: readonly NetCrateSnapshot[],
    mines: readonly NetMineSnapshot[],
    spikeZones: readonly NetSpikeZoneSnapshot[],
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
  ): { fired: boolean; hudDirty: boolean } {
    if (!tank.kinematics.alive || !tank.canFire()) {
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

    // 8. Reaper (360-deg Twin Plasma Scythe Overdrive!)
    if (skill === 'reaper') {
      tank.startReaperSweep();
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

    // 11. Homing Missile (4.0s bounce -> shortest-path maze seeker!)
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

    return { fired: false, hudDirty: false };
  }

  preProjectileSubStep(
    subDt: number,
    tanks: readonly Tank[],
    phase: RoundPhase,
    onSkillHitTank: (victim: Tank, source: 'laser' | 'reaper') => void,
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

      if (tank.consumeReaperUnfurlEvent()) {
        this.effectsSystem.emitReaperUnfurlBurst(tank.kinematics.x, tank.kinematics.y);
      }

      if (!tank.isReaperSweeping()) continue;
      const extend = tank.getReaperExtendProgress();
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
      );
      if (emitReaperSparks) {
        const tipA = sweep.crescentA[sweep.crescentA.length - 1];
        const tipB = sweep.crescentB[sweep.crescentB.length - 1];
        this.effectsSystem.emitReaperSpark(sweep.bladeA.x1, sweep.bladeA.y1);
        this.effectsSystem.emitReaperSpark(sweep.bladeB.x1, sweep.bladeB.y1);
        this.effectsSystem.emitReaperSpark(tipA.x, tipA.y);
        this.effectsSystem.emitReaperSpark(tipB.x, tipB.y);
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

    return { hudDirty };
  }

  postProjectileSubStep(
    subDt: number,
    tanks: readonly Tank[],
    hits: readonly ProjectileHitEvent[],
    onHazardHitTank: (victim: Tank, source: 'ground_spike' | 'mine') => void,
  ): void {
    const tankKinematics = tanks.map((t) => t.kinematics);
    const shieldedIndices = new Set<PlayerIndex>(
      tanks.filter((t) => t.isShielded()).map((t) => t.index),
    );

    // 1. Spike Ball impact or 3.0s timed detonation
    for (const hit of hits) {
      const proj = this.projectileSystem.getProjectileById(hit.projectileId);
      if (proj && proj.kinematics.variant === 'spike_ball') {
        this.detonateSpikeBall(hit.x, hit.y, hit.ownerIndex);
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

    // Draw Twin Giant Obsidian-Black & Blood-Crimson Crescent Scythes + Shadow Afterimages!
    this.reaperShadowGraphics.clear();
    this.reaperGraphics.clear();
    for (const tank of tanks) {
      if (!tank.kinematics.alive || !tank.isReaperSweeping()) continue;
      const extend = tank.getReaperExtendProgress();
      const bladeLen =
        this.arena.cellSize * POWERUP_CONFIG.reaperBladeCellsLength * extend;
      const cx = tank.kinematics.x;
      const cy = tank.kinematics.y;

      const drawScytheAtAngle = (ang: number, alphaMul: number, isPrimary: boolean) => {
        const sweep = computeReaperBlades(cx, cy, ang, tank.index, bladeLen, [], scale);
        const x0 = sweep.bladeB.x1;
        const y0 = sweep.bladeB.y1;
        const x1 = sweep.bladeA.x1;
        const y1 = sweep.bladeA.y1;

        // 1A. Obsidian-Black Abyssal Core Shroud (`NORMAL` blend so pure black pops boldly!)
        this.reaperShadowGraphics.lineStyle(26 * scale, 0x090a0e, 0.76 * alphaMul);
        this.reaperShadowGraphics.lineBetween(x0, y0, x1, y1);
        this.reaperShadowGraphics.lineStyle(12 * scale, 0x16181f, 0.92 * alphaMul);
        this.reaperShadowGraphics.lineBetween(x0, y0, x1, y1);

        // 1B. Blood-Crimson Plasma Aura & Scarlet Lightning (`ADD` blend)
        this.reaperGraphics.lineStyle(22 * scale, 0xb71c1c, 0.36 * alphaMul);
        this.reaperGraphics.lineBetween(x0, y0, x1, y1);
        this.reaperGraphics.lineStyle(9.5 * scale, 0xff1744, 0.88 * alphaMul);
        this.reaperGraphics.lineBetween(x0, y0, x1, y1);
        if (isPrimary) {
          this.reaperGraphics.lineStyle(3.8 * scale, 0xffebee, 0.96);
          this.reaperGraphics.lineBetween(x0, y0, x1, y1);

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

        // 2. Twin Transverse Obsidian-Black + Blood-Crimson Crescent Scythe Blades (`Lưỡi Liềm`)!
        const drawCrescentHead = (outerPts: ReadonlyArray<{ x: number; y: number }>, dirSign: 1 | -1) => {
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
            const inset = bladeLen * 0.135 * arch;
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

      // Dark-crimson shadow wakes trailing behind the slow, menacing 180-deg sweep!
      drawScytheAtAngle(tank.kinematics.angle - 0.14, 0.22, false);
      drawScytheAtAngle(tank.kinematics.angle - 0.07, 0.44, false);
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

    this.reaperShadowGraphics.destroy();
    this.reaperGraphics.destroy();
    this.reticleGraphics.destroy();
  }
}
