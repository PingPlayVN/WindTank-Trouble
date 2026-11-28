import assert from 'node:assert/strict';
import test from 'node:test';
import { BASE_GAMEPLAY, POWERUP_CONFIG } from '../src/game/config/constants';
import { buildArenaLayout } from '../src/game/maps/MazeBuilder';
import { SettingsManager } from '../src/game/managers/SettingsManager';
import { canPickupCrate } from '../src/game/skills/crateSim';
import {
  deployEnergyBarrierAhead,
  findBarriersHitByPolyline,
  removeEnergyBarrierFromArena,
} from '../src/game/skills/items/barrierSkill';
import { findDirectCryoBurstVictims, findTanksInCryoZones } from '../src/game/skills/items/cryoSkill';
import { computeEmpBlastImpact, repelProjectilesWithEmpPulse } from '../src/game/skills/items/empSkill';
import { stepFlameThermodynamics } from '../src/game/skills/items/flameSkill';
import {
  computeArenaPerimeterWalls,
  ejectTankFromInteriorWalls,
} from '../src/game/skills/items/phantomSkill';
import { computeReaperBlades } from '../src/game/skills/items/reaperSkill';
import { computeWarpBlastVictims } from '../src/game/skills/items/warpSkill';
import {
  ALL_SKILL_IDS,
  getSkillDescriptor,
  SKILL_DESCRIPTORS,
  SKILL_FIRE_HANDLERS,
} from '../src/game/skills/registry';
import type { ProximityMineState } from '../src/game/skills/types';
import { computeBotDecision } from '../src/game/systems/ai/aiBehaviorTree';
import { createAISlotMemory } from '../src/game/systems/ai/aiTypes';
import { resolveAllTankCollisions, stepProjectilesSimulation } from '../src/game/systems/CollisionSystem';
import { createEmptySolidGrid, SeededRng } from '../src/game/systems/MazeSystem';
import { computeVectorStickInput } from '../src/game/systems/TouchSim';
import type { ProjectileKinematics, TankKinematics } from '../src/game/types/gameTypes';

