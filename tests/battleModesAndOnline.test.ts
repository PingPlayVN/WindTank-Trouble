import assert from 'node:assert/strict';
import test from 'node:test';
import {
  ARENA_VIEWPORT,
  computeMobileLogicalWidth,
  CROSS_PLATFORM_ARENA_VIEWPORT,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  MOBILE_ARENA_VIEWPORT,
  resolveLocalMobileArenaViewport,
  resolveOnlineArenaViewport,
} from '../src/game/config/viewportConfig';
import { MAP_MODES, resolveMazeForRound } from '../src/game/maps/mapDefinitions';
import { buildArenaLayout } from '../src/game/maps/MazeBuilder';
import { SettingsManager } from '../src/game/managers/SettingsManager';
import {
  applySafeTankKnockback,
  castFlashlightPolygon,
  castOmnidirectionalLightPolygon,
  coalesceProjectileLightSources,
  computeBarrelExplosionImpact,
  computeWeaponDamage,
  findProjectileBarrelHits,
  resolveEffectiveBattleModeRules,
  resolveTankBarrelCollisions,
  spawnTntBarrels,
} from '../src/game/systems/BattleModeSim';
import type { ProjectileKinematics, TankKinematics, WallRect } from '../src/game/types/gameTypes';

test('Battle Modes (Armor HP Durability, Explosive TNT Barrels, Night Ops Flashlight Raycasting & AI Tactics)', () => {
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

  assert.equal(computeWeaponDamage('standard'), 25);
  assert.equal(computeWeaponDamage('gatling'), 9);
  assert.equal(computeWeaponDamage('laser'), 80);
  assert.equal(computeWeaponDamage('mine'), 75);
  assert.equal(computeWeaponDamage('homing_missile'), 56);

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

  const cornerTank: TankKinematics = {
    ...tanks[0],
    x: arena.originX + 18,
    y: arena.originY + 18,
  };
  applySafeTankKnockback(cornerTank, -120, -120, arena.walls);
  assert.ok(cornerTank.x > arena.originX + cornerTank.radius * 0.8);
  assert.ok(cornerTank.y > arena.originY + cornerTank.radius * 0.8);

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
  const centerTip = conePoly[11];
  assert.ok(
    Math.abs(centerTip.x - 200) < 0.5,
    `Flashlight ray should stop at wall x=200, got ${centerTip.x.toFixed(2)}`,
  );
});

test('Night Ops Signal-Flare 360° Raycasting & Projectile Light Coalescing', () => {
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

  const flarePoly = castOmnidirectionalLightPolygon(100, 120, 180, [wallRight], undefined, 36);
  assert.equal(flarePoly.length, 36);
  assert.equal(flarePoly[0].hitWall, true);
  assert.ok(Math.abs(flarePoly[0].x - 160) < 0.5);
  assert.equal(flarePoly[18].hitWall, false);
  assert.ok(Math.abs(flarePoly[18].x - -80) < 0.5);

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

test('Online PC vs Mobile cross-platform sync: authoritative viewport clears BOTH Mobile joysticks/pills AND PC scoreboard with identical walls', () => {
  assert.deepEqual(resolveOnlineArenaViewport(false, false), ARENA_VIEWPORT);
  assert.deepEqual(resolveOnlineArenaViewport(true, true), MOBILE_ARENA_VIEWPORT);
  assert.deepEqual(resolveOnlineArenaViewport(true, false), CROSS_PLATFORM_ARENA_VIEWPORT);
  assert.deepEqual(resolveOnlineArenaViewport(false, true), CROSS_PLATFORM_ARENA_VIEWPORT);

  for (const mode of MAP_MODES) {
    const hostGrid = resolveMazeForRound(mode.id, 2, 2, 98765);
    const crossVp = resolveOnlineArenaViewport(true, false);

    const mobileHostLayout = buildArenaLayout(hostGrid, 2, 98765, crossVp);
    const pcGuestLayout = buildArenaLayout(
      JSON.parse(JSON.stringify(hostGrid)),
      2,
      98765,
      { ...crossVp },
    );

    assert.equal(mobileHostLayout.originX, pcGuestLayout.originX);
    assert.equal(mobileHostLayout.originY, pcGuestLayout.originY);
    assert.equal(mobileHostLayout.cellSize, pcGuestLayout.cellSize);
    assert.deepEqual(mobileHostLayout.walls, pcGuestLayout.walls);
    assert.deepEqual(mobileHostLayout.spawns, pcGuestLayout.spawns);

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

    const pcScoreboardTopY = DESIGN_HEIGHT - ARENA_VIEWPORT.bottomBarHeight;
    assert.ok(
      pcGuestLayout.originY + pcGuestLayout.height <= pcScoreboardTopY,
      `${mode.id} bottom (${pcGuestLayout.originY + pcGuestLayout.height}) overlapped PC scoreboard (${pcScoreboardTopY})`,
    );
  }
});

test('Widescreen Mobile viewport & arena scaling: reclaims 20:9 phone sidebars, enlarges map, and preserves thumb control gutters', () => {
  assert.equal(computeMobileLogicalWidth(1920, 1080, false), DESIGN_WIDTH);

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
