import assert from 'node:assert/strict';
import test from 'node:test';
import { POWERUP_CONFIG } from '../src/game/config/gameplayConfig';
import { buildArenaLayout } from '../src/game/maps/MazeBuilder';
import {
  canPickupCrate,
  pickMysteryCrateCell,
  rollWeightedSkill,
  tryApplyCratePickup,
} from '../src/game/skills/crateSim';
import { drillMazeWallAtPoint } from '../src/game/skills/items/drillSkill';
import { incinerateProjectilesWithFlames } from '../src/game/skills/items/flameSkill';
import { steerHomingMissile } from '../src/game/skills/items/homingSkill';
import { computeLaserBeam } from '../src/game/skills/items/laserSkill';
import { findTriggeredMines } from '../src/game/skills/items/mineSkill';
import { computeReaperBlades } from '../src/game/skills/items/reaperSkill';
import { computeScatterAngles } from '../src/game/skills/items/scatterSkill';
import { deflectProjectilesAgainstShields } from '../src/game/skills/items/shieldSkill';
import { createSpikeBurstPayload, findGroundSpikeVictims } from '../src/game/skills/items/spikeSkill';
import type { GroundSpikeZone, ProximityMineState } from '../src/game/skills/types';
import { stepProjectilesSimulation } from '../src/game/systems/CollisionSystem';
import { createEmptySolidGrid, generateProceduralMaze, SeededRng } from '../src/game/systems/MazeSystem';
import type { ProjectileKinematics, TankKinematics } from '../src/game/types/gameTypes';

test('Weighted crate drops match 36/28/22/14 power distribution and place crates safely', () => {
  const rng = new SeededRng(20261126);
  const counts: Record<string, number> = {};
  const total = 10000;
  for (let i = 0; i < total; i++) {
    const sk = rollWeightedSkill(rng);
    counts[sk] = (counts[sk] ?? 0) + 1;
  }
  // All 15 skills must appear and match their configured drop weights summing to 100%
  const expected: Record<string, number> = {
    scatter: 0.11,
    gatling: 0.1,
    mine: 0.09,
    cryo: 0.08,
    flame: 0.08,
    barrier: 0.08,
    spike: 0.07,
    emp: 0.07,
    drill: 0.07,
    shield: 0.06,
    phantom: 0.06,
    homing: 0.05,
    warp: 0.04,
    laser: 0.02,
    reaper: 0.02,
  };
  for (const [id, ratio] of Object.entries(expected)) {
    const actual = (counts[id] ?? 0) / total;
    assert.ok(Math.abs(actual - ratio) < 0.02, `${id} ratio=${actual}, expected=${ratio}`);
  }

  const grid = generateProceduralMaze(9, 6, 77);
  const arena = buildArenaLayout(grid, 2, 77);
  const tanks: TankKinematics[] = arena.spawns.map((s, idx) => ({
    index: idx as 0 | 1,
    x: s.x,
    y: s.y,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  }));
  const cell = pickMysteryCrateCell(arena, tanks, [], [], rng);
  assert.ok(cell !== null);
  assert.ok(cell.x > arena.originX && cell.x < arena.originX + arena.width);
});

test('Crate pickup replaces unspent Gatling ammo cleanly but ignores crates during 2s Laser charge lock', () => {
  const holdingGatling = { skill: 'gatling' as const, ammo: 12, chargingLaserRemaining: 0 };
  const resReplace = tryApplyCratePickup(holdingGatling, 'spike');
  assert.equal(resReplace.pickedUp, true);
  assert.equal(resReplace.nextState.skill, 'spike');
  assert.equal(resReplace.nextState.ammo, 1);

  const chargingLaser = { skill: 'laser' as const, ammo: 1, chargingLaserRemaining: 1.35 };
  const resBlocked = tryApplyCratePickup(chargingLaser, 'gatling');
  assert.equal(resBlocked.pickedUp, false);
  assert.equal(resBlocked.nextState.skill, 'laser');
  assert.equal(resBlocked.nextState.chargingLaserRemaining, 1.35);
});

test('canPickupCrate blocks crate pickup while Laser is charging or pending discharge', () => {
  assert.equal(canPickupCrate({ skill: null, ammo: 0, chargingLaserRemaining: 0 }, false), true);
  assert.equal(canPickupCrate({ skill: 'laser', ammo: 1, chargingLaserRemaining: 0.5 }, false), false);
  assert.equal(canPickupCrate({ skill: 'laser', ammo: 1, chargingLaserRemaining: 0 }, true), false);
});

