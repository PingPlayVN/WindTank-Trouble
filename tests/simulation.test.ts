import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARENA_VIEWPORT,
  BASE_GAMEPLAY,
  computeMobileLogicalWidth,
  CROSS_PLATFORM_ARENA_VIEWPORT,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  getSkillDescriptor,
  isTouchDeviceDetected,
  MOBILE_ARENA_VIEWPORT,
  normalizeCrateSpawnInterval,
  parseCustomIntervalInput,
  parseCustomScoreInput,
  POWERUP_CONFIG,
  resolveLocalMobileArenaViewport,
  resolveOnlineArenaViewport,
  stepCrateSpawnInterval,
  stepWinningScore,
} from '../src/game/config/constants';
import {
  extractRoomCodeFromSearch,
  formatRoomCode,
  normalizeRoomCode,
  peerIdFromRoomCode,
} from '../src/game/network/roomCode';
import { computeVectorStickInput } from '../src/game/systems/TouchSim';
import { MAP_MODES, PRESET_MAZE_MAP, resolveMazeForRound } from '../src/game/maps/mapDefinitions';
import { buildArenaLayout } from '../src/game/maps/MazeBuilder';
import { PlayerManager } from '../src/game/managers/PlayerManager';
import { SettingsManager } from '../src/game/managers/SettingsManager';
import { ScoreManager } from '../src/game/managers/ScoreManager';
import {
  computeBotDecision,
  createAISlotMemory,
  traceBallisticShot,
} from '../src/game/systems/AISim';
import {
  applySafeTankKnockback,
  castFlashlightPolygon,
  computeBarrelExplosionImpact,
  computeWeaponDamage,
  findProjectileBarrelHits,
  resolveEffectiveBattleModeRules,
  resolveTankBarrelCollisions,
  spawnTntBarrels,
} from '../src/game/systems/BattleModeSim';
import {
  computeSafeMuzzleSpawn,
  resolveAllTankCollisions,
  resolveTankWallCollisions,
  stepProjectilesSimulation,
} from '../src/game/systems/CollisionSystem';
import {
  computeBfsDistances,
  createEmptySolidGrid,
  generateProceduralMaze,
  isMazeValidAndConnected,
  SeededRng,
  selectBalancedSpawns,
} from '../src/game/systems/MazeSystem';
import {
  canPickupCrate,
  computeArenaPerimeterWalls,
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
  removeEnergyBarrierFromArena,
  rollWeightedSkill,
  steerHomingMissile,
  stepFlameThermodynamics,
  tryApplyCratePickup,
  type GroundSpikeZone,
  type ProximityMineState,
} from '../src/game/systems/PowerUpSim';
import type { ProjectileKinematics, TankKinematics, WallRect } from '../src/game/types/gameTypes';

test('Procedural maze 200-seed sweep guarantees determinism, 100% connectivity, and safe balanced spawns', () => {
  const digests = new Set<string>();

  for (let seed = 1; seed <= 200; seed++) {
    const m1 = generateProceduralMaze(9, 6, seed);
    const m2 = generateProceduralMaze(9, 6, seed);
    assert.deepEqual(m1.hWalls, m2.hWalls, `Seed ${seed} must be deterministic`);
    assert.deepEqual(m1.vWalls, m2.vWalls, `Seed ${seed} must be deterministic`);
    assert.equal(isMazeValidAndConnected(m1), true, `Seed ${seed} must be 100% reachable`);

    digests.add(JSON.stringify([m1.hWalls, m1.vWalls]));

    const layout = buildArenaLayout(m1, 4, seed);
    assert.equal(layout.spawns.length, 4);

    // Ensure all 4 spawns are distinct, mutually reachable, and never overlapping any wall
    const seenCells = new Set<string>();
    for (let i = 0; i < 4; i++) {
      const sp = layout.spawns[i];
      const cellKey = `${sp.col},${sp.row}`;
      assert.equal(seenCells.has(cellKey), false, `Seed ${seed} duplicate spawn cell`);
      seenCells.add(cellKey);

      const tank: TankKinematics = {
        index: i as 0 | 1 | 2 | 3,
        x: sp.x,
        y: sp.y,
        vx: 0,
        vy: 0,
        angle: sp.angle,
        radius: 14.5 * layout.scaleRatio,
        alive: true,
      };
      const overlapped = resolveTankWallCollisions(tank, layout.walls);
      assert.equal(overlapped, false, `Seed ${seed} spawn ${i} overlapped a maze wall`);
    }

    const distFromP0 = computeBfsDistances(m1, layout.spawns[0]);
    for (let i = 1; i < 4; i++) {
      assert.ok(
        Number.isFinite(distFromP0[layout.spawns[i].row][layout.spawns[i].col]),
        `Seed ${seed} spawn ${i} unreachable from spawn 0`,
      );
    }
  }

  assert.ok(digests.size >= 195, `Expected high map variety across 200 seeds, got ${digests.size}`);
});

test('All handcrafted preset mazes are valid, connected, and spawn 4 players cleanly', () => {
  for (const [key, grid] of Object.entries(PRESET_MAZE_MAP)) {
    assert.equal(isMazeValidAndConnected(grid), true, `Preset ${key} failed connectivity check`);
    const spawns = selectBalancedSpawns(grid, 4, 42);
    assert.equal(spawns.length, 4, `Preset ${key} did not produce 4 spawns`);
  }
});

test('Swept projectile ricochet never tunnels through thin 8px walls even at extreme speed and low FPS', () => {
  const thinWall: WallRect = {
    x: 300,
    y: 200,
    width: 8,
    height: 300,
    minX: 296,
    minY: 50,
    maxX: 304,
    maxY: 350,
  };

  const proj: ProjectileKinematics = {
    id: 1,
    ownerIndex: 0,
    x: 250,
    y: 200,
    prevX: 250,
    prevY: 200,
    vx: 2400, // Extreme speed: moves 80px in one 30fps step across an 8px wall!
    vy: 180,
    radius: 4.5,
    age: 0,
    maxLifetime: 10,
    bounces: 0,
    maxBounces: 14,
    graceTimer: 0,
    active: true,
  };

  const { bounces } = stepProjectilesSimulation([proj], [], [thinWall], 1 / 30);
  assert.equal(bounces.length, 1, 'Projectile must register wall bounce');
  assert.ok(proj.x < thinWall.minX, `Projectile tunneled across wall: x=${proj.x}`);
  assert.ok(proj.vx < 0, 'Horizontal velocity must invert on vertical wall reflection');
  assert.equal(proj.vy, 180, 'Tangential velocity must be preserved');
});

test('Projectile trajectory is frame-rate independent between 30 FPS and 120 FPS', () => {
  const walls: WallRect[] = [
    { x: 400, y: 100, width: 8, height: 200, minX: 396, minY: 0, maxX: 404, maxY: 200 },
  ];

  const makeProj = (): ProjectileKinematics => ({
    id: 1,
    ownerIndex: 0,
    x: 200,
    y: 100,
    prevX: 200,
    prevY: 100,
    vx: 300,
    vy: 40,
    radius: 4.5,
    age: 0,
    maxLifetime: 10,
    bounces: 0,
    maxBounces: 14,
    graceTimer: 0,
    active: true,
  });

  const p30 = makeProj();
  for (let i = 0; i < 30; i++) {
    stepProjectilesSimulation([p30], [], walls, 1 / 30);
  }

  const p120 = makeProj();
  for (let i = 0; i < 120; i++) {
    stepProjectilesSimulation([p120], [], walls, 1 / 120);
  }

  assert.ok(Math.abs(p30.x - p120.x) < 1.5, `X drift too large: ${p30.x} vs ${p120.x}`);
  assert.ok(Math.abs(p30.y - p120.y) < 1.5, `Y drift too large: ${p30.y} vs ${p120.y}`);
});

test('Muzzle pressed against wall reflects immediately without spawning on far side of wall', () => {
  const wall: WallRect = {
    x: 215,
    y: 200,
    width: 8,
    height: 200,
    minX: 211,
    minY: 100,
    maxX: 219,
    maxY: 300,
  };
  // Tank center at x=196, barrel length 22 -> tip would be at 218 (inside/past wall!)
  const res = computeSafeMuzzleSpawn(196, 200, 0, 22, 4.5, 296, [wall]);
  assert.equal(res.immediateBounce, true);
  assert.ok(res.x < wall.minX, `Muzzle spawn crossed wall: ${res.x}`);
  assert.ok(res.vx < 0, 'Reflected muzzle velocity must point back toward shooter');
});

test('Tank-tank collision separates overlapping tanks without pushing into walls', () => {
  const wall: WallRect = {
    x: 100,
    y: 100,
    width: 8,
    height: 200,
    minX: 96,
    minY: 0,
    maxX: 104,
    maxY: 200,
  };
  const t1: TankKinematics = {
    index: 0,
    x: 115,
    y: 100,
    vx: -50,
    vy: 0,
    angle: Math.PI,
    radius: 14.5,
    alive: true,
  };
  const t2: TankKinematics = {
    index: 1,
    x: 125,
    y: 100,
    vx: -80,
    vy: 0,
    angle: Math.PI,
    radius: 14.5,
    alive: true,
  };

  resolveAllTankCollisions([t1, t2], [wall]);
  assert.ok(t1.x - t1.radius >= wall.maxX - 0.01, 'Tank 1 must not penetrate wall');
  assert.ok(Math.hypot(t2.x - t1.x, t2.y - t1.y) >= t1.radius + t2.radius - 0.05, 'Tanks must separate');
});

test('SettingsManager rebinding swaps conflicting keys cleanly and rejects Escape', () => {
  const sm = new SettingsManager();
  sm.resetBindingsToDefault();

  const reject = sm.rebindKey(0, 'fire', 'Escape');
  assert.equal(reject.ok, false);

  // Swap P1 fire (Space) onto KeyI (currently P3 forward)
  const swapRes = sm.rebindKey(0, 'fire', 'KeyI');
  assert.equal(swapRes.ok, true);
  assert.deepEqual(swapRes.swappedWith, { playerIndex: 2, action: 'forward' });
  assert.equal(sm.getSettings().playerBindings[0].fire, 'KeyI');
  assert.equal(sm.getSettings().playerBindings[2].forward, 'Space');
});

test('ScoreManager tracks rounds, ties, and configurable match winner accurately', () => {
  const sm = new ScoreManager(3, 2);
  const r1 = sm.recordRoundOutcome(1);
  assert.equal(r1.matchWinnerIndex, null);
  assert.deepEqual(r1.scores, [0, 1, 0]);

  const r2 = sm.recordRoundOutcome(null); // Tie round
  assert.equal(r2.ties, 1);
  assert.equal(r2.matchWinnerIndex, null);

  const r3 = sm.recordRoundOutcome(1);
  assert.equal(r3.matchWinnerIndex, 1);
  assert.deepEqual(r3.scores, [0, 2, 0]);
});

test('Base magazine holds 10 active shells per tank', () => {
  assert.equal(BASE_GAMEPLAY.maxProjectilesPerTank, 10);
});

test('Colossal and Titan maze modes (14x9 up to 20x12) stay connected and fit inside ARENA_VIEWPORT', () => {
  assert.ok(PRESET_MAZE_MAP.citadel_wargrounds, 'citadel_wargrounds preset must exist');
  assert.ok(PRESET_MAZE_MAP.titan_stronghold, 'titan_stronghold preset must exist');

  const bigModes = [
    'procedural_mega',
    'procedural_colossal',
    'procedural_titan',
    'citadel_wargrounds',
    'titan_stronghold',
  ] as const;

  for (const mode of bigModes) {
    const grid = resolveMazeForRound(mode as never, 1, 4, 12345);
    assert.equal(isMazeValidAndConnected(grid), true, `${mode} must be 100% connected`);
    const layout = buildArenaLayout(grid, 4, 12345);
    assert.ok(
      layout.width <= ARENA_VIEWPORT.maxWidth,
      `${mode} width ${layout.width} exceeded ${ARENA_VIEWPORT.maxWidth}`,
    );
    assert.ok(
      layout.height <= ARENA_VIEWPORT.maxHeight,
      `${mode} height ${layout.height} exceeded ${ARENA_VIEWPORT.maxHeight}`,
    );
    assert.equal(layout.spawns.length, 4);
    for (let i = 0; i < 4; i++) {
      const sp = layout.spawns[i];
      const tank: TankKinematics = {
        index: i as 0 | 1 | 2 | 3,
        x: sp.x,
        y: sp.y,
        vx: 0,
        vy: 0,
        angle: sp.angle,
        radius: BASE_GAMEPLAY.tankRadius * layout.scaleRatio,
        alive: true,
      };
      assert.equal(resolveTankWallCollisions(tank, layout.walls), false, `${mode} spawn ${i} hit wall`);
    }
  }
});

