import assert from 'node:assert/strict';
import test from 'node:test';
import { BASE_GAMEPLAY, POWERUP_CONFIG } from '../src/game/config/gameplayConfig';
import { isTouchDeviceDetected } from '../src/game/config/viewportConfig';
import { buildArenaLayout } from '../src/game/maps/MazeBuilder';
import {
  extractRoomCodeFromSearch,
  formatRoomCode,
  normalizeRoomCode,
  peerIdFromRoomCode,
} from '../src/game/network/roomCode';
import { traceBallisticShot } from '../src/game/systems/ai/aiBallistics';
import { computeBotDecision } from '../src/game/systems/ai/aiBehaviorTree';
import { createAISlotMemory } from '../src/game/systems/ai/aiTypes';
import { createEmptySolidGrid, SeededRng } from '../src/game/systems/MazeSystem';
import { computeVectorStickInput } from '../src/game/systems/TouchSim';
import type { ProjectileKinematics, TankKinematics } from '../src/game/types/gameTypes';

test('AISim ricochet solver: rejects self-ricochet & shielded targets, while finding 1-bounce bank shots above Easy', () => {
  const grid = createEmptySolidGrid('ai_bank', 'AI Bank Shot', 3, 2, 1);
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
    angle: 0,
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
  walledGrid.hWalls[1][2] = false;
  const walledArena = buildArenaLayout(walledGrid, 2, 1);
  const laserBot: TankKinematics = {
    index: 1,
    x: walledArena.originX + walledArena.cellSize * 0.5,
    y: walledArena.originY + walledArena.cellSize * 0.5,
    vx: 0,
    vy: 0,
    angle: 0.08,
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

test('AI Behavior Tree upgrades: maze-path target selection, Shield wall discipline, TNT trap detonation, and Camper anti-freeze', () => {
  const g = createEmptySolidGrid('ai_bt_maze', 'AI BT Maze', 6, 2, 1);
  for (let r = 0; r < 2; r++) {
    for (let c = 1; c < 6; c++) {
      g.vWalls[r][c] = false;
    }
  }
  g.hWalls[1][5] = false;
  const arena = buildArenaLayout(g, 3, 1);

  const cellCenter = (col: number, row: number) => ({
    x: arena.originX + (col + 0.5) * arena.cellSize,
    y: arena.originY + (row + 0.5) * arena.cellSize,
  });

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
    y: farEnemyPos.y + arena.cellSize * 0.3,
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

test('AI Navigation & 10-Skill Mastery: zero tail-first reverse navigation and dedicated tactics for Shield, Scatter, Flame, Mine, Drill, Homing & Reaper', () => {
  const grid = createEmptySolidGrid('ai_mastery', 'AI Mastery', 6, 2, 1);
  for (let c = 0; c < 5; c++) {
    grid.vWalls[0][c + 1] = false;
  }
  grid.hWalls[1][0] = false;
  grid.hWalls[1][2] = false;
  grid.vWalls[1][3] = false;

  const arena = buildArenaLayout(grid, 2, 42);
  const cc = (col: number, row: number) => ({
    x: arena.originX + (col + 0.5) * arena.cellSize,
    y: arena.originY + (row + 0.5) * arena.cellSize,
  });

  const eastFacingBot: TankKinematics = {
    index: 0,
    ...cc(4, 0),
    vx: 0,
    vy: 0,
    angle: 0,
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
    ...cc(5, 1),
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

  // C. MINE
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

  // D. DRILL
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

  // E. FLAME
  const flameCornerBot: TankKinematics = { ...eastFacingBot, ...cc(2, 0), angle: Math.PI / 2 };
  const enemyAroundCorner: TankKinematics = { ...westEnemy, ...cc(3, 1) };
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

  // F. SCATTER
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
  const outerFanAng = POWERUP_CONFIG.scatterSpreadStepRad * 2;
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

  // G. REAPER
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

  // H. HOMING MISSILE TACTICS
  assert.equal(POWERUP_CONFIG.homingBallisticSec, 2.5, 'Homing lock delay should be 2.5s');
  assert.ok(
    POWERUP_CONFIG.homingBallisticSpeedMultiplier < 0.85 &&
      POWERUP_CONFIG.homingSeekSpeedMultiplier < 1.0,
    'Homing missile should fly slower and more tactically in both ballistic and seeking phases',
  );

  const hmBot: TankKinematics = {
    index: 0,
    ...cc(0, 0),
    vx: 0,
    vy: 0,
    angle: Math.PI / 2,
    radius: 14.5 * arena.scaleRatio,
    alive: true,
  };
  const hmEnemy: TankKinematics = {
    index: 1,
    ...cc(3, 1),
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

  const postLaunchBot: TankKinematics = {
    index: 0,
    ...cc(2, 0),
    vx: 0,
    vy: 0,
    angle: Math.PI,
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
    age: 0.2,
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
      selfSkill: null,
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

test('Mobile Vector Stick & 1vs1 Room Code helpers: precision aim zone, drive, emergency reverse, and WT-XXXX codes', () => {
  const idle = computeVectorStickInput(4, 3, 60, 0, false);
  assert.equal(idle.forward, false);
  assert.equal(idle.backward, false);
  assert.equal(idle.left, false);
  assert.equal(idle.right, false);

  const aimOnly = computeVectorStickInput(0, 18, 60, 0, false);
  assert.equal(aimOnly.right, true, 'Precision zone must rotate barrel toward thumb');
  assert.equal(aimOnly.forward, false, 'Precision zone must NOT drive forward');
  assert.equal(aimOnly.backward, false);

  const drive = computeVectorStickInput(45, 20, 60, 0, false);
  assert.equal(drive.forward, true);
  assert.equal(drive.right, true);
  assert.equal(drive.backward, false);

  const rev = computeVectorStickInput(-50, 4, 60, 0, false);
  assert.equal(rev.backward, true, 'Pulling stick opposite tank heading must engage instant reverse');
  assert.equal(rev.forward, false);

  assert.equal(normalizeRoomCode('wt-4829'), '4829');
  assert.equal(normalizeRoomCode('  a9k2 '), 'A9K2');
  assert.equal(formatRoomCode('4829'), 'WT-4829');
  assert.equal(peerIdFromRoomCode('WT-4829'), 'windtank-p2p-v1-4829');
  assert.equal(extractRoomCodeFromSearch('?room=WT-7391'), '7391');
  assert.equal(extractRoomCodeFromSearch('?foo=1&room=ab12'), 'AB12');
});

test('Bug regression: Windows touchscreen laptop / 2-in-1 MUST stay in PC mode, while Android/iPhone/iPad detect as Mobile', () => {
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

  assert.equal(
    isTouchDeviceDetected({
      search: '?device=mobile',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
      userAgentDataMobile: false,
    }),
    true,
  );

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