test('Laser pierces walls across the entire map, curves parabolically within +-15 deg, and ignores >15 deg or rear rivals', () => {
  const grid = generateProceduralMaze(10, 6, 99);
  const arena = buildArenaLayout(grid, 2, 99);
  const muzzleX = arena.originX + 90;
  const muzzleY = arena.originY + arena.height / 2;

  // Case A: Rival at +11 deg (inside +-15 deg cone) behind maze walls -> must curve parabolically and hit!
  const angle11Rad = (11 * Math.PI) / 180;
  const dist = 360;
  const rivalInCone: TankKinematics = {
    index: 1,
    x: muzzleX + Math.cos(angle11Rad) * dist,
    y: muzzleY + Math.sin(angle11Rad) * dist,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };
  const shooter: TankKinematics = {
    index: 0,
    x: muzzleX - 20,
    y: muzzleY,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };

  const curved = computeLaserBeam(muzzleX, muzzleY, 0, 0, [shooter, rivalInCone], arena);
  assert.equal(curved.lockedTargetIndex, 1, 'Must lock onto rival at +11 deg');
  assert.deepEqual(curved.hitVictimIndices, [1], 'Must pierce walls and obliterate rival without hitting shooter');
  const endPt = curved.points[curved.points.length - 1];
  assert.ok(
    endPt.x >= arena.originX + arena.width - 2 ||
      endPt.y <= arena.originY + 2 ||
      endPt.y >= arena.originY + arena.height - 2,
    'Laser must span all the way to the far arena boundary',
  );

  // Case B: Rival at +17 deg (outside +-15 deg) and Rival behind shooter (-175 deg) -> straight beam, 0 hits!
  const angle17Rad = (17 * Math.PI) / 180;
  const rivalOutCone: TankKinematics = {
    ...rivalInCone,
    x: muzzleX + Math.cos(angle17Rad) * 320,
    y: muzzleY + Math.sin(angle17Rad) * 320,
  };
  const rivalBehind: TankKinematics = {
    ...rivalInCone,
    index: 2,
    x: muzzleX - 80,
    y: muzzleY + 2,
  };
  const straight = computeLaserBeam(muzzleX, muzzleY, 0, 0, [shooter, rivalOutCone, rivalBehind], arena);
  assert.equal(straight.lockedTargetIndex, null, 'Must NOT lock onto 17 deg or rear rival');
  assert.deepEqual(straight.hitVictimIndices, []);
  for (const pt of straight.points) {
    assert.ok(Math.abs(pt.y - muzzleY) < 0.01, 'Unlocked laser must remain perfectly straight');
  }
});

test('Spike burst spawns 16 shrapnel vectors and wall-occluded lethal ground spikes', () => {
  // Build a 3x2 grid with a solid vertical wall separating col 0 and col 1 at row 0
  const grid = createEmptySolidGrid('spike_test', 'Spike Test', 3, 2, 1);
  grid.hWalls[1][0] = false;
  grid.vWalls[1][1] = false;
  grid.vWalls[1][2] = false;
  grid.hWalls[1][2] = false;
  // Note: grid.vWalls[0][1] remains TRUE (solid wall between (0,0) and (1,0))!
  const arena = buildArenaLayout(grid, 2, 1);
  const rng = new SeededRng(55);

  // Detonate right next to the left side of vertical wall vWalls[0][1]
  const wallX = arena.originX + arena.cellSize;
  const blastX = wallX - 10;
  const blastY = arena.originY + arena.cellSize * 0.5;

  const payload = createSpikeBurstPayload(blastX, blastY, arena, rng);
  assert.equal(payload.shrapnelVelocities.length, 16);
  assert.ok(payload.groundNodes.length >= 8);

  // No ground spike node should cross through the solid wall into x > wallX!
  for (const node of payload.groundNodes) {
    assert.ok(node.x <= wallX, `Ground spike leaked through wall: node.x=${node.x} > wallX=${wallX}`);
  }

  const zone: GroundSpikeZone = {
    id: 1,
    ownerIndex: 0,
    x: blastX,
    y: blastY,
    age: 0.5,
    duration: 5.0,
    nodes: payload.groundNodes,
  };

  // Tank parked right across the solid wall at wallX + 18 must be SAFE; shooter standing on blastX must DIE
  const shooterOnSpikes: TankKinematics = {
    index: 0,
    x: blastX - 4,
    y: blastY,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 14 * arena.scaleRatio,
    alive: true,
  };
  const rivalBehindWall: TankKinematics = {
    index: 1,
    x: wallX + 18,
    y: blastY,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 14 * arena.scaleRatio,
    alive: true,
  };

  const victims = findGroundSpikeVictims([zone], [shooterOnSpikes, rivalBehindWall]);
  assert.deepEqual(victims, [0], 'Spikes kill tank on blast side (including shooter) but never through a solid wall');
});