test('SettingsManager and ScoreManager support Unlimited (0) and custom high scores up to 999', () => {
  const settings = new SettingsManager();
  settings.setWinningScore(0);
  assert.equal(settings.getSettings().winningScore, 0, '0 must represent Unlimited mode');

  settings.setWinningScore(42);
  assert.equal(settings.getSettings().winningScore, 42, 'Custom score 42 must be preserved');

  settings.setWinningScore(9999);
  assert.equal(settings.getSettings().winningScore, 999, 'Score above 999 must clamp to 999');

  const unlimitedMatch = new ScoreManager(2, 0);
  for (let i = 0; i < 25; i++) {
    const res = unlimitedMatch.recordRoundOutcome(0);
    assert.equal(res.matchWinnerIndex, null, 'Unlimited mode must never end the match automatically');
    unlimitedMatch.advanceToNextRound();
  }
  assert.equal(unlimitedMatch.getScore(0), 25);
});

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
  // 4x2 U-shaped corridor:
  // Row 0: (0,0) | (1,0) - (2,0) - (3,0)   [solid wall between (0,0) and (1,0)!]
  //          open    closed  closed   open
  // Row 1: (0,1) - (1,1) - (2,1) - (3,1)
  const grid = createEmptySolidGrid('homing_u', 'Homing U', 4, 2, 1);
  // Open (0,0) <-> (0,1)
  grid.hWalls[1][0] = false;
  // Open bottom row (0,1)-(1,1)-(2,1)-(3,1)
  grid.vWalls[1][1] = false;
  grid.vWalls[1][2] = false;
  grid.vWalls[1][3] = false;
  // Open (3,1) <-> (3,0)
  grid.hWalls[1][3] = false;
  // Open top right (3,0)-(2,0)-(1,0), keeping vWalls[0][1] SOLID between (0,0) and (1,0)!
  grid.vWalls[0][2] = false;
  grid.vWalls[0][3] = false;

  const arena = buildArenaLayout(grid, 2, 1);
  const cellCenter = (c: number, r: number) => ({
    x: arena.originX + (c + 0.5) * arena.cellSize,
    y: arena.originY + (r + 0.5) * arena.cellSize,
  });

  // Missile is in (0,0).
  // Rival P1 is in (1,0) — only 1 cell away in straight line across solid wall, but 6 steps around the U!
  // Shooter P0 is in (1,1) — 2 steps along open corridor (0,0)->(0,1)->(1,1)!
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
    vx: 260, // Initially aimed straight right into the solid wall vWalls[0][1]!
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

  // Before homingBallisticSec (1.5s), seeker must NOT engage yet
  const beforeLock = steerHomingMissile(missile, [shooter, rival], arena, 1 / 60);
  assert.equal(beforeLock.seeking, false);

  // Advance missile past 1.5s -> seeker activates, chooses Shooter P0 (2 maze cells vs Rival's 6 maze cells!),
  // switches bounceBehavior to 'slide' so hitting walls despite bounces=13/14 never deactivates it!
  missile.age = POWERUP_CONFIG.homingBallisticSec + 0.05;
  const atLock = steerHomingMissile(missile, [shooter, rival], arena, 1 / 60);
  assert.equal(atLock.seeking, true);
  assert.equal(atLock.targetIndex, 0, 'Must target shooter P0 who is closer via open maze path than wall-blocked P1');

  // Now simulate until it reaches and hits Shooter P0 around the corner!
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

  // Verify dynamic retargeting: if Shooter P0 moves far away to (2,0) while missile is at (2,1) and Rival P1 is at (3,1)
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

test('Score stepper and custom score input handle 0 (Unlimited), empty fallback, clamping, and arrow wrap', () => {
  assert.equal(parseCustomScoreInput('0', 5), 0, 'Typing 0 selects Unlimited');
  assert.equal(parseCustomScoreInput('', 7), 7, 'Empty buffer restores prior valid score');
  assert.equal(parseCustomScoreInput('   ', 12), 12);
  assert.equal(parseCustomScoreInput('9999', 5), 999, 'Over-max clamps to 999');
  assert.equal(parseCustomScoreInput('23', 5), 23);

  assert.equal(stepWinningScore(1, -1), 0, 'Stepping down from 1 enters Unlimited (0)');
  assert.equal(stepWinningScore(0, 1), 1, 'Stepping up from Unlimited (0) enters 1 pt');
  assert.equal(stepWinningScore(0, -1), 99, 'Stepping down from Unlimited wraps to 99 pts');
  assert.equal(stepWinningScore(5, 1), 6);
  assert.equal(stepWinningScore(5, -1), 4);
});

test('ScoreManager.setWinningScore updates match goal mid-match without losing current scores', () => {
  const sm = new ScoreManager(2, 3);
  sm.recordRoundOutcome(0);
  sm.advanceToNextRound();
  sm.recordRoundOutcome(0);
  sm.advanceToNextRound();

  // Mid-match pause: player switches goal from 3 -> 0 (Unlimited)
  (sm as unknown as { setWinningScore: (n: number) => void }).setWinningScore(0);
  assert.equal(sm.getWinningScore(), 0);
  const r3 = sm.recordRoundOutcome(0);
  assert.equal(r3.scores[0], 3);
  assert.equal(r3.matchWinnerIndex, null, 'Switching mid-match to Unlimited prevents match end at 3');

  // Switch goal to 4 -> next win ends match!
  sm.advanceToNextRound();
  (sm as unknown as { setWinningScore: (n: number) => void }).setWinningScore(4);
  const r4 = sm.recordRoundOutcome(0);
  assert.equal(r4.matchWinnerIndex, 0);
});

test('canPickupCrate blocks crate pickup while Laser is charging or pending discharge', () => {
  assert.equal(canPickupCrate({ skill: null, ammo: 0, chargingLaserRemaining: 0 }, false), true);
  assert.equal(canPickupCrate({ skill: 'laser', ammo: 1, chargingLaserRemaining: 0.5 }, false), false);
  assert.equal(canPickupCrate({ skill: 'laser', ammo: 1, chargingLaserRemaining: 0 }, true), false);
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
  // Carve connectivity on row 1, leave interior wall vWalls[0][1] solid
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

test('Live Match Rules: crate spawn interval (0=OFF or 1..300s), maxCrates, enabledSkills filter, and AI roster config', () => {
  assert.equal(normalizeCrateSpawnInterval(0), 0, '0 represents Power-Ups OFF');
  assert.equal(normalizeCrateSpawnInterval(15), 15);
  assert.equal(normalizeCrateSpawnInterval(999), 300, 'Clamps upper bound to 300s');
  assert.equal(stepCrateSpawnInterval(1, -1), 0, 'Stepping down from 1s enters OFF (0)');
  assert.equal(stepCrateSpawnInterval(0, 1), 1, 'Stepping up from OFF (0) enters 1s');
  assert.equal(parseCustomIntervalInput('0', 20), 0);
  assert.equal(parseCustomIntervalInput('12', 20), 12);
  assert.equal(parseCustomIntervalInput('', 20), 20);

  const sm = new SettingsManager();
  sm.setPowerUpSpawnIntervalSec(8);
  sm.setMaxCratesOnFloor(6);
  sm.setAllSkillsEnabled(false);
  sm.toggleSkillEnabled('laser');
  sm.toggleSkillEnabled('spike');
  assert.equal(sm.getSettings().powerUpSpawnIntervalSec, 8);
  assert.equal(sm.getSettings().maxCratesOnFloor, 6);
  assert.deepEqual(sm.getSettings().enabledSkills.sort(), ['laser', 'spike']);

  const rng = new SeededRng(4242);
  for (let i = 0; i < 100; i++) {
    const sk = rollWeightedSkill(rng, sm.getSettings().enabledSkills);
    assert.ok(sk === 'laser' || sk === 'spike', `Disabled skill leaked into drop pool: ${sk}`);
  }

  sm.setPlayerCount(4);
  sm.setPlayerIsAI(1, true);
  sm.setPlayerAIDifficulty(1, 'easy');
  sm.setPlayerIsAI(3, true);
  sm.setPlayerAIDifficulty(3, 'super_hard');
  const roster = PlayerManager.getActivePlayers(sm.getSettings());
  assert.equal(roster[0].isAI, false);
  assert.equal(roster[1].isAI, true);
  assert.equal(roster[1].aiDifficulty, 'easy');
  assert.equal(roster[3].isAI, true);
  assert.equal(roster[3].aiDifficulty, 'super_hard');
});

test('AISim ricochet solver: rejects self-ricochet & shielded targets, while finding 1-bounce bank shots above Easy', () => {
  const grid = createEmptySolidGrid('ai_bank', 'AI Bank Shot', 3, 2, 1);
  // Open U-corridor: top wall at r=0 is solid ceiling; interior vertical wall vWalls[1][1] blocks direct horizontal sight on row 1,
  // while ceiling on row 0 is open (hWalls[1][0]=false, vWalls[0][1]=false, vWalls[0][2]=false, hWalls[1][2]=false) so a 1-bounce ceiling bank shot hits!
  grid.hWalls[1][0] = false;
  grid.vWalls[0][1] = false;
  grid.vWalls[0][2] = false;
  grid.hWalls[1][2] = false;
  const arena = buildArenaLayout(grid, 2, 1);

  const bot: TankKinematics = {
    index: 0,
    x: arena.originX + arena.cellSize * 0.5,
    y: arena.originY + arena.cellSize * 1.35,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };
  const rival: TankKinematics = {
    index: 1,
    x: arena.originX + arena.cellSize * 2.5,
    y: arena.originY + arena.cellSize * 1.35,
    vx: 0,
    vy: 0,
    angle: Math.PI,
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };

  // Shooting straight right (angle = 0) into vertical wall vWalls[1][1] bounces straight back into bot -> selfHitRisk!
  const selfBounce = traceBallisticShot(
    bot.x + 18 * arena.scaleRatio,
    bot.y,
    0,
    0,
    [bot, rival],
    new Set(),
    arena.walls,
    2,
    900,
    4.5 * arena.scaleRatio,
  );
  assert.equal(selfBounce.hitsEnemy, false, 'Must not count wall bounce back into shooter as enemy hit');
  assert.equal(selfBounce.selfHitRisk, true, 'Must flag direct bounce-back as selfHitRisk');

  // Symmetrical ceiling bank angle from bot up to top wall midpoint (x = originX + 1.5 * cellSize, y = originY) and down to rival!
  const topMidX = arena.originX + arena.cellSize * 1.5;
  const topWallInnerY = arena.originY + arena.wallThickness * 0.5 + 4.5 * arena.scaleRatio;
  const bankAngle = Math.atan2(topWallInnerY - bot.y, topMidX - bot.x);
  const bankTrace = traceBallisticShot(
    bot.x + Math.cos(bankAngle) * 18 * arena.scaleRatio,
    bot.y + Math.sin(bankAngle) * 18 * arena.scaleRatio,
    bankAngle,
    0,
    [bot, rival],
    new Set(),
    arena.walls,
    2,
    1200,
    4.5 * arena.scaleRatio,
  );
  assert.equal(bankTrace.hitsEnemy, true, '1-bounce ceiling bank shot must register enemy hit');
  assert.equal(bankTrace.bouncesUsed, 1);

  // If rival has Aegis Shield active, the same bank shot must be rejected so AI does not shoot a shielded tank!
  const shieldedTrace = traceBallisticShot(
    bot.x + Math.cos(bankAngle) * 18 * arena.scaleRatio,
    bot.y + Math.sin(bankAngle) * 18 * arena.scaleRatio,
    bankAngle,
    0,
    [bot, rival],
    new Set([1]),
    arena.walls,
    2,
    1200,
    4.5 * arena.scaleRatio,
  );
  assert.equal(shieldedTrace.hitsEnemy, false, 'AI must avoid firing physical shells into an active Aegis Shield');
});

test('AISim 4 difficulty behaviors: Super Hard dodges incoming bullets, pops Shield defensively, and aims Laser through walls', () => {
  const grid = createEmptySolidGrid('ai_open', 'AI Open', 4, 3, 1);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      if (r > 0) grid.hWalls[r][c] = false;
      if (c > 0) grid.vWalls[r][c] = false;
    }
  }
  const arena = buildArenaLayout(grid, 2, 1);

  const bot: TankKinematics = {
    index: 1,
    x: arena.originX + arena.width * 0.5,
    y: arena.originY + arena.height * 0.5,
    vx: 0,
    vy: 0,
    angle: 0, // Facing East (perpendicular to bullet coming from North!)
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };
  const enemy: TankKinematics = {
    index: 0,
    x: arena.originX + arena.width * 0.85,
    y: arena.originY + arena.height * 0.85,
    vx: 0,
    vy: 0,
    angle: Math.PI,
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };
  // Bullet coming straight down from North toward bot!
  const incomingBullet: ProjectileKinematics = {
    id: 50,
    ownerIndex: 0,
    x: bot.x,
    y: bot.y - 75,
    prevX: bot.x,
    prevY: bot.y - 80,
    vx: 0,
    vy: 290,
    radius: 4.5,
    age: 0.2,
    maxLifetime: 10,
    bounces: 0,
    maxBounces: 14,
    graceTimer: 0,
    active: true,
    variant: 'standard',
  };

  // 1. Super Hard with equipped 'shield' pops Shield immediately when an imminent bullet approaches!
  const memShield = createAISlotMemory(1);
  const shieldInput = computeBotDecision(
    {
      difficulty: 'super_hard',
      dt: 1 / 60,
      self: bot,
      selfSkill: 'shield',
      selfSkillAmmo: 1,
      selfAmmo: 10,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: true,
      tanks: [enemy, bot],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [incomingBullet],
      crates: [],
      spikeZones: [],
      mines: [],
      arena,
    },
    memShield,
    new SeededRng(101),
  );
  assert.equal(shieldInput.firePressed, true, 'Super Hard bot must pop Aegis Shield against imminent bullet');

  // 2. Without shield, Super Hard drives forward/backward along East-West axis to sidestep the North-South bullet!
  const memDodge = createAISlotMemory(1);
  const dodgeInput = computeBotDecision(
    {
      difficulty: 'super_hard',
      dt: 1 / 60,
      self: bot,
      selfSkill: null,
      selfSkillAmmo: 0,
      selfAmmo: 0,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: false,
      tanks: [enemy, bot],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [incomingBullet],
      crates: [],
      spikeZones: [],
      mines: [],
      arena,
    },
    memDodge,
    new SeededRng(102),
  );
  assert.equal(
    dodgeInput.forward || dodgeInput.backward,
    true,
    'Super Hard bot facing perpendicular to incoming bullet must throttle out of the bullet path',
  );

  // 3. Laser skill fires right through solid walls when enemy is within +-15 deg cone!
  const walledGrid = createEmptySolidGrid('ai_laser_wall', 'AI Laser Wall', 3, 2, 1);
  walledGrid.hWalls[1][0] = false;
  walledGrid.vWalls[1][1] = false;
  walledGrid.vWalls[1][2] = false;
  walledGrid.hWalls[1][2] = false; // vWalls[0][1] & vWalls[0][2] are SOLID walls on row 0!
  const walledArena = buildArenaLayout(walledGrid, 2, 1);
  const laserBot: TankKinematics = {
    index: 1,
    x: walledArena.originX + walledArena.cellSize * 0.5,
    y: walledArena.originY + walledArena.cellSize * 0.5,
    vx: 0,
    vy: 0,
    angle: 0.08, // ~4.5 deg (well within +-15 deg cone of enemy straight East!)
    radius: 14.5 * walledArena.scaleRatio,
    alive: true,
  };
  const walledEnemy: TankKinematics = {
    index: 0,
    x: walledArena.originX + walledArena.cellSize * 2.5,
    y: walledArena.originY + walledArena.cellSize * 0.5,
    vx: 0,
    vy: 0,
    angle: Math.PI,
    radius: 14.5 * walledArena.scaleRatio,
    alive: true,
  };
  const laserDecision = computeBotDecision(
    {
      difficulty: 'hard',
      dt: 1 / 60,
      self: laserBot,
      selfSkill: 'laser',
      selfSkillAmmo: 1,
      selfAmmo: 10,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: true,
      tanks: [walledEnemy, laserBot],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [],
      crates: [],
      spikeZones: [],
      mines: [],
      arena: walledArena,
    },
    createAISlotMemory(1),
    new SeededRng(103),
  );
  assert.equal(laserDecision.firePressed, true, 'AI with Laser must fire through solid walls when enemy is inside +-15 deg cone');
});

