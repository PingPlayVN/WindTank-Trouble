import type Phaser from 'phaser';
import { POWERUP_CONFIG } from '../../config/gameplayConfig';
import { rebuildArenaWalls } from '../../maps/MazeBuilder';
import type {
  NetBarrierSnapshot,
  NetCrateSnapshot,
  NetCryoZoneSnapshot,
  NetMineSnapshot,
  NetSpikeZoneSnapshot,
  NetWarpBeaconSnapshot,
} from '../../network/PeerMultiplayerManager';
import { removeEnergyBarrierFromArena } from '../../skills/items/barrierSkill';
import type { EnergyBarrierState } from '../../skills/types';
import type { BuiltArenaLayout } from '../../types/gameTypes';
import type {
  CrateVisualEntry,
  CryoZoneVisualEntry,
  MineVisualEntry,
  SpikeZoneVisualEntry,
  WarpBeaconVisualEntry,
} from './powerUpTypes';

export function serializeNetworkWorldEntities(
  crates: readonly CrateVisualEntry[],
  mines: readonly MineVisualEntry[],
  spikeZones: readonly SpikeZoneVisualEntry[],
  cryoZones: readonly CryoZoneVisualEntry[],
  barriers: readonly EnergyBarrierState[],
  warpBeacons: readonly WarpBeaconVisualEntry[],
): {
  crates: NetCrateSnapshot[];
  mines: NetMineSnapshot[];
  spikeZones: NetSpikeZoneSnapshot[];
  cryoZones: NetCryoZoneSnapshot[];
  barriers: NetBarrierSnapshot[];
  warpBeacons: NetWarpBeaconSnapshot[];
} {
  return {
    crates: crates.map((c) => ({
      id: c.state.id,
      x: Math.round(c.state.x * 10) / 10,
      y: Math.round(c.state.y * 10) / 10,
      radius: Math.round(c.state.radius * 10) / 10,
    })),
    mines: mines.map((m) => ({
      id: m.state.id,
      ownerIndex: m.state.ownerIndex,
      x: Math.round(m.state.x * 10) / 10,
      y: Math.round(m.state.y * 10) / 10,
      age: Math.round(m.state.age * 100) / 100,
      armingSec: m.state.armingSec,
      triggerRadius: Math.round(m.state.triggerRadius * 10) / 10,
    })),
    spikeZones: spikeZones.map((z) => ({
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
    cryoZones: cryoZones.map((z) => ({
      id: z.state.id,
      ownerIndex: z.state.ownerIndex,
      x: Math.round(z.state.x * 10) / 10,
      y: Math.round(z.state.y * 10) / 10,
      radius: Math.round(z.state.radius * 10) / 10,
      age: Math.round(z.state.age * 100) / 100,
      duration: z.state.duration,
    })),
    barriers: barriers.map((b) => ({
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
    warpBeacons: warpBeacons.map((b) => ({
      id: b.state.id,
      ownerIndex: b.state.ownerIndex,
      x: Math.round(b.state.x * 10) / 10,
      y: Math.round(b.state.y * 10) / 10,
      age: Math.round(b.state.age * 100) / 100,
      maxDuration: b.state.maxDuration,
    })),
  };
}

export function reconcileNetworkWorldEntities(params: {
  scene: Phaser.Scene;
  arena: BuiltArenaLayout;
  cratesList: CrateVisualEntry[];
  minesList: MineVisualEntry[];
  spikeZonesList: SpikeZoneVisualEntry[];
  cryoZonesList: CryoZoneVisualEntry[];
  barriersList: EnergyBarrierState[];
  warpBeaconsList: WarpBeaconVisualEntry[];
  onWallsModified?: () => void;
  crates: readonly NetCrateSnapshot[];
  mines: readonly NetMineSnapshot[];
  spikeZones: readonly NetSpikeZoneSnapshot[];
  cryoZones: readonly NetCryoZoneSnapshot[];
  barriers: readonly NetBarrierSnapshot[];
  warpBeacons: readonly NetWarpBeaconSnapshot[];
}): void {
  const {
    scene,
    arena,
    cratesList,
    minesList,
    spikeZonesList,
    cryoZonesList,
    barriersList,
    warpBeaconsList,
    onWallsModified,
    crates,
    mines,
    spikeZones,
    cryoZones,
    barriers,
    warpBeacons,
  } = params;
  const scale = arena.scaleRatio;

  // 1. Reconcile Crates
  const crateIds = new Set(crates.map((c) => c.id));
  for (let i = cratesList.length - 1; i >= 0; i--) {
    if (!crateIds.has(cratesList[i].state.id)) {
      cratesList[i].sprite.destroy();
      cratesList[i].ring.destroy();
      cratesList.splice(i, 1);
    }
  }
  for (const c of crates) {
    const existing = cratesList.find((e) => e.state.id === c.id);
    if (!existing) {
      const ring = scene.add
        .circle(c.x, c.y, c.radius * 1.45)
        .setStrokeStyle(2, 0xffb300, 0.55)
        .setFillStyle(0xffe082, 0.14)
        .setDepth(9);
      const sprite = scene.add
        .image(c.x, c.y, 'pickup_wood_crate')
        .setScale(scale * 0.72)
        .setDepth(11);
      cratesList.push({
        state: { id: c.id, col: 0, row: 0, x: c.x, y: c.y, radius: c.radius, spawnAge: 0 },
        sprite,
        ring,
      });
    }
  }

  // 2. Reconcile Mines
  const mineIds = new Set(mines.map((m) => m.id));
  for (let i = minesList.length - 1; i >= 0; i--) {
    if (!mineIds.has(minesList[i].state.id)) {
      minesList[i].sprite.destroy();
      minesList[i].armRing.destroy();
      minesList.splice(i, 1);
    }
  }
  for (const m of mines) {
    const existing = minesList.find((e) => e.state.id === m.id);
    if (existing) {
      existing.state.age = m.age;
    } else {
      const armRing = scene.add
        .circle(m.x, m.y, m.triggerRadius)
        .setStrokeStyle(1.6, 0xff1744, 0.55)
        .setFillStyle(0xff1744, 0.08)
        .setDepth(6);
      const sprite = scene.add
        .image(m.x, m.y, 'pickup_mine')
        .setScale(scale * 0.88)
        .setDepth(8);
      minesList.push({
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
  for (let i = spikeZonesList.length - 1; i >= 0; i--) {
    if (!zoneIds.has(spikeZonesList[i].state.id)) {
      for (const sp of spikeZonesList[i].sprites) sp.destroy();
      spikeZonesList[i].warningRing.destroy();
      spikeZonesList.splice(i, 1);
    }
  }
  for (const z of spikeZones) {
    const existing = spikeZonesList.find((e) => e.state.id === z.id);
    if (existing) {
      existing.state.age = z.age;
    } else {
      const warningRing = scene.add
        .circle(z.x, z.y, POWERUP_CONFIG.spikeGroundRadius * scale)
        .setStrokeStyle(1.8, 0xd32f2f, 0.42)
        .setFillStyle(0xd32f2f, 0.07)
        .setDepth(6);
      const sprites = z.nodes.map((node) =>
        scene.add
          .image(node.x, node.y, 'decal_ground_spike')
          .setRotation(node.angle)
          .setScale(scale * 0.86)
          .setDepth(7),
      );
      spikeZonesList.push({
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
  for (let i = cryoZonesList.length - 1; i >= 0; i--) {
    if (!cryoIds.has(cryoZonesList[i].state.id)) {
      cryoZonesList[i].disc.destroy();
      cryoZonesList.splice(i, 1);
    }
  }
  for (const z of cryoZones) {
    const existing = cryoZonesList.find((e) => e.state.id === z.id);
    if (existing) {
      existing.state.age = z.age;
    } else {
      const disc = scene.add
        .circle(z.x, z.y, z.radius, 0x072638, 0.56)
        .setStrokeStyle(3.0 * scale, 0x041824, 0.88)
        .setDepth(5.5);
      cryoZonesList.push({
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
  for (let i = barriersList.length - 1; i >= 0; i--) {
    if (!barrierIds.has(barriersList[i].id)) {
      removeEnergyBarrierFromArena(barriersList[i], arena);
      barriersList.splice(i, 1);
      wallsChanged = true;
    }
  }
  for (const b of barriers) {
    const existing = barriersList.find((e) => e.id === b.id);
    if (existing) {
      existing.age = b.age;
    } else {
      if (b.kind === 'h' && arena.grid.hWalls[b.r]?.[b.c] !== undefined) {
        arena.grid.hWalls[b.r][b.c] = true;
      } else if (b.kind === 'v' && arena.grid.vWalls[b.r]?.[b.c] !== undefined) {
        arena.grid.vWalls[b.r][b.c] = true;
      }
      barriersList.push({ ...b });
      wallsChanged = true;
    }
  }
  if (wallsChanged) {
    rebuildArenaWalls(arena);
    onWallsModified?.();
  }

  // 6. Reconcile Spatial Warp Beacons
  const beaconIds = new Set(warpBeacons.map((b) => b.id));
  for (let i = warpBeaconsList.length - 1; i >= 0; i--) {
    if (!beaconIds.has(warpBeaconsList[i].state.id)) {
      warpBeaconsList[i].sprite.destroy();
      warpBeaconsList[i].ring.destroy();
      warpBeaconsList.splice(i, 1);
    }
  }
  for (const b of warpBeacons) {
    const existing = warpBeaconsList.find((e) => e.state.id === b.id);
    if (existing) {
      existing.state.age = b.age;
    } else {
      const ring = scene.add
        .circle(b.x, b.y, 18 * scale)
        .setStrokeStyle(2.2 * scale, 0xe040fb, 0.78)
        .setFillStyle(0xea80fc, 0.14)
        .setDepth(6.5);
      const sprite = scene.add
        .image(b.x, b.y, 'pickup_warp_beacon')
        .setScale(scale * 0.85)
        .setDepth(8.5);
      warpBeaconsList.push({
        state: { ...b },
        sprite,
        ring,
      });
    }
  }
}