test('ES6 Skill Module Architecture: all 15 individual skill modules export valid descriptors and fire handlers', () => {
  assert.equal(SKILL_DESCRIPTORS.length, 15, 'Must register all 15 skill descriptors');
  assert.equal(ALL_SKILL_IDS.length, 15);
  const weightSum = SKILL_DESCRIPTORS.reduce((acc, s) => acc + s.weight, 0);
  assert.equal(weightSum, 100, 'Drop weights across 15 skill modules must sum to 100');

  for (const id of ALL_SKILL_IDS) {
    const desc = getSkillDescriptor(id);
    assert.equal(desc.id, id);
    assert.ok(desc.ammo >= 1);
    assert.equal(typeof SKILL_FIRE_HANDLERS[id], 'function', `Skill ${id} must export a dedicated fire handler`);
  }
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
    angle: 0,
    radius: 14.5,
    alive: true,
  };
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

  // 2. Sensitivity affects Vector Stick drive threshold
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

  // 4. Realistic fluid-jet Flame thermodynamics
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

test('Crescent Reaper 4-Stage Simulation: Laser-Shaft stage (crescentScale=0) vs Sideways Crescent Unfurl (crescentScale=1)', () => {
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

test('5 New Skills (#2 EMP, #3 Phantom, #4 Cryo, #5 Barrier, #6 Warp) physics & AI mastery work cleanly', () => {
  const grid = createEmptySolidGrid('new5', 'New 5 Skills Lab', 6, 4, 42);
  for (let r = 0; r < 4; r++) {
    for (let c = 1; c < 6; c++) grid.vWalls[r][c] = false;
  }
  for (let r = 1; r < 4; r++) {
    for (let c = 0; c < 6; c++) grid.hWalls[r][c] = false;
  }
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
    angle: 0,
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

  // 3. Reworked EMP Storm Nova (`emp`): 2-pulse bullet hijack + line-of-sight Tesla zap + wall-piercing scramble!
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
    architect.x,
    architect.y,
    arena.cellSize * POWERUP_CONFIG.empBlastCellsRadius,
    0,
    [architect, { ...rival, ...cc(2, 1) }],
    [enemyMine],
    [barrier!],
    arena.cellSize * POWERUP_CONFIG.empZapCellsRadius,
    arena.walls,
  );
  assert.deepEqual(empImpact.hitEnemyIndices, [1], 'EMP shockwave must hit rival tank through walls without hitting owner');
  assert.deepEqual(
    empImpact.zappedEnemyIndices,
    [],
    'Solid barrier between (1,1) and (2,1) must block direct lethal Tesla Zap while still allowing EMP scramble!',
  );
  assert.deepEqual(empImpact.clearedMineIds, [99], 'EMP shockwave must neutralize mines in radius');
  assert.deepEqual(empImpact.clearedBarrierIds, [501], 'EMP shockwave must shatter Energy Barriers in radius');

  removeEnergyBarrierFromArena(barrier!, arena);
  assert.equal(arena.grid.vWalls[1][2], false);

  const openEmpImpact = computeEmpBlastImpact(
    architect.x,
    architect.y,
    arena.cellSize * POWERUP_CONFIG.empBlastCellsRadius,
    0,
    [architect, { ...rival, ...cc(2, 1) }],
    [],
    [],
    arena.cellSize * POWERUP_CONFIG.empZapCellsRadius,
    arena.walls,
  );
  assert.deepEqual(
    openEmpImpact.zappedEnemyIndices,
    [1],
    'Unoccluded close rival within 1.5 cells must be struck by High-Voltage Tesla Zap!',
  );

  const incomingEnemyShell: ProjectileKinematics = {
    id: 77,
    ownerIndex: 1,
    x: architect.x + 28 * arena.scaleRatio,
    y: architect.y,
    prevX: architect.x + 34 * arena.scaleRatio,
    prevY: architect.y,
    vx: -280,
    vy: 0,
    radius: 4.5,
    age: 0.2,
    maxLifetime: 10,
    bounces: 0,
    maxBounces: 12,
    graceTimer: 0,
    active: true,
    variant: 'standard',
  };
  const hijacked = repelProjectilesWithEmpPulse(
    architect.x,
    architect.y,
    arena.cellSize * POWERUP_CONFIG.empBlastCellsRadius,
    0,
    [incomingEnemyShell],
    [architect, rival],
    arena.walls,
    arena.scaleRatio,
  );
  assert.equal(hijacked.length, 1, 'EMP Nova must hijack incoming enemy projectiles inside radius');
  assert.equal(incomingEnemyShell.ownerIndex, 0, 'Hijacked projectile must switch ownership to EMP caster');
  assert.ok(incomingEnemyShell.vx > 280, 'Hijacked projectile must reverse outward at boosted speed!');

  // 4. Cryo Zone & Orb (`cryo`): slows BOTH owner & rivals by 2x (`0.5x`), freezes direct burst victims, and bounced orb hits owner!
  assert.equal(POWERUP_CONFIG.cryoDriftSpeedMultiplier, 0.5, 'Cryo Zone must slow movement speed by 2x (0.5x)');
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
  assert.equal(sliding.has(0), true, 'Owner entering Cryo Zone must also suffer 2x slow & freeze buildup!');
  assert.equal(sliding.has(1), true, 'Rival tank inside Cryo Zone must suffer 2x slow & freeze buildup!');

  const directBurst = findDirectCryoBurstVictims(
    cryoZone.x,
    cryoZone.y,
    cryoZone.radius,
    0,
    true,
    [
      { ...architect, ...cc(2, 2) },
      { ...rival, ...cc(2, 2) },
    ],
  );
  assert.deepEqual(directBurst, [0, 1], 'Tanks standing directly in Cryo burst epicenter must freeze immediately!');

  const bouncedCryoOrb: ProjectileKinematics = {
    id: 88,
    ownerIndex: 0,
    x: architect.x - 10,
    y: architect.y,
    prevX: architect.x - 16,
    prevY: architect.y,
    vx: 240,
    vy: 0,
    radius: 5.2,
    age: 0.4,
    maxLifetime: 4.5,
    bounces: 1,
    maxBounces: 4,
    graceTimer: 0,
    active: true,
    variant: 'cryo_orb',
  };
  const cryoSelfHit = stepProjectilesSimulation([bouncedCryoOrb], [architect, rival], arena.walls, 1 / 60);
  assert.equal(cryoSelfHit.hits.length, 1);
  assert.equal(cryoSelfHit.hits[0].victimIndex, 0, 'Reflected Cryo Orb must be able to hit and freeze its own shooter!');

  // 5. Spatial Warp (`warp`): compact Rift Explosions at BOTH Departure `(fromX, fromY)` AND Arrival `(toX, toY)`!
  const beaconPos = cc(3, 2);
  const departureVictims = computeWarpBlastVictims(
    architect.x,
    architect.y,
    0,
    POWERUP_CONFIG.warpBlastRadius * arena.scaleRatio,
    [architect, { ...rival, x: architect.x + 22 * arena.scaleRatio, y: architect.y }],
  );
  const arrivalVictims = computeWarpBlastVictims(
    beaconPos.x,
    beaconPos.y,
    0,
    POWERUP_CONFIG.warpBlastRadius * arena.scaleRatio,
    [architect, { ...rival, x: beaconPos.x + 22 * arena.scaleRatio, y: beaconPos.y }],
  );
  assert.deepEqual(departureVictims, [1], 'Departure Rift Explosion must hit enemies pursuing at current position');
  assert.deepEqual(arrivalVictims, [1], 'Arrival Rift Explosion at Warp Anchor must hit enemies camping near the anchor');

  // 6. AI Mastery: EMP Nova bullet parry / close zap & Warp Anchor ambush recall!
  const aiMem = createAISlotMemory(0);
  const empNovaDecision = computeBotDecision(
    {
      difficulty: 'super_hard',
      dt: 1 / 60,
      self: architect,
      selfSkill: 'emp',
      selfSkillAmmo: 2,
      selfAmmo: 10,
      selfShielded: false,
      selfReaperSweeping: false,
      selfChargingLaser: false,
      canFire: true,
      tanks: [architect, { ...rival, ...cc(2, 1) }],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [],
      crates: [],
      spikeZones: [],
      mines: [],
      arena,
    },
    aiMem,
    new SeededRng(9),
  );
  assert.equal(
    empNovaDecision.firePressed,
    true,
    'AI holding EMP Storm Nova must immediately zap an unshielded close rival within 1.5 cells!',
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
      tanks: [architect, { ...rival, x: beaconPos.x + 20 * arena.scaleRatio, y: beaconPos.y }],
      shieldedTankIndices: new Set(),
      reaperTankIndices: new Set(),
      projectiles: [],
      crates: [],
      spikeZones: [],
      mines: [],
      warpBeacons: [
        {
          id: 701,
          ownerIndex: 0,
          x: beaconPos.x,
          y: beaconPos.y,
          age: 1.2,
          maxDuration: 12,
        },
      ],
      arena,
    },
    aiMem,
    new SeededRng(11),
  );
  assert.equal(
    warpRecallDecision.firePressed,
    true,
    'AI with a placed Warp Anchor must immediately teleport back when an unshielded enemy steps onto its anchor!',
  );
});