test('Wave 4 balance & Crescent Reaper: 0.9x tank speed, longer Flame reach, Gatling recoil, and 2x-long 1-turn Crescent Scythe hitbox', () => {
  // 1. 0.9x tank speed (from 182 / 130 -> ~163.8 / 117)
  assert.ok(
    Math.abs(BASE_GAMEPLAY.tankForwardSpeed - 163.8) <= 0.5,
    `Expected ~163.8 forward speed (0.9x), got ${BASE_GAMEPLAY.tankForwardSpeed}`,
  );
  assert.ok(
    Math.abs(BASE_GAMEPLAY.tankBackwardSpeed - 117) <= 0.5,
    `Expected ~117 reverse speed (0.9x), got ${BASE_GAMEPLAY.tankBackwardSpeed}`,
  );

  // 2. Gatling recoil & spread configured
  assert.ok(
    (POWERUP_CONFIG as Record<string, number>).gatlingRecoilImpulse >= 12,
    'Gatling must apply recoil impulse',
  );
  assert.ok(
    (POWERUP_CONFIG as Record<string, number>).gatlingSpreadRad > 0.03,
    'Gatling must have slight recoil bloom',
  );

  // 3. Extended Flame reach (> 210px in open corridor)
  const flameSpeed = BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.flameSpeedMultiplier;
  const flame: ProjectileKinematics = {
    id: 1,
    ownerIndex: 0,
    x: 0,
    y: 0,
    prevX: 0,
    prevY: 0,
    vx: flameSpeed,
    vy: 0,
    radius: POWERUP_CONFIG.flameStartRadius,
    age: 0,
    maxLifetime: POWERUP_CONFIG.flameLifetimeSec,
    bounces: 0,
    maxBounces: 4,
    graceTimer: 0,
    active: true,
    variant: 'flame',
    bounceBehavior: 'slide',
  };
  const dt = 1 / 60;
  while (flame.active) {
    stepFlameThermodynamics([flame], dt, 1.0);
    stepProjectilesSimulation([flame], [], [], dt);
  }
  assert.ok(flame.x > 330, `Flame stream should reach > 330px, got ${flame.x.toFixed(1)}px`);
  assert.ok(POWERUP_CONFIG.flameAmmo >= 75, 'Dense flame stream must carry >= 75 fuel units');
  assert.ok(POWERUP_CONFIG.flameCooldownSec <= 0.03, 'Dense flame stream cooldown must be <= 0.03s');

  // 4. Crimson-Black Reaper: halved again to 0.8375 rad/s, 4.7 cells long, exact 180-deg (PI) sweep!
  assert.ok(Math.abs(POWERUP_CONFIG.reaperSpinSpeedRad - 0.8375) < 1e-4, 'Reaper spin speed must be halved to 0.8375 rad/s');
  assert.ok(Math.abs(POWERUP_CONFIG.reaperBladeCellsLength - 4.7) < 1e-4, 'Reaper length must be 4.7 cells');
  assert.ok(
    Math.abs(POWERUP_CONFIG.reaperSpinSpeedRad * POWERUP_CONFIG.reaperSpinDurationSec - Math.PI) < 1e-4,
    'Reaper spin duration must sweep exactly 180 degrees (PI radians)',
  );
  assert.equal(getSkillDescriptor('reaper').accentColor, 0xd50000, 'Reaper accent color must be Crimson Red');

  const reaperShooter: TankKinematics = {
    index: 0,
    x: 300,
    y: 300,
    vx: 0,
    vy: 0,
    angle: 0, // Shaft A points East (+X) to x=540, y=300; Crescent A sweeps South (+Y) across the tip!
    radius: 14.5,
    alive: true,
  };
  // Rival positioned at x=518, y=365 — 65px off-axis from the straight shaft (y=300), right inside the transverse Crescent Scythe blade!
  const rivalInCrescentTip: TankKinematics = {
    ...reaperShooter,
    index: 1,
    x: 518,
    y: 365,
  };
  const sweep = computeReaperBlades(
    300,
    300,
    0,
    0,
    240,
    [reaperShooter, rivalInCrescentTip],
    1.0,
  ) as unknown as {
    crescentA?: Array<{ x: number; y: number }>;
    crescentB?: Array<{ x: number; y: number }>;
    hitVictimIndices: number[];
  };
  assert.ok(Array.isArray(sweep.crescentA) && sweep.crescentA.length >= 6, 'Must compute crescentA scythe curve');
  assert.ok(Array.isArray(sweep.crescentB) && sweep.crescentB.length >= 6, 'Must compute crescentB scythe curve');
  assert.deepEqual(
    sweep.hitVictimIndices,
    [1],
    'Transverse Crescent Scythe blade at tip must slice rival 65px off the main shaft axis',
  );
});

test('Bug regression: grazing wall corners & repeated Shield deflections NEVER accelerate bullets abnormally', () => {
  const wall: WallRect = {
    x: 300,
    y: 300,
    width: 8,
    height: 120,
    minX: 296,
    minY: 240,
    maxX: 304,
    maxY: 360,
  };

  // Fire a 296 px/s shell diagonally into the top-left corner vertex (296, 240) so it hits the rounded corner arc!
  const initialSpeed = 296;
  const diag = Math.SQRT1_2 * initialSpeed;
  const cornerProj: ProjectileKinematics = {
    id: 1,
    ownerIndex: 0,
    x: 286,
    y: 230,
    prevX: 286,
    prevY: 230,
    vx: diag,
    vy: diag,
    radius: 4.5,
    age: 0,
    maxLifetime: 11.5,
    bounces: 0,
    maxBounces: 14,
    graceTimer: 0,
    active: true,
    variant: 'standard',
    bounceBehavior: 'reflect',
  };

  let totalCornerBounces = 0;
  for (let s = 0; s < 5; s++) {
    const { bounces } = stepProjectilesSimulation([cornerProj], [], [wall], 1 / 60);
    totalCornerBounces += bounces.length;
  }
  assert.ok(totalCornerBounces >= 1, 'Shell must bounce off the wall corner');
  const postCornerSpeed = Math.hypot(cornerProj.vx, cornerProj.vy);
  assert.ok(
    Math.abs(postCornerSpeed - initialSpeed) < 0.05,
    `Corner bounce amplified bullet speed from ${initialSpeed} to ${postCornerSpeed.toFixed(2)} px/s!`,
  );

  // Also sweep 500 random diagonal angles & multi-corner bounces in a real maze to guarantee 0% speed drift!
  const maze = generateProceduralMaze(10, 6, 888);
  const arena = buildArenaLayout(maze, 2, 888);
  for (let i = 0; i < 60; i++) {
    const ang = (i / 60) * Math.PI * 2;
    const sp = arena.spawns[0];
    const p: ProjectileKinematics = {
      ...cornerProj,
      id: i + 10,
      x: sp.x,
      y: sp.y,
      vx: Math.cos(ang) * initialSpeed * arena.scaleRatio,
      vy: Math.sin(ang) * initialSpeed * arena.scaleRatio,
      radius: 4.5 * arena.scaleRatio,
      bounces: 0,
      active: true,
    };
    const expectedSpd = initialSpeed * arena.scaleRatio;
    for (let step = 0; step < 90 && p.active; step++) {
      stepProjectilesSimulation([p], [], arena.walls, 1 / 60);
      if (p.active) {
        const curSpd = Math.hypot(p.vx, p.vy);
        assert.ok(
          Math.abs(curSpd - expectedSpd) < 0.05,
          `Maze bounce drifted bullet speed from ${expectedSpd.toFixed(2)} to ${curSpd.toFixed(2)}`,
        );
      }
    }
  }

  // Repeated Aegis Shield deflections (e.g. bullet pinned between Shield and wall) must NOT compound 1.18^N!
  const shieldedTank: TankKinematics = {
    index: 1,
    x: 200,
    y: 200,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 14.5,
    alive: true,
  };
  const trappedBullet: ProjectileKinematics = {
    ...cornerProj,
    id: 99,
    ownerIndex: 0,
    x: 180,
    y: 200,
    vx: initialSpeed,
    vy: 0,
    bounces: 1,
    age: 0.5,
    active: true,
  };
  for (let hit = 0; hit < 10; hit++) {
    trappedBullet.x = 182;
    trappedBullet.y = 200;
    trappedBullet.vx = Math.hypot(trappedBullet.vx, trappedBullet.vy);
    trappedBullet.vy = 0;
    deflectProjectilesAgainstShields([trappedBullet], [shieldedTank], new Set([1]), 1.0);
  }
  const postShieldSpeed = Math.hypot(trappedBullet.vx, trappedBullet.vy);
  assert.ok(
    postShieldSpeed <= initialSpeed * 1.25,
    `Repeated shield deflections compounded speed to ${postShieldSpeed.toFixed(1)} px/s!`,
  );
});

