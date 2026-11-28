import assert from 'node:assert/strict';
import test from 'node:test';
import {
  BASE_GAMEPLAY,
  normalizeCrateSpawnInterval,
  parseCustomIntervalInput,
  parseCustomScoreInput,
  stepCrateSpawnInterval,
  stepWinningScore,
} from '../src/game/config/gameplayConfig';
import { buildArenaLayout } from '../src/game/maps/MazeBuilder';
import { PlayerManager } from '../src/game/managers/PlayerManager';
import { ScoreManager } from '../src/game/managers/ScoreManager';
import { SettingsManager } from '../src/game/managers/SettingsManager';
import { rollWeightedSkill } from '../src/game/skills/crateSim';
import { deflectProjectilesAgainstShields } from '../src/game/skills/items/shieldSkill';
import {
  computeSafeMuzzleSpawn,
  resolveAllTankCollisions,
  stepProjectilesSimulation,
} from '../src/game/systems/CollisionSystem';
import { generateProceduralMaze, SeededRng } from '../src/game/systems/MazeSystem';
import type { ProjectileKinematics, TankKinematics, WallRect } from '../src/game/types/gameTypes';

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
