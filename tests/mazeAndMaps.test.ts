import assert from 'node:assert/strict';
import test from 'node:test';
import { ARENA_VIEWPORT, MOBILE_ARENA_VIEWPORT } from '../src/game/config/viewportConfig';
import { BASE_GAMEPLAY } from '../src/game/config/gameplayConfig';
import { MAP_MODES, PRESET_MAZE_MAP, resolveMazeForRound } from '../src/game/maps/mapDefinitions';
import { buildArenaLayout } from '../src/game/maps/MazeBuilder';
import { resolveTankWallCollisions } from '../src/game/systems/CollisionSystem';
import {
  computeBfsDistances,
  generateProceduralMaze,
  isMazeValidAndConnected,
  selectBalancedSpawns,
} from '../src/game/systems/MazeSystem';
import type { TankKinematics } from '../src/game/types/gameTypes';

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