test('Mobile Vector Stick & 1vs1 Room Code helpers: precision aim zone, drive, emergency reverse, and WT-XXXX codes', () => {
  // 1. Deadzone (< 14% radius) -> completely idle
  const idle = computeVectorStickInput(4, 3, 60, 0, false);
  assert.equal(idle.forward, false);
  assert.equal(idle.backward, false);
  assert.equal(idle.left, false);
  assert.equal(idle.right, false);

  // 2. Precision Aim Zone (14%..42% radius, e.g. dy = +18 of 60 -> +90 deg while tank faces 0 deg) -> turns right on spot!
  const aimOnly = computeVectorStickInput(0, 18, 60, 0, false);
  assert.equal(aimOnly.right, true, 'Precision zone must rotate barrel toward thumb');
  assert.equal(aimOnly.forward, false, 'Precision zone must NOT drive forward');
  assert.equal(aimOnly.backward, false);

  // 3. Full Drive Zone (>= 42% radius, e.g. dx = 45, dy = 20 -> ~24 deg while tank faces 0 deg) -> steers right AND drives forward!
  const drive = computeVectorStickInput(45, 20, 60, 0, false);
  assert.equal(drive.forward, true);
  assert.equal(drive.right, true);
  assert.equal(drive.backward, false);

  // 4. Emergency Reverse Pull (> 130 deg opposite tank heading 0, e.g. dx = -50, dy = 4) -> backs up immediately!
  const rev = computeVectorStickInput(-50, 4, 60, 0, false);
  assert.equal(rev.backward, true, 'Pulling stick opposite tank heading must engage instant reverse');
  assert.equal(rev.forward, false);

  // 5. Room code normalization & URL query extraction (`WT-4829` = 6-char display code, 4-char core key)
  assert.equal(normalizeRoomCode('wt-4829'), '4829');
  assert.equal(normalizeRoomCode('  a9k2 '), 'A9K2');
  assert.equal(formatRoomCode('4829'), 'WT-4829');
  assert.equal(peerIdFromRoomCode('WT-4829'), 'windtank-p2p-v1-4829');
  assert.equal(extractRoomCodeFromSearch('?room=WT-7391'), '7391');
  assert.equal(extractRoomCodeFromSearch('?foo=1&room=ab12'), 'AB12');
});

test('Wave 6/7: Auto Mobile/PC detection, Touch Sensitivity/AimZone/Scale tuning, and Flame fluid vortex curl', () => {
  const sm = new SettingsManager();

  // 1. Touch tuning steppers & reset
  assert.equal(sm.getSettings().touchSensitivity, 1.0);
  sm.stepTouchSensitivity(0.2);
  assert.equal(sm.getSettings().touchSensitivity, 1.2);
  sm.stepTouchAimZone(-0.1);
  assert.equal(sm.getSettings().touchAimZone, 0.32);
  sm.stepTouchButtonScale(0.15);
  assert.equal(sm.getSettings().touchButtonScale, 1.15);
  sm.setTouchFloatingStick(false);
  sm.setTouchSwapHands(true);
  assert.equal(sm.getSettings().touchFloatingStick, false);
  assert.equal(sm.getSettings().touchSwapHands, true);

  sm.resetTouchSettingsToDefault();
  assert.equal(sm.getSettings().touchSensitivity, 1.0);
  assert.equal(sm.getSettings().touchAimZone, 0.42);
  assert.equal(sm.getSettings().touchButtonScale, 1.0);
  assert.equal(sm.getSettings().touchFloatingStick, true);
  assert.equal(sm.getSettings().touchSwapHands, false);

  // 2. Sensitivity affects Vector Stick drive threshold: dx=20 of maxRadius=60 is 33% (<42% aim-only at 1.0x),
  //    but at sensitivity=1.4x (effective 46.7% >= 42%), the same short thumb drag drives forward!
  const defaultDrag = computeVectorStickInput(20, 0, 60, 0, false, {
    sensitivity: 1.0,
    aimZoneThreshold: 0.42,
  });
  assert.equal(defaultDrag.forward, false, 'At 1.0x sensitivity, 33% drag stays in precision aim zone');
  assert.equal(defaultDrag.inPrecisionAimZone, true);

  const highSensDrag = computeVectorStickInput(20, 0, 60, 0, false, {
    sensitivity: 1.4,
    aimZoneThreshold: 0.42,
  });
  assert.equal(highSensDrag.forward, true, 'At 1.4x sensitivity, 33% drag reaches full forward drive');

  // 3. On headless Node (no mobile UA/coarse pointer), PC mode allows 4 players
  sm.setPlayerCount(4);
  assert.equal(sm.getSettings().playerCount, 4, 'PC mode allows 4 players');

  // 4. Realistic fluid-jet Flame thermodynamics: lateral vortex curl induces perpendicular velocity & radius expands
  const jet: ProjectileKinematics = {
    id: 7,
    ownerIndex: 0,
    x: 200,
    y: 200,
    prevX: 195,
    prevY: 200,
    vx: 420,
    vy: 0,
    radius: POWERUP_CONFIG.flameStartRadius,
    age: 0.35,
    maxLifetime: POWERUP_CONFIG.flameLifetimeSec,
    bounces: 0,
    maxBounces: 5,
    graceTimer: 0,
    active: true,
    variant: 'flame',
    bounceBehavior: 'slide',
  };
  stepFlameThermodynamics([jet], 1 / 60, 1.0);
  assert.ok(Math.abs(jet.vy) > 0.01, 'Fluid flame jet must exhibit lateral turbulent vortex curl');
  assert.ok(jet.vx < 420 && jet.vx > 350, 'Aerodynamic drag must smoothly decelerate flame parcel');
  assert.ok(
    jet.radius > POWERUP_CONFIG.flameStartRadius,
    'Flame plume radius must expand along thermal cone',
  );
});

test('Bug regression: Windows touchscreen laptop / 2-in-1 MUST stay in PC mode, while Android/iPhone/iPad detect as Mobile', () => {
  // Case 1: Windows 11 Touchscreen Laptop — even if maxTouchPoints=10 or hoverNone=true, Windows NT + uaMobile=false is PC!
  assert.equal(
    isTouchDeviceDetected({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      maxTouchPoints: 10,
      userAgentDataMobile: false,
      hoverNone: true,
      pointerCoarse: true,
    }),
    false,
    'Windows PC/laptop with touchscreen or tablet driver MUST be detected as PC (false)',
  );

  // Case 2: Windows PC with ?device=mobile override (used for mobile preview/testing)
  assert.equal(
    isTouchDeviceDetected({
      search: '?device=mobile',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      userAgentDataMobile: false,
    }),
    true,
  );

  // Case 3: Android Chrome Phone
  assert.equal(
    isTouchDeviceDetected({
      userAgent:
        'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36',
      maxTouchPoints: 5,
      userAgentDataMobile: true,
      hoverNone: true,
      pointerCoarse: true,
    }),
    true,
    'Android phone must be detected as Mobile (true)',
  );

  // Case 4: iPhone Safari
  assert.equal(
    isTouchDeviceDetected({
      userAgent:
        'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      maxTouchPoints: 5,
      hoverNone: true,
      pointerCoarse: true,
    }),
    true,
    'iPhone must be detected as Mobile (true)',
  );

  // Case 5: iPadOS 17 Safari (Macintosh UA + maxTouchPoints=5 + hoverNone=true)
  assert.equal(
    isTouchDeviceDetected({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
      maxTouchPoints: 5,
      hoverNone: true,
      pointerCoarse: true,
    }),
    true,
    'iPadOS must be detected as Mobile (true)',
  );

  // Case 6: MacBook with Trackpad (Macintosh UA + hoverNone=false)
  assert.equal(
    isTouchDeviceDetected({
      userAgent:
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      maxTouchPoints: 0,
      userAgentDataMobile: false,
      hoverNone: false,
      pointerCoarse: false,
    }),
    false,
    'MacBook must be detected as PC (false)',
  );
});