test('Homing missile bounces for 2.5s then navigates shortest maze path, targeting nearest maze tank (including shooter) and sliding off walls', () => {
  // 4x2 U-shaped corridor
  const grid = createEmptySolidGrid('homing_u', 'Homing U', 4, 2, 1);
  grid.hWalls[1][0] = false;
  grid.vWalls[1][1] = false;
  grid.vWalls[1][2] = false;
  grid.vWalls[1][3] = false;
  grid.hWalls[1][3] = false;
  grid.vWalls[0][2] = false;
  grid.vWalls[0][3] = false;

  const arena = buildArenaLayout(grid, 2, 1);
  const cellCenter = (c: number, r: number) => ({
    x: arena.originX + (c + 0.5) * arena.cellSize,
    y: arena.originY + (r + 0.5) * arena.cellSize,
  });

  const mStart = cellCenter(0, 0);
  const shooterPos = cellCenter(1, 1);
  const rivalPos = cellCenter(1, 0);

  const shooter: TankKinematics = {
    index: 0,
    x: shooterPos.x,
    y: shooterPos.y,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };
  const rival: TankKinematics = {
    index: 1,
    x: rivalPos.x,
    y: rivalPos.y,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };

  const missile: ProjectileKinematics = {
    id: 99,
    ownerIndex: 0,
    x: mStart.x,
    y: mStart.y,
    prevX: mStart.x,
    prevY: mStart.y,
    vx: 260,
    vy: 0,
    radius: 4.8 * arena.scaleRatio,
    age: POWERUP_CONFIG.homingBallisticSec - 0.3,
    maxLifetime: POWERUP_CONFIG.homingTotalLifetimeSec,
    bounces: 13,
    maxBounces: 14,
    graceTimer: 0,
    active: true,
    variant: 'homing_missile',
    bounceBehavior: 'reflect',
  };

  const beforeLock = steerHomingMissile(missile, [shooter, rival], arena, 1 / 60);
  assert.equal(beforeLock.seeking, false);

  missile.age = POWERUP_CONFIG.homingBallisticSec + 0.05;
  const atLock = steerHomingMissile(missile, [shooter, rival], arena, 1 / 60);
  assert.equal(atLock.seeking, true);
  assert.equal(atLock.targetIndex, 0, 'Must target shooter P0 who is closer via open maze path than wall-blocked P1');

  let hitVictim: number | null = null;
  for (let step = 0; step < 240 && missile.active; step++) {
    steerHomingMissile(missile, [shooter, rival], arena, 1 / 60);
    const res = stepProjectilesSimulation([missile], [shooter, rival], arena.walls, 1 / 60);
    if (res.hits.length > 0) {
      hitVictim = res.hits[0].victimIndex;
      break;
    }
  }
  assert.equal(hitVictim, 0, 'Seeker missile must navigate the corner without dying on wall graze and hit P0');

  const m2Pos = cellCenter(2, 1);
  missile.active = true;
  missile.x = m2Pos.x;
  missile.y = m2Pos.y;
  shooter.x = cellCenter(1, 0).x;
  shooter.y = cellCenter(1, 0).y;
  rival.x = cellCenter(3, 1).x;
  rival.y = cellCenter(3, 1).y;
  const retargeted = steerHomingMissile(missile, [shooter, rival], arena, 1 / 60);
  assert.equal(retargeted.targetIndex, 1, 'Must immediately switch target to Rival P1 when P1 becomes closer');
});

test('Aegis Shield reflects incoming projectiles, hijacks ownership, and protects tank', () => {
  const shieldedTank: TankKinematics = {
    index: 1,
    x: 300,
    y: 200,
    vx: 0,
    vy: 0,
    angle: Math.PI,
    radius: 14.5,
    alive: true,
  };
  const incoming: ProjectileKinematics = {
    id: 7,
    ownerIndex: 0,
    x: 282,
    y: 200,
    prevX: 274,
    prevY: 200,
    vx: 296,
    vy: 0,
    radius: 4.5,
    age: 0.4,
    maxLifetime: 10,
    bounces: 0,
    maxBounces: 14,
    graceTimer: 0,
    active: true,
    variant: 'standard',
  };

  const reflected = deflectProjectilesAgainstShields([incoming], [shieldedTank], new Set([1]), 1.0);
  assert.equal(reflected.length, 1);
  assert.equal(incoming.ownerIndex, 1, 'Shielded tank must hijack deflected bullet ownership');
  assert.ok(incoming.vx < -300, 'Deflected bullet must bounce back faster toward attacker');
  assert.equal(incoming.active, true);
});

