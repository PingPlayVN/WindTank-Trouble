import Phaser from 'phaser';
import { POWERUP_CONFIG } from '../config/gameplayConfig';
import type { Tank } from '../entities/Tank';
import { audioManager } from '../managers/AudioManager';
import type {
  NetBarrierSnapshot,
  NetCrateSnapshot,
  NetCryoZoneSnapshot,
  NetGameEvent,
  NetMineSnapshot,
  NetSpikeZoneSnapshot,
  NetWarpBeaconSnapshot,
} from '../network/PeerMultiplayerManager';
import {
  ALL_SKILL_IDS,
  canPickupCrate,
  computeEmpBlastImpact,
  computeLaserBeam,
  computeReaperBlades,
  computeWarpBlastVictims,
  createSpikeBurstPayload,
  deflectProjectilesAgainstShields,
  drillMazeWallAtPoint,
  ejectTankFromInteriorWalls,
  findBarriersHitByPolyline,
  findDirectCryoBurstVictims,
  findGroundSpikeVictims,
  findTanksInCryoZones,
  findTriggeredMines,
  getSkillDescriptor,
  incinerateProjectilesWithFlames,
  pickMysteryCrateCell,
  removeEnergyBarrierFromArena,
  repelProjectilesWithEmpPulse,
  rollWeightedSkill,
  SKILL_FIRE_HANDLERS,
  steerHomingMissile,
  stepFlameThermodynamics,
  tryApplyCratePickup,
  type CryoZoneState,
  type EnergyBarrierState,
  type GroundSpikeZone,
  type MysteryCrateState,
  type ProximityMineState,
  type WarpBeaconState,
} from '../skills';
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
import type { EffectsSystem } from './EffectsSystem';
import { SeededRng } from './MazeSystem';
import type { ProjectileSystem } from './ProjectileSystem';
import { renderPowerUpFieldVisuals } from './powerups/powerUpFieldRenderer';
import {
  reconcileNetworkWorldEntities,
  serializeNetworkWorldEntities,
} from './powerups/powerUpNetworkSync';
import type {
  ActiveEmpCataclysm,
  ActiveWarpCataclysm,
  CrateVisualEntry,
  CryoZoneVisualEntry,
  MineVisualEntry,
  SpikeZoneVisualEntry,
  WarpBeaconVisualEntry,
} from './powerups/powerUpTypes';

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
      this.spawnIntervalSec > 0
        ? Math.max(0.5, Math.min(initialSpawnTimerSec, this.spawnIntervalSec))
        : 0;

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
    return serializeNetworkWorldEntities(
      this.crates,
      this.mines,
      this.spikeZones,
      this.cryoZones,
      this.barriers,
      this.warpBeacons,
    );
  }

  applyNetworkWorldEntities(
    crates: readonly NetCrateSnapshot[],
    mines: readonly NetMineSnapshot[],
    spikeZones: readonly NetSpikeZoneSnapshot[],
    cryoZones: readonly NetCryoZoneSnapshot[] = [],
    barriers: readonly NetBarrierSnapshot[] = [],
    warpBeacons: readonly NetWarpBeaconSnapshot[] = [],
  ): void {
    reconcileNetworkWorldEntities({
      scene: this.scene,
      arena: this.arena,
      cratesList: this.crates,
      minesList: this.mines,
      spikeZonesList: this.spikeZones,
      cryoZonesList: this.cryoZones,
      barriersList: this.barriers,
      warpBeaconsList: this.warpBeacons,
      onWallsModified: this.onWallsModified,
      crates,
      mines,
      spikeZones,
      cryoZones,
      barriers,
      warpBeacons,
    });
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
    if (!tank.kinematics.alive || !tank.canFire()) {
      return { fired: false, hudDirty: false };
    }

    const skill = tank.getEquippedSkill();
    const scale = this.arena.scaleRatio;

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

    return SKILL_FIRE_HANDLERS[skill]({
      tank,
      walls,
      allTanks,
      arena: this.arena,
      scale,
      rng: this.rng,
      isHeldFire,
      consumeBufferedPress,
      projectileSystem: this.projectileSystem,
      effectsSystem: this.effectsSystem,
      audioManager,
      emitNetEvent: (ev) => this.netEventSink?.(ev),
      allocateEntityId: () => this.nextEntityId++,
      deployMineVisual: (mineState) => this.deployMineVisual(mineState),
      registerBarrier: (barrier) => {
        this.barriers.push(barrier);
        this.onWallsModified?.();
      },
      queueEmpBlast: (x, y, ownerIndex) => {
        this.pendingEmpBlasts.push({ x, y, ownerIndex });
      },
      executeWarpAction: (caster) => this.executeWarpAction(caster),
    });
  }

  private deployMineVisual(mineState: ProximityMineState): void {
    const scale = this.arena.scaleRatio;
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
  }

  private executeWarpAction(tank: Tank): { fired: boolean; hudDirty: boolean } {
    const scale = this.arena.scaleRatio;
    const existingIdx = this.warpBeacons.findIndex((b) => b.state.ownerIndex === tank.index);

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
    audioManager.playTankExplosion();
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
    this.pendingWarpBlasts.push(
      { x: fromX, y: fromY, ownerIndex: tank.index },
      { x: toX, y: toY, ownerIndex: tank.index },
    );
    return { fired: true, hudDirty: true };
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
    tanks: readonly Tank[] = [],
  ): void {
    if (variant === 'cryo_orb') {
      this.spawnCryoZone(x, y, ownerIndex, tanks, true);
    } else if (variant === 'emp_orb') {
      this.pendingEmpBlasts.push({ x, y, ownerIndex });
    }
  }

  triggerEmpCataclysmVisual(
    x: number,
    y: number,
    radius: number,
    arcTargets: Array<{ x: number; y: number; lethal?: boolean }> = [],
  ): void {
    this.activeEmpCataclysms.push({
      x,
      y,
      radius,
      arcTargets,
      age: 0,
      duration: 0.78,
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

  private spawnCryoZone(
    cx: number,
    cy: number,
    ownerIndex: PlayerIndex,
    tanks: readonly Tank[] = [],
    allowOwnerDirectFreeze = true,
  ): void {
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

    if (tanks.length > 0) {
      const burstVictims = findDirectCryoBurstVictims(
        cx,
        cy,
        zoneR,
        ownerIndex,
        allowOwnerDirectFreeze,
        tanks.map((t) => t.kinematics),
      );
      for (const vIdx of burstVictims) {
        const vt = tanks.find((t) => t.index === vIdx);
        if (vt && !vt.isShielded()) {
          const wasFrozen = vt.isFrozen();
          if (vt.applyCryoFreeze(POWERUP_CONFIG.cryoFreezeDurationSec) && !wasFrozen) {
            this.effectsSystem.emitTankFrozen(vt.kinematics.x, vt.kinematics.y);
          }
        }
      }
    }

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
    onSkillHitTank: (victim: Tank, source: 'emp_blast' | 'emp_zap') => void,
  ): boolean {
    let hudDirty = false;
    const scale = this.arena.scaleRatio;
    const blastR = this.arena.cellSize * POWERUP_CONFIG.empBlastCellsRadius;
    const zapR = this.arena.cellSize * POWERUP_CONFIG.empZapCellsRadius;
    const tankKinematics = tanks.map((t) => t.kinematics);

    const hijackedBullets = repelProjectilesWithEmpPulse(
      cx,
      cy,
      blastR,
      ownerIndex,
      this.projectileSystem.getKinematicsList(),
      tankKinematics,
      this.arena.walls,
      scale,
    );
    for (const hb of hijackedBullets) {
      this.effectsSystem.emitShieldDeflect(hb.x, hb.y);
    }

    const impact = computeEmpBlastImpact(
      cx,
      cy,
      blastR,
      ownerIndex,
      tankKinematics,
      this.mines.map((m) => m.state),
      this.barriers,
      zapR,
      this.arena.walls,
    );
    const zappedSet = new Set<PlayerIndex>(impact.zappedEnemyIndices);

    const arcTargets: Array<{ x: number; y: number; lethal?: boolean }> = hijackedBullets.map(
      (b) => ({ x: b.x, y: b.y, lethal: false }),
    );
    for (const vIdx of impact.hitEnemyIndices) {
      const vt = tanks.find((t) => t.index === vIdx);
      if (vt && vt.kinematics.alive) {
        arcTargets.push({
          x: vt.kinematics.x,
          y: vt.kinematics.y,
          lethal: zappedSet.has(vIdx) && !vt.isShielded(),
        });
      }
    }

    audioManager.playEmpBlast();
    this.effectsSystem.emitEmpBlast(cx, cy, blastR);
    this.triggerEmpCataclysmVisual(cx, cy, blastR, arcTargets);
    this.netEventSink?.({
      kind: 'hazard_fx',
      sub: 'emp_blast',
      x: cx,
      y: cy,
      radius: blastR,
    });

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
      const wasShielded = victim.isShielded();
      const jamRes = victim.applyEmpJam(POWERUP_CONFIG.empJamDurationSec);
      if (jamRes.brokeShield || jamRes.interruptedChannel) {
        this.effectsSystem.emitSuitRevert(victim.kinematics.x, victim.kinematics.y);
      }
      if (!wasShielded && zappedSet.has(vIdx)) {
        onSkillHitTank(victim, 'emp_zap');
      } else {
        onSkillHitTank(victim, 'emp_blast');
      }
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
      source: 'laser' | 'reaper' | 'emp_blast' | 'emp_zap' | 'warp_blast',
    ) => void,
    onLaserBeamFired?: (points: Array<{ x: number; y: number }>) => void,
  ): { hudDirty: boolean } {
    let hudDirty = false;
    const scale = this.arena.scaleRatio;
    const tankKinematics = tanks.map((t) => t.kinematics);
    const shieldedIndices = new Set<PlayerIndex>(
      tanks.filter((t) => t.isShielded()).map((t) => t.index),
    );

    if (phase === 'playing' && this.spawnIntervalSec > 0 && this.enabledSkills.length > 0) {
      this.spawnTimerSec -= subDt;
      if (this.spawnTimerSec <= 0) {
        this.spawnTimerSec += this.spawnIntervalSec;
        this.spawnMysteryCrate(undefined, undefined, tankKinematics);
      }
    }

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
      const bladeLen = this.arena.cellSize * POWERUP_CONFIG.reaperBladeCellsLength * extend;
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

    while (this.pendingEmpBlasts.length > 0) {
      const ev = this.pendingEmpBlasts.shift()!;
      if (this.executeEmpBlast(ev.x, ev.y, ev.ownerIndex, tanks, onSkillHitTank)) {
        hudDirty = true;
      }
    }

    const warpHitKeys = new Set<string>();
    while (this.pendingWarpBlasts.length > 0) {
      const ev = this.pendingWarpBlasts.shift()!;
      const blastR = POWERUP_CONFIG.warpBlastRadius * scale;

      for (let mIdx = this.mines.length - 1; mIdx >= 0; mIdx--) {
        const m = this.mines[mIdx];
        if (
          Math.hypot(m.state.x - ev.x, m.state.y - ev.y) <=
          blastR + m.state.triggerRadius * 0.35
        ) {
          this.effectsSystem.emitMineExplosion(m.state.x, m.state.y);
          m.sprite.destroy();
          m.armRing.destroy();
          this.mines.splice(mIdx, 1);
        }
      }

      const victims = computeWarpBlastVictims(
        ev.x,
        ev.y,
        ev.ownerIndex,
        blastR,
        tanks.map((t) => t.kinematics),
      );
      for (const vIdx of victims) {
        const hitKey = `${ev.ownerIndex}:${vIdx}`;
        if (warpHitKeys.has(hitKey)) continue;
        warpHitKeys.add(hitKey);
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
      source: 'ground_spike' | 'mine' | 'emp_blast' | 'emp_zap' | 'warp_blast',
    ) => void,
  ): boolean {
    let hudDirty = false;
    const tankKinematics = tanks.map((t) => t.kinematics);
    const shieldedIndices = new Set<PlayerIndex>(
      tanks.filter((t) => t.isShielded()).map((t) => t.index),
    );

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
          const wasFrozen = victim.isFrozen();
          if (victim.applyCryoFreeze(POWERUP_CONFIG.cryoFreezeDurationSec) && !wasFrozen) {
            this.effectsSystem.emitTankFrozen(victim.kinematics.x, victim.kinematics.y);
          }
        }
        const allowOwnerBurst =
          hit.victimIndex === hit.ownerIndex ||
          proj.kinematics.bounces > 0 ||
          proj.kinematics.age >= 0.16;
        this.spawnCryoZone(hit.x, hit.y, hit.ownerIndex, tanks, allowOwnerBurst);
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
    renderPowerUpFieldVisuals({
      dt,
      animClock: this.animClock,
      arena: this.arena,
      tanks,
      crates: this.crates,
      spikeZones: this.spikeZones,
      mines: this.mines,
      cryoZones: this.cryoZones,
      barriers: this.barriers,
      warpBeacons: this.warpBeacons,
      activeEmpCataclysms: this.activeEmpCataclysms,
      activeWarpCataclysms: this.activeWarpCataclysms,
      huntedTargetIndices: this.huntedTargetIndices,
      zoneGraphics: this.zoneGraphics,
      barrierGraphics: this.barrierGraphics,
      holoGraphics: this.holoGraphics,
      reticleGraphics: this.reticleGraphics,
      reaperShadowGraphics: this.reaperShadowGraphics,
      reaperGraphics: this.reaperGraphics,
    });
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