test('Battle Modes (Armor HP Durability, Explosive TNT Barrels, Night Ops Flashlight Raycasting & AI Tactics)', () => {
  // 1. Battle Mode rule resolution & SettingsManager persistence
  const sm = new SettingsManager();
  sm.setBattleMode('night_armored');
  sm.setMaxArmorHp(150);
  sm.setTntBarrelsOption('auto');
  sm.setAITactic('sniper');
  assert.equal(sm.getSettings().battleMode, 'night_armored');
  assert.equal(sm.getSettings().maxArmorHp, 150);
  assert.equal(sm.getSettings().aiTactic, 'sniper');

  const classicRules = resolveEffectiveBattleModeRules('classic', 150, 'auto');
  assert.equal(classicRules.hasArmorHp, false);
  assert.equal(classicRules.isNightOps, false);
  assert.equal(classicRules.hasTntBarrels, false);

  const nightArmoredRules = resolveEffectiveBattleModeRules('night_armored', 150, 'auto');
  assert.equal(nightArmoredRules.hasArmorHp, true);
  assert.equal(nightArmoredRules.maxHp, 150);
  assert.equal(nightArmoredRules.isNightOps, true);
  assert.equal(nightArmoredRules.hasTntBarrels, true);

  // 2. Specialized Weapon Damage Table
  assert.equal(computeWeaponDamage('standard'), 25);
  assert.equal(computeWeaponDamage('gatling'), 9);
  assert.equal(computeWeaponDamage('laser'), 80);
  assert.equal(computeWeaponDamage('mine'), 75);
  assert.equal(computeWeaponDamage('homing_missile'), 56);

  // 3. Deterministic TNT Barrel spawning, collision separation, chain-reaction & wall-safe knockback
  const grid = resolveMazeForRound('procedural_large', 1, 2, 2026);
  const arena = buildArenaLayout(grid, 2, 2026, ARENA_VIEWPORT);
  const tanks: TankKinematics[] = arena.spawns.slice(0, 2).map((sp, i) => ({
    index: i as 0 | 1,
    x: sp.x,
    y: sp.y,
    vx: 0,
    vy: 0,
    angle: sp.angle,
    radius: 13 * arena.scaleRatio,
    alive: true,
  }));

  const barrels = spawnTntBarrels(arena, tanks, 2026);
  assert.ok(barrels.length >= 4, `Expected >= 4 TNT barrels, got ${barrels.length}`);
  for (const b of barrels) {
    for (const t of tanks) {
      assert.ok(
        Math.hypot(b.x - t.x, b.y - t.y) >= arena.cellSize * 1.7,
        'TNT barrels must spawn safely away from tank spawn points',
      );
    }
  }

  // Tank overlapping a barrel is pushed out cleanly
  const firstBarrel = barrels[0];
  const testTank: TankKinematics = {
    ...tanks[0],
    x: firstBarrel.x + 3,
    y: firstBarrel.y,
  };
  resolveTankBarrelCollisions([testTank], [firstBarrel], arena.walls);
  assert.ok(
    Math.hypot(testTank.x - firstBarrel.x, testTank.y - firstBarrel.y) >=
      testTank.radius + firstBarrel.radius - 0.5,
    'Tank must be separated outside solid TNT barrel radius',
  );

  // Projectile hitting barrel registers hit & explosion computes splash damage + chained barrels
  const shot: ProjectileKinematics = {
    id: 1,
    ownerIndex: 0,
    x: firstBarrel.x + 2,
    y: firstBarrel.y,
    prevX: firstBarrel.x - 10,
    prevY: firstBarrel.y,
    vx: 260,
    vy: 0,
    radius: 4,
    age: 0.1,
    maxLifetime: 5,
    bounces: 0,
    maxBounces: 10,
    graceTimer: 0,
    active: true,
    variant: 'standard',
  };
  const barrelHits = findProjectileBarrelHits([shot], barrels);
  assert.equal(barrelHits.length, 1);
  assert.equal(barrelHits[0].barrelId, firstBarrel.id);

  const neighborBarrel = {
    ...firstBarrel,
    id: 99,
    x: firstBarrel.x + arena.cellSize * 0.9,
    y: firstBarrel.y,
  };
  const nearbyVictim: TankKinematics = {
    ...tanks[1],
    x: firstBarrel.x + arena.cellSize * 0.6,
    y: firstBarrel.y,
  };
  const blastImpact = computeBarrelExplosionImpact(
    firstBarrel,
    [firstBarrel, neighborBarrel],
    [nearbyVictim],
    arena,
  );
  assert.equal(blastImpact.victims.length, 1);
  assert.ok(blastImpact.victims[0].damage >= 20 && blastImpact.victims[0].damage <= 48);
  assert.deepEqual(blastImpact.chainedBarrelIds, [99]);
  assert.equal(blastImpact.wallProbePoints.length, 4);

  // Wall-safe knockback never pushes tank outside outer arena walls
  const cornerTank: TankKinematics = {
    ...tanks[0],
    x: arena.originX + 18,
    y: arena.originY + 18,
  };
  applySafeTankKnockback(cornerTank, -120, -120, arena.walls);
  assert.ok(cornerTank.x > arena.originX + cornerTank.radius * 0.8);
  assert.ok(cornerTank.y > arena.originY + cornerTank.radius * 0.8);

  // 4. Night Ops 2D Headlight Visibility Cone Raycasting stops strictly at walls!
  const blockerWall: WallRect = {
    x: 200,
    y: 180,
    width: 10,
    height: 120,
    minX: 200,
    minY: 180,
    maxX: 210,
    maxY: 300,
  };
  const conePoly = castFlashlightPolygon(120, 240, 0, Math.PI / 6, 300, [blockerWall], undefined, 20);
  // Center ray (index 1 + 10 = 11, angle = 0) must terminate right at `minX = 200`!
  const centerTip = conePoly[11];
  assert.ok(
    Math.abs(centerTip.x - 200) < 0.5,
    `Flashlight ray should stop at wall x=200, got ${centerTip.x.toFixed(2)}`,
  );
});

test('Night Ops Signal-Flare 360° Raycasting & Projectile Light Coalescing', async () => {
  const { castOmnidirectionalLightPolygon, coalesceProjectileLightSources } = await import(
    '../src/game/systems/BattleModeSim'
  );

  const wallRight: WallRect = {
    x: 160,
    y: 40,
    width: 10,
    height: 160,
    minX: 160,
    minY: 40,
    maxX: 170,
    maxY: 200,
  };

  // Flare shell at (100, 120) with 180px max radius:
  // East ray (`i = 0`, `angle = 0`) MUST stop at `x = 160` (`hitWall = true`),
  // while West ray (`i = 18`, `angle = pi`) reaches full `180px` (`x = -80`, `hitWall = false`)!
  const flarePoly = castOmnidirectionalLightPolygon(100, 120, 180, [wallRight], undefined, 36);
  assert.equal(flarePoly.length, 36);
  assert.equal(flarePoly[0].hitWall, true);
  assert.ok(Math.abs(flarePoly[0].x - 160) < 0.5);
  assert.equal(flarePoly[18].hitWall, false);
  assert.ok(Math.abs(flarePoly[18].x - -80) < 0.5);

  // Coalescing merges dense overlapping Flame puffs while keeping distant standard shells separate
  const merged = coalesceProjectileLightSources(
    [
      {
        id: 0,
        ownerIndex: 0,
        x: 100,
        y: 100,
        prevX: 98,
        prevY: 100,
        vx: 200,
        vy: 0,
        radius: 6,
        bounces: 0,
        maxBounces: 0,
        age: 0,
        maxLifetime: 1,
        graceTimer: 0,
        active: true,
        variant: 'flame',
      },
      {
        id: 1,
        ownerIndex: 0,
        x: 112,
        y: 104,
        prevX: 110,
        prevY: 104,
        vx: 200,
        vy: 0,
        radius: 6,
        bounces: 0,
        maxBounces: 0,
        age: 0,
        maxLifetime: 1,
        graceTimer: 0,
        active: true,
        variant: 'flame',
      },
      {
        id: 2,
        ownerIndex: 1,
        x: 320,
        y: 240,
        prevX: 324,
        prevY: 239,
        vx: -220,
        vy: 40,
        radius: 4,
        bounces: 1,
        maxBounces: 5,
        age: 0.4,
        maxLifetime: 8,
        graceTimer: 0,
        active: true,
        variant: 'standard',
      },
    ],
    28,
  );
  assert.equal(merged.length, 2);
  assert.equal(merged[0].variant, 'flame');
  assert.equal(merged[0].weight, 2);
  assert.equal(merged[1].variant, 'standard');
});

test('Crescent Reaper 4-Stage Simulation: Laser-Shaft stage (crescentScale=0) vs Sideways Crescent Unfurl (crescentScale=1)', () => {
  // Rival placed laterally off the tip (x = 290, y = 165) — off the main y=100 laser shaft,
  // right where the sideways Crescent Blade unfurls!
  const lateralRival: TankKinematics = {
    index: 1,
    x: 290,
    y: 165,
    vx: 0,
    vy: 0,
    angle: Math.PI,
    radius: 12,
    alive: true,
  };
  const axialRival: TankKinematics = {
    index: 2,
    x: 260,
    y: 100,
    vx: 0,
    vy: 0,
    angle: Math.PI,
    radius: 12,
    alive: true,
  };

  // Stage 2 (`crescentScale = 0`): straight laser shaft hits axialRival (`2`) ONLY; crescent curves stay empty!
  const stage2ShaftOnly = computeReaperBlades(
    100,
    100,
    0,
    0,
    200,
    [lateralRival, axialRival],
    1.0,
    0,
  );
  assert.equal(stage2ShaftOnly.crescentA.length, 0);
  assert.equal(stage2ShaftOnly.crescentB.length, 0);
  assert.deepEqual(stage2ShaftOnly.hitVictimIndices, [2]);

  // Stage 3 & 4 (`crescentScale = 1`): sideways crescent blades unfurl at peak and slice lateralRival (`1`) too!
  const stage3FullReaper = computeReaperBlades(
    100,
    100,
    0,
    0,
    200,
    [lateralRival, axialRival],
    1.0,
    1,
  );
  assert.ok(stage3FullReaper.crescentA.length >= 6);
  assert.deepEqual(stage3FullReaper.hitVictimIndices, [1, 2]);

  // Crate pickup stays blocked during Stage 2/3 deploy (`reaperDeployRemaining > 0`)
  assert.equal(
    canPickupCrate({
      skill: 'reaper',
      ammo: 1,
      chargingLaserRemaining: 0,
      reaperWindupRemaining: 0,
      reaperDeployRemaining: 0.3,
      reaperSpinRemaining: 3.7,
    }),
    false,
  );
});

test('Removed 8x5 & 9x6 maps and added 22x13 Imperial Bastion + 24x14 Leviathan super-maps fitting PC & Mobile', () => {
  const removedIds = ['classic_duel', 'crossfire_chambers', 'four_corners', 'procedural_classic'];
  const allModeIds = MAP_MODES.map((m) => m.id as string);
  for (const oldId of removedIds) {
    assert.equal(allModeIds.includes(oldId), false, `Removed map ${oldId} should not remain in MAP_MODES`);
    assert.equal(oldId in PRESET_MAZE_MAP, false, `Removed map ${oldId} should not remain in PRESET_MAZE_MAP`);
  }

  for (const m of MAP_MODES) {
    if (m.id === 'mix') continue;
    const g = resolveMazeForRound(m.id, 1, 4, 2027);
    assert.ok(
      g.cols * g.rows >= 60,
      `Map ${m.id} (${g.cols}x${g.rows}) must be larger than removed 8x5 (40) & 9x6 (54) maps`,
    );
  }

  // Verify the 2 new maps larger than the old 20x12 (240-cell) maximum
  const bastion = resolveMazeForRound('imperial_bastion', 1, 4, 777);
  assert.equal(bastion.cols, 22);
  assert.equal(bastion.rows, 13);
  assert.ok(bastion.cols * bastion.rows > 240, 'imperial_bastion (286 cells) must exceed 20x12 (240 cells)');
  assert.equal(isMazeValidAndConnected(bastion), true);

  const leviathan = resolveMazeForRound('procedural_leviathan', 1, 4, 777);
  assert.equal(leviathan.cols, 24);
  assert.equal(leviathan.rows, 14);
  assert.ok(leviathan.cols * leviathan.rows > 240, 'procedural_leviathan (336 cells) must exceed 20x12 (240 cells)');
  assert.equal(isMazeValidAndConnected(leviathan), true);

  for (const superGrid of [bastion, leviathan]) {
    for (const vp of [ARENA_VIEWPORT, MOBILE_ARENA_VIEWPORT]) {
      const layout = buildArenaLayout(superGrid, 4, 777, vp);
      assert.ok(layout.width <= vp.maxWidth, `${superGrid.id} width ${layout.width} > ${vp.maxWidth}`);
      assert.ok(layout.height <= vp.maxHeight, `${superGrid.id} height ${layout.height} > ${vp.maxHeight}`);
      assert.equal(layout.spawns.length, 4);
    }
  }
});