test('Drill carves interior maze walls and updates arena.walls while leaving outer border intact', () => {
  const grid = createEmptySolidGrid('drill_test', 'Drill Test', 3, 2, 1);
  grid.hWalls[1][0] = false;
  grid.vWalls[1][1] = false;
  grid.vWalls[1][2] = false;
  grid.hWalls[1][2] = false;
  const arena = buildArenaLayout(grid, 2, 1);

  assert.equal(arena.grid.vWalls[0][1], true);
  const interiorWallX = arena.originX + arena.cellSize;
  const interiorWallY = arena.originY + arena.cellSize * 0.5;

  const carvedInterior = drillMazeWallAtPoint(arena, interiorWallX, interiorWallY);
  assert.equal(carvedInterior.carved, true, 'Must carve interior vertical wall');
  assert.equal(arena.grid.vWalls[0][1], false, 'Grid matrix must open so pathfinding sees new shortcut');

  // Outer perimeter left border (x = arena.originX) must NEVER be carved!
  const carvedBorder = drillMazeWallAtPoint(arena, arena.originX, interiorWallY);
  assert.equal(carvedBorder.carved, false, 'Outer arena perimeter wall must remain indestructible');
  assert.equal(arena.grid.vWalls[0][0], true);
});

test('Shadow Mines ignore tanks while arming, then trigger on proximity or projectile hit after arming', () => {
  const mine: ProximityMineState = {
    id: 1,
    ownerIndex: 0,
    x: 200,
    y: 200,
    age: 0.8, // < 1.6s arming time!
    armingSec: 1.6,
    duration: 28,
    triggerRadius: 26,
    blastRadius: 48,
  };
  const tankOnMine: TankKinematics = {
    index: 0,
    x: 205,
    y: 200,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 14.5,
    alive: true,
  };

  assert.equal(
    findTriggeredMines([mine], [tankOnMine], []).length,
    0,
    'Unarmed mine must not explode under planter',
  );

  mine.age = 2.0; // Armed & cloaked!
  const triggered = findTriggeredMines([mine], [tankOnMine], []);
  assert.equal(triggered.length, 1);
  assert.deepEqual(triggered[0].victimIndices, [0]);
});

test('Flame stream incinerates enemy projectiles, Scatter computes 5 fan angles, and Reaper sweeps twin piercing blades', () => {
  const flameProj: ProjectileKinematics = {
    id: 1,
    ownerIndex: 0,
    x: 300,
    y: 300,
    prevX: 295,
    prevY: 300,
    vx: 180,
    vy: 0,
    radius: 11,
    age: 0.2,
    maxLifetime: 0.55,
    bounces: 0,
    maxBounces: 4,
    graceTimer: 0,
    active: true,
    variant: 'flame',
  };
  const enemyShell: ProjectileKinematics = {
    ...flameProj,
    id: 2,
    ownerIndex: 1,
    x: 308,
    y: 300,
    vx: -296,
    radius: 4.5,
    variant: 'standard',
  };
  const burned = incinerateProjectilesWithFlames([flameProj, enemyShell]);
  assert.equal(burned.length, 1);
  assert.equal(enemyShell.active, false, 'Enemy bullet touching flame cone must be incinerated');
  assert.equal(flameProj.active, true, 'Flame stream itself continues');

  const fanAngles = computeScatterAngles(0);
  assert.equal(fanAngles.length, 5);
  assert.ok(fanAngles[0] < fanAngles[2] && fanAngles[4] > fanAngles[2]);

  const shooter: TankKinematics = {
    index: 0,
    x: 400,
    y: 300,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 14.5,
    alive: true,
  };
  const rivalFront: TankKinematics = { ...shooter, index: 1, x: 510, y: 302 };
  const rivalBack: TankKinematics = { ...shooter, index: 2, x: 295, y: 298 };
  const rivalFar: TankKinematics = { ...shooter, index: 3, x: 750, y: 300 };

  const reaper = computeReaperBlades(400, 300, 0, 0, 140, [shooter, rivalFront, rivalBack, rivalFar], 1.0);
  assert.deepEqual(reaper.hitVictimIndices.sort(), [1, 2], 'Twin 180-deg Reaper blades hit front & rear rivals within range');
});