test('AI Behavior Tree upgrades: maze-path target selection, Shield wall discipline, TNT trap detonation, and Camper anti-freeze', () => {
  // Build a 6x2 maze where row 0 and row 1 are separated by a long horizontal wall (cols 0..4), connected only at col 5!
  const g = createEmptySolidGrid('ai_bt_maze', 'AI BT Maze', 6, 2, 1);
  for (let r = 0; r < 2; r++) {
    for (let c = 1; c < 6; c++) {
      g.vWalls[r][c] = false; // Open horizontal corridors on row 0 and row 1
    }
  }
  g.hWalls[1][5] = false; // Only doorway between row 0 and row 1 is at far-East col 5!
  const arena = buildArenaLayout(g, 3, 1);

  const cellCenter = (col: number, row: number) => ({
    x: arena.originX + (col + 0.5) * arena.cellSize,
    y: arena.originY + (row + 0.5) * arena.cellSize,
  });

  // Bot at (0, 0) facing East (angle 0)
  const botPos = cellCenter(0, 0);
  const bot: TankKinematics = {
    index: 0,
    x: botPos.x,
    y: botPos.y,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };

  // Enemy 1 at (0, 1): Euclidean distance is tiny (1 cell South), but separated by solid wall (11 maze steps around col 5)!
  const walledPos = cellCenter(0, 1);
  const walledEnemy: TankKinematics = {
    index: 1,
    x: walledPos.x,
    y: walledPos.y,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };

  // Enemy 2 at (2, 0): 2 cells East in open corridor!
  const openPos = cellCenter(2, 0);
  const openEnemy: TankKinematics = {
    index: 2,
    x: openPos.x,
    y: openPos.y,
    vx: 0,
    vy: 0,
    angle: Math.PI,
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };

  // 1. Shield wall-occlusion discipline: Walled enemy 1 cell away across a solid wall must NOT waste Aegis Shield!
  const shieldThroughWall = computeBotDecision(
    {
      difficulty: 'super_hard',
      dt: 1 / 60,
      self: bot,
      selfSkill: 'shield',
      selfSkillAmmo: 1,
      selfAmmo: 10,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: true,
      tanks: [bot, walledEnemy],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [],
      crates: [],
      spikeZones: [],
      mines: [],
      arena,
    },
    createAISlotMemory(0),
    new SeededRng(11),
  );
  assert.equal(
    shieldThroughWall.firePressed,
    false,
    'AI must NOT waste Aegis Shield when close enemy is completely blocked by a solid wall',
  );

  // 2. Maze-path target selection: Bot fires straight East at reachable openEnemy (col 2, row 0) instead of turning South toward walledEnemy!
  const pathTargetDecision = computeBotDecision(
    {
      difficulty: 'hard',
      dt: 1 / 60,
      self: bot,
      selfSkill: null,
      selfSkillAmmo: 0,
      selfAmmo: 10,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: true,
      tanks: [bot, walledEnemy, openEnemy],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [],
      crates: [],
      spikeZones: [],
      mines: [],
      arena,
    },
    createAISlotMemory(0),
    new SeededRng(12),
  );
  assert.equal(pathTargetDecision.firePressed, true, 'Bot should fire immediately at reachable corridor enemy');

  // 3. Camper anti-freeze: When only walledEnemy (11 steps away around col 5) exists, camper MUST drive East along row 0 instead of freezing!
  const camperMove = computeBotDecision(
    {
      difficulty: 'hard',
      tactic: 'camper',
      dt: 1 / 60,
      self: bot,
      selfSkill: null,
      selfSkillAmmo: 0,
      selfAmmo: 10,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: false,
      tanks: [bot, walledEnemy],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [],
      crates: [],
      spikeZones: [],
      mines: [],
      arena,
    },
    createAISlotMemory(0),
    new SeededRng(13),
  );
  assert.equal(
    camperMove.forward,
    true,
    'Camper AI must navigate around long wall (>4 steps) instead of freezing behind solid wall',
  );

  // 4. TNT Barrel intelligence: Avoids self-blast & detonates TNT barrel trapping an enemy!
  const barrelNearSelf = {
    id: 1,
    x: bot.x + arena.cellSize * 0.55,
    y: bot.y,
    radius: 12 * arena.scaleRatio,
    blastRadius: arena.cellSize * 1.4,
    active: true,
    fuseRemainingSec: null,
  };
  const selfBlastTrace = traceBallisticShot(
    bot.x + 20 * arena.scaleRatio,
    bot.y,
    0,
    0,
    [bot, openEnemy],
    new Set(),
    arena.walls,
    1,
    800,
    4.5 * arena.scaleRatio,
    0,
    [barrelNearSelf],
    true,
  );
  assert.equal(selfBlastTrace.selfHitRisk, true, 'Shooting a TNT barrel within own blast radius must flag selfHitRisk');

  const farEnemyPos = cellCenter(4, 0);
  const farEnemy: TankKinematics = {
    ...openEnemy,
    x: farEnemyPos.x,
    y: farEnemyPos.y + arena.cellSize * 0.3, // Slightly off-axis from straight shot, but inside TNT blast radius!
  };
  const trapBarrel = {
    id: 2,
    x: farEnemyPos.x - arena.cellSize * 0.25,
    y: bot.y,
    radius: 12 * arena.scaleRatio,
    blastRadius: arena.cellSize * 1.4,
    active: true,
    fuseRemainingSec: null,
  };
  const trapShotTrace = traceBallisticShot(
    bot.x + 20 * arena.scaleRatio,
    bot.y,
    0,
    0,
    [bot, farEnemy],
    new Set(),
    arena.walls,
    1,
    900,
    4.5 * arena.scaleRatio,
    0,
    [trapBarrel],
    true,
  );
  assert.equal(trapShotTrace.hitsEnemy, true, 'Hard/Super Hard AI should recognize TNT barrel blast trapping nearby enemy');
  assert.equal(trapShotTrace.selfHitRisk, false);
});

test('Online PC vs Mobile cross-platform sync: authoritative viewport clears BOTH Mobile joysticks/pills AND PC scoreboard with identical walls', () => {
  assert.deepEqual(resolveOnlineArenaViewport(false, false), ARENA_VIEWPORT);
  assert.deepEqual(resolveOnlineArenaViewport(true, true), MOBILE_ARENA_VIEWPORT);
  assert.deepEqual(resolveOnlineArenaViewport(true, false), CROSS_PLATFORM_ARENA_VIEWPORT);
  assert.deepEqual(resolveOnlineArenaViewport(false, true), CROSS_PLATFORM_ARENA_VIEWPORT);

  for (const mode of MAP_MODES) {
    const hostGrid = resolveMazeForRound(mode.id, 2, 2, 98765);
    const crossVp = resolveOnlineArenaViewport(true, false);

    // Host (Mobile) and Guest (PC) build layout from Host's authoritative grid & viewport
    const mobileHostLayout = buildArenaLayout(hostGrid, 2, 98765, crossVp);
    const pcGuestLayout = buildArenaLayout(
      JSON.parse(JSON.stringify(hostGrid)),
      2,
      98765,
      { ...crossVp },
    );

    // 1. Pixel-for-pixel identical origin, cellSize, walls, and spawns between Mobile and PC!
    assert.equal(mobileHostLayout.originX, pcGuestLayout.originX);
    assert.equal(mobileHostLayout.originY, pcGuestLayout.originY);
    assert.equal(mobileHostLayout.cellSize, pcGuestLayout.cellSize);
    assert.deepEqual(mobileHostLayout.walls, pcGuestLayout.walls);
    assert.deepEqual(mobileHostLayout.spawns, pcGuestLayout.spawns);

    // 2. Clears Mobile top compact score pills (`y >= 76`) AND Mobile left/right thumb gutters (`x: 212..1068`)
    assert.ok(
      mobileHostLayout.originX >= (DESIGN_WIDTH - MOBILE_ARENA_VIEWPORT.maxWidth) / 2,
      `${mode.id} intruded into Mobile left thumb gutter: originX=${mobileHostLayout.originX}`,
    );
    assert.ok(
      mobileHostLayout.originX + mobileHostLayout.width <=
        DESIGN_WIDTH - (DESIGN_WIDTH - MOBILE_ARENA_VIEWPORT.maxWidth) / 2,
      `${mode.id} intruded into Mobile right thumb gutter`,
    );
    assert.ok(
      mobileHostLayout.originY >= MOBILE_ARENA_VIEWPORT.topBarHeight,
      `${mode.id} overlapped Mobile top score pills: originY=${mobileHostLayout.originY}`,
    );

    // 3. Clears PC bottom scoreboard plaques (`y <= DESIGN_HEIGHT - ARENA_VIEWPORT.bottomBarHeight = 648`)!
    const pcScoreboardTopY = DESIGN_HEIGHT - ARENA_VIEWPORT.bottomBarHeight;
    assert.ok(
      pcGuestLayout.originY + pcGuestLayout.height <= pcScoreboardTopY,
      `${mode.id} bottom (${pcGuestLayout.originY + pcGuestLayout.height}) overlapped PC scoreboard (${pcScoreboardTopY})`,
    );
  }
});

test('Widescreen Mobile viewport & arena scaling: reclaims 20:9 phone sidebars, enlarges map, and preserves thumb control gutters', () => {
  // Desktop always stays 1280
  assert.equal(computeMobileLogicalWidth(1920, 1080, false), DESIGN_WIDTH);

  // Modern 20:9 / 19.5:9 phone (844x390 landscape) expands cleanly to an even logical width > 1600
  const phoneLogicalW = computeMobileLogicalWidth(844, 390, true);
  assert.equal(phoneLogicalW % 2, 0);
  assert.ok(phoneLogicalW >= 1640 && phoneLogicalW <= 1680);

  const viewLeft = -(phoneLogicalW - DESIGN_WIDTH) / 2;
  const viewRight = DESIGN_WIDTH + (phoneLogicalW - DESIGN_WIDTH) / 2;
  assert.equal(viewLeft + viewRight, DESIGN_WIDTH, 'Screen center must remain at world x = 640');

  const widescreenVp = resolveLocalMobileArenaViewport(phoneLogicalW);
  assert.ok(widescreenVp.maxWidth > MOBILE_ARENA_VIEWPORT.maxWidth);

  for (const mode of MAP_MODES) {
    const grid = resolveMazeForRound(mode.id, 1, 2, 13579);
    const wideArena = buildArenaLayout(grid, 2, 13579, widescreenVp);

    // Must never overlap the left/right 2P Opposite or Solo enlarged thumb zones (`viewLeft + 234`, `viewRight - 234`)
    assert.ok(
      wideArena.originX >= viewLeft + 236,
      `${mode.id} overlapped left widescreen control cluster: originX=${wideArena.originX}, leftZoneEnd=${viewLeft + 234}`,
    );
    assert.ok(
      wideArena.originX + wideArena.width <= viewRight - 236,
      `${mode.id} overlapped right widescreen control cluster`,
    );
    assert.ok(
      wideArena.originY >= widescreenVp.topBarHeight,
      `${mode.id} overlapped compact mobile top HUD`,
    );
  }

  // Wide maps (e.g., 14x9 `procedural_large`) render noticeably larger on widescreen phones than 1280 baseline!
  const citadelGrid = resolveMazeForRound('procedural_large', 1, 2, 2468);
  const oldNarrowArena = buildArenaLayout(citadelGrid, 2, 2468, {
    maxWidth: 856,
    maxHeight: 644,
    centerX: 640,
    centerY: 414,
  });
  const newWidescreenArena = buildArenaLayout(citadelGrid, 2, 2468, widescreenVp);
  assert.ok(
    newWidescreenArena.cellSize > oldNarrowArena.cellSize,
    `Expected larger cellSize on widescreen mobile (${newWidescreenArena.cellSize} vs ${oldNarrowArena.cellSize})`,
  );
});

test('AI Navigation & 10-Skill Mastery: zero tail-first reverse navigation and dedicated tactics for Shield, Scatter, Flame, Mine, Drill, Homing & Reaper', () => {
  // 1. Corridor maze test: 6x2 grid where row 0 is a straight corridor (cols 0..5) and (0,1) is a 1-exit dead-end!
  const grid = createEmptySolidGrid('ai_mastery', 'AI Mastery', 6, 2, 1);
  for (let c = 0; c < 5; c++) {
    grid.vWalls[0][c + 1] = false; // Open straight corridor along row 0: (0,0)-(5,0)
  }
  grid.hWalls[1][0] = false; // (0,1) only connects North to (0,0) -> 1-exit dead-end!
  grid.hWalls[1][2] = false; // (2,1) connects North to (2,0)
  grid.vWalls[1][3] = false; // (2,1)-(3,1) open

  const arena = buildArenaLayout(grid, 2, 42);
  const cc = (col: number, row: number) => ({
    x: arena.originX + (col + 0.5) * arena.cellSize,
    y: arena.originY + (row + 0.5) * arena.cellSize,
  });

  // A. Bug regression ("lâu lâu AI có dấu hiệu đi lùi"):
  // Bot at (4,0) facing EAST (angle = 0), while Crate & Enemy are WEST at (1,0) & (0,0) (180 deg behind bot!).
  // Hard & Super Hard AI MUST pivot-turn its nose around (`backward === false`), NEVER lock into tail-first reverse!
  const eastFacingBot: TankKinematics = {
    index: 0,
    ...cc(4, 0),
    vx: 0,
    vy: 0,
    angle: 0, // Facing East, away from West goal!
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };
  const westEnemy: TankKinematics = {
    index: 1,
    ...cc(0, 0),
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };
  const westCrate = {
    id: 99,
    col: 2,
    row: 0,
    ...cc(2, 0),
    radius: 13 * arena.scaleRatio,
    spawnAge: 1,
  };

  for (const diff of ['hard', 'super_hard'] as const) {
    const navDecision = computeBotDecision(
      {
        difficulty: diff,
        dt: 1 / 60,
        self: eastFacingBot,
        selfSkill: null,
        selfSkillAmmo: 0,
        selfAmmo: 10,
        selfShielded: false,
        selfReaperSweeping: false,
        selfChargingLaser: false,
        canFire: false,
        tanks: [eastFacingBot, westEnemy],
        shieldedTankIndices: new Set(),
        reaperTankIndices: new Set(),
        projectiles: [],
        crates: [westCrate],
        spikeZones: [],
        mines: [],
        arena,
      },
      createAISlotMemory(0),
      new SeededRng(7),
    );
    assert.equal(
      navDecision.backward,
      false,
      `${diff} AI must pivot-turn nose-first toward behind-tank objectives instead of driving in reverse`,
    );
    assert.equal(navDecision.left || navDecision.right, true, `${diff} AI must rotate nose toward corridor goal`);
  }

  // B. SHIELD: Pops Aegis Shield immediately when an enemy across walls is charging a 2s Laser aimed at the AI!
  const laserEnemy: TankKinematics = {
    index: 1,
    ...cc(5, 1), // Behind solid walls!
    vx: 0,
    vy: 0,
    angle: Math.atan2(eastFacingBot.y - cc(5, 1).y, eastFacingBot.x - cc(5, 1).x),
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };
  const antiLaserShield = computeBotDecision(
    {
      difficulty: 'hard',
      dt: 1 / 60,
      self: eastFacingBot,
      selfSkill: 'shield',
      selfSkillAmmo: 1,
      selfAmmo: 10,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: true,
      tanks: [eastFacingBot, laserEnemy],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      laserChargingTankIndices: new Set([1]),
      projectiles: [],
      crates: [],
      spikeZones: [],
      mines: [],
      arena,
    },
    createAISlotMemory(0),
    new SeededRng(8),
  );
  assert.equal(antiLaserShield.firePressed, true, 'AI with Shield must pop Aegis Shield when targeted by enemy Laser charge');

  // C. MINE: Never drops mine inside 1-exit dead-end `(0,1)`, DOES drop mine at multi-exit intersection `(2,0)` and drives forward away!
  const deadEndBot: TankKinematics = { ...eastFacingBot, ...cc(0, 1), angle: -Math.PI / 2 };
  const closeChaser: TankKinematics = { ...westEnemy, ...cc(1, 0) };
  const mineDeadEndDecision = computeBotDecision(
    {
      difficulty: 'hard',
      dt: 1 / 60,
      self: deadEndBot,
      selfSkill: 'mine',
      selfSkillAmmo: 3,
      selfAmmo: 10,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: true,
      tanks: [deadEndBot, closeChaser],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [],
      crates: [],
      spikeZones: [],
      mines: [],
      arena,
    },
    createAISlotMemory(0),
    new SeededRng(9),
  );
  assert.equal(mineDeadEndDecision.firePressed, false, 'AI must not trap itself with a Proximity Mine inside a 1-exit dead-end');

  const junctionBot: TankKinematics = { ...eastFacingBot, ...cc(2, 0), angle: 0 };
  const mineMem = createAISlotMemory(0);
  const mineJunctionDecision = computeBotDecision(
    {
      difficulty: 'hard',
      dt: 1 / 60,
      self: junctionBot,
      selfSkill: 'mine',
      selfSkillAmmo: 3,
      selfAmmo: 10,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: true,
      tanks: [junctionBot, closeChaser],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [],
      crates: [],
      spikeZones: [],
      mines: [],
      arena,
    },
    mineMem,
    new SeededRng(10),
  );
  assert.equal(mineJunctionDecision.firePressed, true, 'AI must plant Mine at 3-way corridor junction when enemy is pursuing');
  assert.ok(mineMem.mineClearTimer > 0, 'AI must engage forward mine-clearance timer after dropping a mine');

  // D. DRILL: Fires through interior wall between (3,0) and (3,1), but refuses to fire into outer East border wall!
  const drillBotSouth: TankKinematics = { ...eastFacingBot, ...cc(3, 0), angle: Math.PI / 2 };
  const enemyBehindInteriorWall: TankKinematics = { ...westEnemy, ...cc(3, 1) };
  const drillInterior = computeBotDecision(
    {
      difficulty: 'hard',
      dt: 1 / 60,
      self: drillBotSouth,
      selfSkill: 'drill',
      selfSkillAmmo: 2,
      selfAmmo: 10,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: true,
      tanks: [drillBotSouth, enemyBehindInteriorWall],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [],
      crates: [],
      spikeZones: [],
      mines: [],
      arena,
    },
    createAISlotMemory(0),
    new SeededRng(11),
  );
  assert.equal(drillInterior.firePressed, true, 'AI with Drill must breach interior maze wall directly onto enemy');

  // E. FLAME: Pre-fires dragon flame around 90-degree doorway corner `(2,0) -> (2,1)` AND incinerates front-cone enemy shell!
  const flameCornerBot: TankKinematics = { ...eastFacingBot, ...cc(2, 0), angle: Math.PI / 2 };
  const enemyAroundCorner: TankKinematics = { ...westEnemy, ...cc(3, 1) }; // Occluded by hWalls[1][3], 2 steps via (2,1)!
  const flameCorner = computeBotDecision(
    {
      difficulty: 'super_hard',
      dt: 1 / 60,
      self: flameCornerBot,
      selfSkill: 'flame',
      selfSkillAmmo: 80,
      selfAmmo: 10,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: true,
      tanks: [flameCornerBot, enemyAroundCorner],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [],
      crates: [],
      spikeZones: [],
      mines: [],
      arena,
    },
    createAISlotMemory(0),
    new SeededRng(12),
  );
  assert.equal(flameCorner.firePressed, true, 'AI with Flame must pre-spray sliding fire through open corner doorway');

  // F. SCATTER: Fires 5-pellet fan when an outer +17.8 deg pellet hits an off-axis enemy in open space!
  const openGrid = createEmptySolidGrid('scatter_open', 'Scatter Open', 4, 3, 1);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 4; c++) {
      if (r > 0) openGrid.hWalls[r][c] = false;
      if (c > 0) openGrid.vWalls[r][c] = false;
    }
  }
  const openArena = buildArenaLayout(openGrid, 2, 1);
  const scatterBot: TankKinematics = {
    index: 0,
    x: openArena.originX + openArena.cellSize * 0.8,
    y: openArena.originY + openArena.cellSize * 1.5,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 14.5 * openArena.scaleRatio,
    alive: true,
  };
  const outerFanAng = POWERUP_CONFIG.scatterSpreadStepRad * 2; // +17.8 deg outer pellet!
  const offAxisDist = openArena.cellSize * 2.1;
  const offAxisEnemy: TankKinematics = {
    index: 1,
    x: scatterBot.x + Math.cos(outerFanAng) * offAxisDist,
    y: scatterBot.y + Math.sin(outerFanAng) * offAxisDist,
    vx: 0,
    vy: 0,
    angle: Math.PI,
    radius: 14.5 * openArena.scaleRatio,
    alive: true,
  };
  const scatterVolley = computeBotDecision(
    {
      difficulty: 'hard',
      dt: 1 / 60,
      self: scatterBot,
      selfSkill: 'scatter',
      selfSkillAmmo: 3,
      selfAmmo: 10,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: true,
      tanks: [scatterBot, offAxisEnemy],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [],
      crates: [],
      spikeZones: [],
      mines: [],
      arena: openArena,
    },
    createAISlotMemory(0),
    new SeededRng(13),
  );
  assert.equal(scatterVolley.firePressed, true, 'AI with Scatter must recognize hits from outer +-17.8 deg fan pellets');

  // G. REAPER: Holds Reaper when enemy is too far in open sight (4.2 cells > 3.1 cells), then triggers inside lethal range (2.8 cells)!
  const farReaperEnemy: TankKinematics = {
    ...offAxisEnemy,
    x: scatterBot.x + openArena.cellSize * 3.9,
    y: scatterBot.y,
  };
  const holdReaper = computeBotDecision(
    {
      difficulty: 'super_hard',
      dt: 1 / 60,
      self: scatterBot,
      selfSkill: 'reaper',
      selfSkillAmmo: 1,
      selfAmmo: 10,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: true,
      tanks: [scatterBot, farReaperEnemy],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [],
      crates: [],
      spikeZones: [],
      mines: [],
      arena: openArena,
    },
    createAISlotMemory(0),
    new SeededRng(14),
  );
  assert.equal(holdReaper.firePressed, false, 'AI with Reaper must rush closer instead of wasting Reaper at max edge where enemy walks out');
  assert.equal(holdReaper.forward, true, 'AI with Reaper must rush forward toward target');

  const closeReaperEnemy: TankKinematics = {
    ...offAxisEnemy,
    x: scatterBot.x + openArena.cellSize * 2.6,
    y: scatterBot.y,
  };
  const fireReaper = computeBotDecision(
    {
      difficulty: 'super_hard',
      dt: 1 / 60,
      self: scatterBot,
      selfSkill: 'reaper',
      selfSkillAmmo: 1,
      selfAmmo: 10,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: true,
      tanks: [scatterBot, closeReaperEnemy],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [],
      crates: [],
      spikeZones: [],
      mines: [],
      arena: openArena,
    },
    createAISlotMemory(0),
    new SeededRng(15),
  );
  assert.equal(fireReaper.firePressed, true, 'AI with Reaper must trigger scythe once safely deep inside lethal radius');

  // H. HOMING MISSILE TACTICS (2.5s lock + slower flight + Dual-BFS launch + Fire-and-Disengage peel-off!):
  assert.equal(POWERUP_CONFIG.homingBallisticSec, 2.5, 'Homing lock delay should be 2.5s');
  assert.ok(
    POWERUP_CONFIG.homingBallisticSpeedMultiplier < 0.85 &&
      POWERUP_CONFIG.homingSeekSpeedMultiplier < 1.0,
    'Homing missile should fly slower and more tactically in both ballistic and seeking phases',
  );

  // H1. Trap pocket rejection: In a U-maze where shooting South into dead-end pocket `(0,1)` puts 2.5s lock-point
  //     closer in BFS steps to AI `(0,0)` than to Enemy `(3,1)`, AI MUST NOT fire south — instead it aims East down row 0!
  const hmBot: TankKinematics = {
    index: 0,
    ...cc(0, 0),
    vx: 0,
    vy: 0,
    angle: Math.PI / 2, // Facing South straight into the 1-exit dead-end `(0,1)`!
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };
  const hmEnemy: TankKinematics = {
    index: 1,
    ...cc(3, 1), // Reachable via East corridor `(0,0)->(1,0)->(2,0)->(2,1)->(3,1)` (5 steps)!
    vx: 0,
    vy: 0,
    angle: Math.PI,
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };
  const hmTrapCheck = computeBotDecision(
    {
      difficulty: 'super_hard',
      dt: 1 / 60,
      self: hmBot,
      selfSkill: 'homing',
      selfSkillAmmo: 1,
      selfAmmo: 10,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: true,
      tanks: [hmBot, hmEnemy],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [],
      crates: [],
      spikeZones: [],
      mines: [],
      arena,
    },
    createAISlotMemory(0),
    new SeededRng(16),
  );
  assert.equal(
    hmTrapCheck.firePressed,
    false,
    'AI with Homing must refuse to fire into a dead-end pocket where 2.5s BFS lock would target itself',
  );
  assert.equal(hmTrapCheck.left, true, 'AI with Homing must rotate nose from South (+90 deg) toward East (0 deg) corridor');

  // H2. Starting facing South (`angle = +90 deg`), let AI rotate & pick its optimal corridor/bank angle toward `(3,1)`
  //     behind walls — within <= 30 frames (0.5s), it aligns onto the East corridor and FIRES!
  const simBot: TankKinematics = { ...hmBot };
  const hmMem = createAISlotMemory(0);
  const hmRng = new SeededRng(17);
  let launchedBehindWalls = false;
  for (let step = 0; step < 35; step++) {
    const dec = computeBotDecision(
      {
        difficulty: 'super_hard',
        dt: 1 / 60,
        self: simBot,
        selfSkill: 'homing',
        selfSkillAmmo: 1,
        selfAmmo: 10,
        selfShielded: false,
        selfReaperSweeping: false,
        selfChargingLaser: false,
        canFire: true,
        tanks: [simBot, hmEnemy],
        shieldedTankIndices: new Set(),
        reaperTankIndices: new Set(),
        projectiles: [],
        crates: [],
        spikeZones: [],
        mines: [],
        arena,
      },
      hmMem,
      hmRng,
    );
    if (dec.left) simBot.angle -= BASE_GAMEPLAY.tankTurnSpeedRad * (1 / 60);
    if (dec.right) simBot.angle += BASE_GAMEPLAY.tankTurnSpeedRad * (1 / 60);
    if (dec.firePressed) {
      launchedBehindWalls = true;
      break;
    }
  }
  assert.equal(launchedBehindWalls, true, 'AI with Homing must rotate out of dead-end aim and launch down corridor behind walls');
  assert.ok(hmMem.homingRetreatTimer > 2.5, 'AI must set post-launch disengage timer');

  // H3. Fire-and-Disengage ("bắn xong tách ngã rẽ, không chạy đuổi theo sau tên lửa"):
  //     Suppose AI at `(2,0)` just fired a Homing Missile East (`vx > 0` at `(2.4, 0)`), and `selfSkill` is now `null`.
  //     Instead of driving East into `(3,0)` right behind its own slower missile, AI MUST peel off West toward `(0,0)`!
  const postLaunchBot: TankKinematics = {
    index: 0,
    ...cc(2, 0),
    vx: 0,
    vy: 0,
    angle: Math.PI, // Facing West (away from the missile flying East!)
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };
  const liveMissile: ProjectileKinematics = {
    id: 777,
    ownerIndex: 0,
    x: cc(2, 0).x + arena.cellSize * 0.4,
    y: cc(2, 0).y,
    prevX: cc(2, 0).x,
    prevY: cc(2, 0).y,
    vx: BASE_GAMEPLAY.projectileSpeed * POWERUP_CONFIG.homingBallisticSpeedMultiplier * arena.scaleRatio,
    vy: 0,
    radius: 4.8 * arena.scaleRatio,
    age: 0.2, // Early in 2.5s ballistic phase!
    maxLifetime: POWERUP_CONFIG.homingTotalLifetimeSec,
    bounces: 0,
    maxBounces: 24,
    graceTimer: 0,
    active: true,
    variant: 'homing_missile',
    bounceBehavior: 'reflect',
  };
  const peelOffDecision = computeBotDecision(
    {
      difficulty: 'super_hard',
      dt: 1 / 60,
      self: postLaunchBot,
      selfSkill: null, // Suit already reverted to standard after firing Homing!
      selfSkillAmmo: 0,
      selfAmmo: 10,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: false,
      tanks: [postLaunchBot, { ...hmEnemy, ...cc(5, 0) }],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [liveMissile],
      crates: [],
      spikeZones: [],
      mines: [],
      arena,
    },
    hmMem,
    new SeededRng(18),
  );
  assert.equal(
    peelOffDecision.forward,
    true,
    'After firing Homing East, AI facing West must drive forward West away from its own missile instead of following it East!',
  );
  assert.equal(peelOffDecision.backward, false);
});

test('5 New Skills (#2 EMP, #3 Phantom, #4 Cryo, #5 Barrier, #6 Warp) physics & AI mastery work cleanly', () => {
  const grid = createEmptySolidGrid('new5', 'New 5 Skills Lab', 6, 4, 42);
  for (let r = 0; r < 4; r++) {
    for (let c = 1; c < 6; c++) grid.vWalls[r][c] = false;
  }
  for (let r = 1; r < 4; r++) {
    for (let c = 0; c < 6; c++) grid.hWalls[r][c] = false;
  }
  // Place a solid interior vertical wall between col 2 and col 3 at row 1
  grid.vWalls[1][3] = true;

  const arena = buildArenaLayout(grid, 2, 42);
  const cc = (col: number, row: number) => ({
    x: arena.originX + (col + 0.5) * arena.cellSize,
    y: arena.originY + (row + 0.5) * arena.cellSize,
  });

  // 1. Phantom Phase (`phantom`): bypasses interior walls, clamps outer perimeter, and ejects cleanly on expiry!
  const perimeterWalls = computeArenaPerimeterWalls(arena);
  assert.equal(perimeterWalls.length, 4);
  const wallX = arena.originX + 3 * arena.cellSize;
  const wallY = arena.originY + 1.5 * arena.cellSize;
  const ghostTank: TankKinematics = {
    index: 0,
    x: wallX,
    y: wallY,
    vx: 0,
    vy: 0,
    angle: 0,
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };
  const normalBlockedTank: TankKinematics = {
    ...ghostTank,
    index: 1,
    y: arena.originY + 0.5 * arena.cellSize,
  };
  resolveAllTankCollisions(
    [ghostTank, normalBlockedTank],
    arena.walls,
    new Set([0]),
    perimeterWalls,
  );
  assert.equal(
    Math.abs(ghostTank.x - wallX) < 0.01,
    true,
    'Phantom tank must stand freely inside an interior wall without being pushed out while phased',
  );
  const ejected = ejectTankFromInteriorWalls(ghostTank, arena);
  assert.equal(ejected, true, 'Expiring Phantom mid-wall must smoothly eject tank clear of the wall');
  assert.ok(
    Math.abs(ghostTank.x - wallX) >= ghostTank.radius * 0.9,
    'Ejected tank must no longer overlap interior wall',
  );

  // 2. Energy Barrier (`barrier`): seals open interior grid edge ahead, updates `arena.walls`, and shatters via Laser/EMP!
  const architect: TankKinematics = {
    index: 0,
    ...cc(1, 1),
    vx: 0,
    vy: 0,
    angle: 0, // Facing East toward open edge `vWalls[1][2]`
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };
  const rival: TankKinematics = {
    index: 1,
    ...cc(4, 1),
    vx: 0,
    vy: 0,
    angle: Math.PI,
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };
  const wallsBefore = arena.walls.length;
  const barrier = deployEnergyBarrierAhead(architect, arena, [architect, rival], 501, 8.0);
  assert.ok(barrier !== null, 'Barrier must deploy on open interior edge ahead of tank');
  assert.equal(barrier!.kind, 'v');
  assert.equal(barrier!.c, 2);
  assert.equal(arena.grid.vWalls[1][2], true);
  assert.ok(arena.walls.length >= wallsBefore, 'Barrier must rebuild solid arena walls');

  const laserHitIds = findBarriersHitByPolyline(
    [cc(0, 1), cc(5, 1)],
    5.5 * arena.scaleRatio,
    [barrier!],
  );
  assert.deepEqual(laserHitIds, [501], 'Cross-map Laser beam must detect and shatter Energy Barrier');

  // 3. EMP Pulse (`emp`): pierces walls to hit enemy tanks, clears mines, and clears barriers!
  const enemyMine: ProximityMineState = {
    id: 99,
    ownerIndex: 1,
    x: barrier!.x0 + 8,
    y: barrier!.y0,
    age: 2.0,
    armingSec: 1.6,
    duration: 28,
    triggerRadius: 24,
    blastRadius: 44,
  };
  const empImpact = computeEmpBlastImpact(
    barrier!.x0,
    barrier!.y0,
    arena.cellSize * POWERUP_CONFIG.empBlastCellsRadius,
    0,
    [architect, { ...rival, ...cc(2, 1) }],
    [enemyMine],
    [barrier!],
  );
  assert.deepEqual(empImpact.hitEnemyIndices, [1], 'EMP shockwave must hit rival tank without hitting owner');
  assert.deepEqual(empImpact.clearedMineIds, [99], 'EMP shockwave must neutralize mines in radius');
  assert.deepEqual(empImpact.clearedBarrierIds, [501], 'EMP shockwave must shatter Energy Barriers in radius');

  removeEnergyBarrierFromArena(barrier!, arena);
  assert.equal(arena.grid.vWalls[1][2], false);

  // 4. Cryo Zone (`cryo`): affects rival tanks inside ice radius while sparing the owner!
  const cryoZone = {
    id: 301,
    ownerIndex: 0 as const,
    ...cc(2, 2),
    radius: arena.cellSize * POWERUP_CONFIG.cryoZoneCellsRadius,
    age: 0.5,
    duration: 6.0,
  };
  const sliding = findTanksInCryoZones(
    [cryoZone],
    [
      { ...architect, ...cc(2, 2) },
      { ...rival, ...cc(2, 2) },
    ],
  );
  assert.equal(sliding.has(0), false, 'Owner must not suffer self-inflicted ice drift on own Cryo Zone');
  assert.equal(sliding.has(1), true, 'Rival tank inside Cryo Zone must suffer ice drift');

  // 5. Spatial Warp (`warp`): departure rift shockwave catches point-blank pursuer!
  const warpVictims = computeWarpBlastVictims(
    architect.x,
    architect.y,
    0,
    POWERUP_CONFIG.warpBlastRadius * arena.scaleRatio,
    [architect, { ...rival, x: architect.x + 24 * arena.scaleRatio, y: architect.y }],
  );
  assert.deepEqual(warpVictims, [1]);

  // 6. AI Mastery of New Skills: remote EMP detonation & Warp recall under point-blank pursuit!
  const aiMem = createAISlotMemory(0);
  const empDetDecision = computeBotDecision(
    {
      difficulty: 'super_hard',
      dt: 1 / 60,
      self: architect,
      selfSkill: null,
      selfSkillAmmo: 0,
      selfAmmo: 10,
      selfShielded: false,
      hasActiveEmpOrb: true,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: true,
      tanks: [architect, rival],
      shieldedTankIndices: new Set([1]),
      reaperTankIndices: new Set(),
      projectiles: [
        {
          id: 12,
          ownerIndex: 0,
          x: rival.x - 20,
          y: rival.y,
          prevX: rival.x - 25,
          prevY: rival.y,
          vx: 180,
          vy: 0,
          radius: 5,
          age: 0.35,
          maxLifetime: 2.0,
          bounces: 1,
          maxBounces: 8,
          graceTimer: 0,
          active: true,
          variant: 'emp_orb',
        },
      ],
      crates: [],
      spikeZones: [],
      mines: [],
      arena,
    },
    aiMem,
    new SeededRng(9),
  );
  assert.equal(
    empDetDecision.firePressed,
    true,
    'AI must remotely detonate its flying EMP orb as soon as it enters blast range of a shielded enemy!',
  );

  const warpRecallDecision = computeBotDecision(
    {
      difficulty: 'super_hard',
      dt: 1 / 60,
      self: architect,
      selfSkill: 'warp',
      selfSkillAmmo: 1,
      selfAmmo: 10,
      selfShielded: false,
      selfWarpBeaconPlaced: true,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: true,
      tanks: [architect, { ...rival, x: architect.x + 22 * arena.scaleRatio, y: architect.y }],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [],
      crates: [],
      spikeZones: [],
      mines: [],
      arena,
    },
    aiMem,
    new SeededRng(11),
  );
  assert.equal(
    warpRecallDecision.firePressed,
    true,
    'AI with an active Warp Beacon must trigger instant recall + rift blast when an unshielded enemy closes to point-blank!',
  );
});










