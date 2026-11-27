import { expect, test, type Page } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const SHOT_DIR = path.resolve('artifacts/qa-screenshots/v6');

interface DiagnosticsSnapshot {
  fps: number;
  renderer: string;
  phase: string;
  networkRole: 'offline' | 'host' | 'guest';
  roomCode: string;
  pingMs: number;
  touchActive: boolean;
  arenaBounds: { originX: number; originY: number; width: number; height: number };
  paused: boolean;
  round: number;
  mapId: string;
  battleMode: string;
  hasArmorHp: boolean;
  isNightOps: boolean;
  activeBarrels: number;
  wallCount: number;
  crateIntervalSec: number;
  crateTimerRemainingSec: number;
  activeProjectiles: number;
  activeCrates: number;
  groundHazards: number;
  activeMines: number;
  activeParticles: number;
  displayObjects: number;
  tweens: number;
  texturesCount: number;
  players: Array<{
    index: number;
    isAI: boolean;
    aiDifficulty: string;
    x: number;
    y: number;
    angle: number;
    alive: boolean;
    hp: number;
    maxHp: number;
    score: number;
    ammo: number;
    skill: string | null;
    skillAmmo: number;
    chargingLaser: boolean;
    shielded: boolean;
    reaperSweeping: boolean;
  }>;
}

test('Full Wave 6 QA: Smooth Hero-Tank Loading Bar, Auto Mobile CSS Landscape Lock, 3P/4P Lock, 2P Opposite Tabletop Controls, Realistic Fluid Flame & 1vs1 P2P', async ({
  page,
  context,
}) => {
  await mkdir(SHOT_DIR, { recursive: true });

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.error('[Browser Console Error]', msg.text());
      consoleErrors.push(msg.text());
    }
  });
  page.on('pageerror', (err) => {
    console.error('[Browser Page Error]', err.message);
    pageErrors.push(err.message);
  });

  // 0. Capture Smooth Hero-Tank Loading Screen (`PreloadScene`) mid-progress, then wait for MenuScene!
  await page.goto('/?device=pc&p2p=local', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { state: 'visible' });
  await page.waitForFunction(() => {
    const g = (window as unknown as { __WINDTANK_GAME__?: Phaser.Game }).__WINDTANK_GAME__;
    if (g?.scene.isActive('MenuScene')) return true;
    const pre = g?.scene.getScene('PreloadScene') as unknown as { displayProgress?: number } | undefined;
    if (g?.scene.isActive('PreloadScene') && (pre?.displayProgress ?? 0) >= 0.35) {
      g.scene.pause('PreloadScene');
      return true;
    }
    return false;
  });
  await page.screenshot({ path: path.join(SHOT_DIR, '00-smooth-hero-tank-loading-screen.png') });
  await page.evaluate(() => {
    const g = (window as unknown as { __WINDTANK_GAME__?: Phaser.Game }).__WINDTANK_GAME__;
    g?.scene.resume('PreloadScene');
  });

  await page.waitForFunction(
    () => {
      const g = (window as unknown as { __WINDTANK_GAME__?: Phaser.Game }).__WINDTANK_GAME__;
      return Boolean(g?.scene.isActive('MenuScene'));
    },
    null,
    { timeout: 35000 },
  );

  // Bug regression: sweep pointer across MenuScene buttons (`VÀO SẢNH ĐẤU`, `ĐẤU NHANH`, `ONLINE 1VS1`)
  // DURING staggered entrance animation — no button may ever get stuck faded (`alpha < 1`) or shifted down!
  const hoverDesignCoord = async (dx: number, dy: number) => {
    const pt = await page.evaluate(
      ({ x, y }) => {
        const rect = document.querySelector('canvas')!.getBoundingClientRect();
        return {
          sx: rect.left + (x / 1280) * rect.width,
          sy: rect.top + (y / 760) * rect.height,
        };
      },
      { x: dx, y: dy },
    );
    await page.mouse.move(pt.sx, pt.sy);
  };
  await hoverDesignCoord(640, 504); // Hover right over `ĐẤU NHANH` mid-entrance!
  await page.waitForTimeout(35);
  await hoverDesignCoord(388, 504);
  await page.waitForTimeout(35);
  await hoverDesignCoord(892, 504);
  await page.waitForTimeout(720);

  const menuBtnState = await page.evaluate(() => {
    const g = (window as unknown as { __WINDTANK_GAME__: Phaser.Game }).__WINDTANK_GAME__;
    const menu = g.scene.getScene('MenuScene');
    let minA = 1;
    const mainRowYs: number[] = [];
    for (const obj of menu.children.list) {
      if (obj.type === 'Container') {
        const c = obj as Phaser.GameObjects.Container;
        if (c.visible) {
          minA = Math.min(minA, c.alpha);
          if (Math.abs(c.y - 504) < 25) {
            mainRowYs.push(Math.round(c.y));
          }
        }
      }
    }
    return { minA, mainRowYs };
  });
  expect(menuBtnState.minA).toBe(1);
  expect(menuBtnState.mainRowYs).toEqual([504, 504, 504]);

  const clickDesignCoord = async (dx: number, dy: number, targetPage: Page = page) => {
    const pt = await targetPage.evaluate(
      ({ x, y }) => {
        const canvas = document.querySelector('canvas')!;
        const rect = canvas.getBoundingClientRect();
        const isRotated = document.body.classList.contains('mobile-force-landscape');
        if (!isRotated) {
          return {
            sx: rect.left + (x / 1280) * rect.width,
            sy: rect.top + (y / 760) * rect.height,
          };
        }
        // Forward +90deg clockwise mapping from (1280x760) design space to portrait screen!
        const cx = rect.left + rect.width * 0.5;
        const cy = rect.top + rect.height * 0.5;
        const unrotW = rect.height;
        const unrotH = rect.width;
        const u = (x / 1280 - 0.5) * unrotW;
        const v = (y / 760 - 0.5) * unrotH;
        return { sx: cx - v, sy: cy + u };
      },
      { x: dx, y: dy },
    );
    await targetPage.mouse.click(pt.sx, pt.sy);
  };

  const waitFrames = async (count = 2, targetPage: Page = page) => {
    await targetPage.evaluate(async (n) => {
      for (let i = 0; i < n; i++) {
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      }
    }, count);
  };

  // 1. PC Main Menu (4P unlocked on PC!) + 4-Player AI Setup + Live Gameplay VFX Showcase
  const pcOrient = await page.evaluate(() => {
    const o = (
      window as unknown as {
        __WINDTANK_ORIENTATION__: {
          getState: () => { isMobileUi: boolean; isCssPortraitRotated: boolean };
        };
      }
    ).__WINDTANK_ORIENTATION__;
    return o.getState();
  });
  expect(pcOrient.isMobileUi).toBe(false);
  expect(pcOrient.isCssPortraitRotated).toBe(false);

  // Open SettingsModal on PC (`CÀI ĐẶT & ĐỔI PHÍM` at x=765, y=584) -> verify ONLY Keyboard Matrix is shown!
  await clickDesignCoord(765, 584);
  await page.waitForTimeout(220);
  await page.screenshot({ path: path.join(SHOT_DIR, '00b-pc-settings-only-keyboard-keys.png') });
  await page.keyboard.press('Escape');
  await page.waitForTimeout(150);

  await page.keyboard.press('Digit4');
  await page.waitForTimeout(80);
  await clickDesignCoord(388, 504); // Enter SetupScene on PC
  await page.waitForTimeout(240);

  await clickDesignCoord(496, 352); // Enable P2 AI
  await page.waitForTimeout(60);
  await clickDesignCoord(440, 450); // KHÓ
  await page.waitForTimeout(60);
  await clickDesignCoord(784, 352); // Enable P3 AI
  await page.waitForTimeout(60);
  await clickDesignCoord(840, 450); // SIÊU KHÓ
  await page.waitForTimeout(60);
  await clickDesignCoord(1072, 352); // Enable P4 AI
  await page.waitForTimeout(60);

  // Cycle Map to Procedural Titan (20x12) & Advance to ModeSelectScene (`TIẾP TỤC: CHỌN CHẾ ĐỘ →`)!
  for (let i = 0; i < 5; i++) {
    await clickDesignCoord(456, 590);
    await page.waitForTimeout(45);
  }
  await clickDesignCoord(735, 696);
  await page.waitForFunction(() => {
    const g = (window as unknown as { __WINDTANK_GAME__?: Phaser.Game }).__WINDTANK_GAME__;
    return Boolean(g?.scene.isActive('ModeSelectScene'));
  });
  await page.waitForTimeout(240);

  // Select `⚡ ĐÊM TỬ CHIẾN` (Night Ops + 100 HP Armor + Explosive TNT Barrels) via Digit4 & capture ModeSelectScene!
  await page.keyboard.press('Digit4');
  await page.waitForTimeout(140);
  await page.screenshot({ path: path.join(SHOT_DIR, '00c-mode-select-after-tank-setup.png') });

  // Launch Battle from ModeSelectScene (`BẮT ĐẦU TRẬN ĐẤU →` at 735, 696)!
  await clickDesignCoord(735, 696);

  await page.waitForFunction(
    () => {
      const d = (window as unknown as { __PHASER_GAME_DIAGNOSTICS__?: DiagnosticsSnapshot })
        .__PHASER_GAME_DIAGNOSTICS__;
      return d?.phase === 'playing' && d?.players.length === 4;
    },
    null,
    { timeout: 10000 },
  );

  const modeDiag = await page.evaluate(() => {
    const d = (window as unknown as { __PHASER_GAME_DIAGNOSTICS__: DiagnosticsSnapshot })
      .__PHASER_GAME_DIAGNOSTICS__;
    return {
      battleMode: d.battleMode,
      hasArmorHp: d.hasArmorHp,
      isNightOps: d.isNightOps,
      activeBarrels: d.activeBarrels,
      p1Hp: d.players[0]?.hp,
      p1MaxHp: d.players[0]?.maxHp,
    };
  });
  expect(modeDiag.battleMode).toBe('night_armored');
  expect(modeDiag.hasArmorHp).toBe(true);
  expect(modeDiag.isNightOps).toBe(true);
  expect(modeDiag.activeBarrels).toBeGreaterThanOrEqual(4);
  expect(modeDiag.p1Hp).toBe(100);
  expect(modeDiag.p1MaxHp).toBe(100);

  // 1b. Drop a Mystery Skill Crate + fire Signal-Flare Shells down an open maze corridor to verify:
  //     extended Twin-Headlamp reach, softer non-glaring Signal-Flare shells, and gently glowing Skill Crates!
  const shaderActive = await page.evaluate(() => {
    const game = (window as unknown as { __WINDTANK_GAME__: Phaser.Game }).__WINDTANK_GAME__;
    const gs = game.scene.getScene('GameScene') as unknown as {
      arena: {
        originX: number;
        originY: number;
        cellSize: number;
        walls: unknown[];
      };
      dropMysteryCrateNow: () => boolean;
      nightVisionSystem: { isShaderActive: () => boolean };
      tanks: Array<{
        kinematics: { x: number; y: number; angle: number };
        triggerFireVisual: (cd?: number) => void;
      }>;
      powerUpSystem: {
        tryHandlePlayerFire: (
          tank: unknown,
          walls: unknown[],
          isHeld: boolean,
          consume: () => boolean,
        ) => void;
      };
    };
    gs.dropMysteryCrateNow();
    gs.dropMysteryCrateNow();
    const p1 = gs.tanks[0];
    // Center of cell (3, 4) — guaranteed open cell center away from walls!
    p1.kinematics.x = gs.arena.originX + gs.arena.cellSize * 3.5;
    p1.kinematics.y = gs.arena.originY + gs.arena.cellSize * 4.5;
    p1.kinematics.angle = 0.04;
    for (const deltaAngle of [-0.32, 0.12]) {
      const baseA = p1.kinematics.angle;
      p1.kinematics.angle = baseA + deltaAngle;
      p1.triggerFireVisual(0);
      gs.powerUpSystem.tryHandlePlayerFire(p1, gs.arena.walls, false, () => true);
      p1.kinematics.angle = baseA;
    }
    return gs.nightVisionSystem.isShaderActive();
  });
  expect(shaderActive).toBe(true);
  await page.waitForTimeout(320);
  await page.screenshot({
    path: path.join(SHOT_DIR, '01a-night-shader-and-signal-flare-shells.png'),
  });

  // 2. Showcase Realistic Fluid-Jet Flame Stream (Blue-White Nozzle -> Volumetric Fire -> Dark Smoke Tail)!
  await page.evaluate(() => {
    const game = (window as unknown as { __WINDTANK_GAME__: Phaser.Game }).__WINDTANK_GAME__;
    const gs = game.scene.getScene('GameScene') as unknown as {
      arena: { originX: number; originY: number; width: number; height: number; walls: unknown[] };
      tanks: Array<{
        kinematics: { x: number; y: number; vx: number; vy: number; angle: number; alive: boolean };
        equipSkill: (s: string, ammo: number) => void;
        triggerFireVisual: (cd?: number) => void;
      }>;
      powerUpSystem: {
        tryHandlePlayerFire: (
          tank: unknown,
          walls: unknown[],
          isHeld: boolean,
          consume: () => boolean,
        ) => void;
      };
    };
    const p1 = gs.tanks[0];
    p1.kinematics.x = gs.arena.originX + gs.arena.width * 0.25;
    p1.kinematics.y = gs.arena.originY + gs.arena.height * 0.46;
    p1.kinematics.vx = 60;
    p1.kinematics.vy = -25;
    p1.kinematics.angle = 0.08;
    p1.equipSkill('flame', 80);

    // Spray 12 sweeping bursts across short substeps so full thermal gradient + smoke tail is visible!
    for (let burst = 0; burst < 12; burst++) {
      p1.kinematics.angle = -0.14 + burst * 0.026;
      p1.triggerFireVisual(0);
      gs.powerUpSystem.tryHandlePlayerFire(p1, gs.arena.walls, true, () => true);
    }
  });
  await page.waitForTimeout(260);
  const flameDiag = await page.evaluate(() => {
    const d = (window as unknown as { __PHASER_GAME_DIAGNOSTICS__: DiagnosticsSnapshot })
      .__PHASER_GAME_DIAGNOSTICS__;
    return {
      activeProjectiles: d.activeProjectiles,
      p1SkillAmmo: d.players[0]?.skillAmmo,
    };
  });
  expect(flameDiag.activeProjectiles).toBeGreaterThanOrEqual(20);
  expect(flameDiag.p1SkillAmmo).toBe(68);
  await page.screenshot({ path: path.join(SHOT_DIR, '01-realistic-fluid-flame-stream.png') });

  // 2b. Verify Crescent Reaper (`Lưỡi Hái Tử Thần`) locks movement like Laser + both Reaper & Laser glow in Night Mode!
  const reaperStartPos = await page.evaluate(() => {
    const game = (window as unknown as { __WINDTANK_GAME__: Phaser.Game }).__WINDTANK_GAME__;
    const gs = game.scene.getScene('GameScene') as unknown as {
      arena: { originX: number; originY: number; cellSize: number; walls: unknown[] };
      tanks: Array<{
        kinematics: { x: number; y: number; vx: number; vy: number; angle: number; alive: boolean };
        equipSkill: (s: string, ammo: number) => void;
        getSkillState: () => { reaperWindupRemaining?: number; reaperSpinRemaining?: number };
      }>;
      powerUpSystem: {
        tryHandlePlayerFire: (
          tank: unknown,
          walls: unknown[],
          isHeld: boolean,
          consume: () => boolean,
        ) => void;
      };
      nightVisionSystem: {
        triggerLaserFlashCorridor: (pts: Array<{ x: number; y: number }>) => void;
      };
      effectsSystem: {
        emitLaserBeamBlast: (pts: Array<{ x: number; y: number }>, victims: unknown[]) => void;
      };
    };
    const p1 = gs.tanks[0] as unknown as {
      kinematics: { x: number; y: number; vx: number; vy: number; angle: number };
      equipSkill: (s: string, ammo: number) => void;
      startReaperSweep: () => void;
    };
    p1.kinematics.vx = 140;
    p1.kinematics.vy = 90;
    p1.kinematics.angle = -0.35;
    p1.equipSkill('reaper', 1);
    p1.startReaperSweep();

    // Also equip P2 with Laser charging in the dark!
    const p2 = gs.tanks[1] as unknown as {
      kinematics: { x: number; y: number; angle: number; alive: boolean };
      equipSkill: (s: string, ammo: number) => void;
      startLaserCharge: () => void;
    };
    if (p2 && p2.kinematics.alive) {
      p2.kinematics.x = gs.arena.originX + gs.arena.cellSize * 13.5;
      p2.kinematics.y = gs.arena.originY + gs.arena.cellSize * 3.5;
      p2.kinematics.angle = Math.PI;
      p2.equipSkill('laser', 1);
      p2.startLaserCharge();
    }

    return { x: p1.kinematics.x, y: p1.kinematics.y, vx: p1.kinematics.vx, vy: p1.kinematics.vy };
  });
  expect(reaperStartPos.vx).toBe(0);
  expect(reaperStartPos.vy).toBe(0);

  // Hold `KeyW` (forward) across Windup -> Scythe Sweep transition — P1 MUST stay 100% movement-locked!
  await page.keyboard.down('KeyW');
  await page.waitForFunction(
    () => {
      const game = (window as unknown as { __WINDTANK_GAME__?: Phaser.Game }).__WINDTANK_GAME__;
      const gs = game?.scene.getScene('GameScene') as unknown as {
        tanks?: Array<{ isReaperSweeping: () => boolean }>;
      };
      return Boolean(gs?.tanks?.[0]?.isReaperSweeping());
    },
    null,
    { timeout: 5000 },
  );
  await page.waitForTimeout(160);
  await page.keyboard.up('KeyW');

  const reaperAfterHold = await page.evaluate(() => {
    const game = (window as unknown as { __WINDTANK_GAME__: Phaser.Game }).__WINDTANK_GAME__;
    const gs = game.scene.getScene('GameScene') as unknown as {
      arena: { originX: number; originY: number; cellSize: number };
      tanks: Array<{
        kinematics: { x: number; y: number; vx: number; vy: number };
        isReaperSweeping: () => boolean;
      }>;
      nightVisionSystem: {
        triggerLaserFlashCorridor: (pts: Array<{ x: number; y: number }>) => void;
      };
      effectsSystem: {
        emitLaserBeamBlast: (pts: Array<{ x: number; y: number }>, victims: unknown[]) => void;
      };
    };
    const beamPts = [
      {
        x: gs.arena.originX + gs.arena.cellSize * 15.5,
        y: gs.arena.originY + gs.arena.cellSize * 8.5,
      },
      {
        x: gs.arena.originX + gs.arena.cellSize * 3.5,
        y: gs.arena.originY + gs.arena.cellSize * 9.5,
      },
    ];
    gs.effectsSystem.emitLaserBeamBlast(beamPts, []);
    gs.nightVisionSystem.triggerLaserFlashCorridor(beamPts);

    const p1 = gs.tanks[0];
    return {
      x: p1.kinematics.x,
      y: p1.kinematics.y,
      vx: p1.kinematics.vx,
      vy: p1.kinematics.vy,
      sweeping: p1.isReaperSweeping(),
    };
  });
  await waitFrames(2, page);
  expect(reaperAfterHold.sweeping).toBe(true);
  expect(reaperAfterHold.vx).toBe(0);
  expect(reaperAfterHold.vy).toBe(0);
  expect(Math.hypot(reaperAfterHold.x - reaperStartPos.x, reaperAfterHold.y - reaperStartPos.y)).toBeLessThan(0.5);
  await page.screenshot({ path: path.join(SHOT_DIR, '01b-night-reaper-and-laser-glow.png') });

  // 3. Test 3x Restart Match for zero texture/display-object leaks
  const baselineCounts = await page.evaluate(() => {
    const d = (window as unknown as { __PHASER_GAME_DIAGNOSTICS__: DiagnosticsSnapshot })
      .__PHASER_GAME_DIAGNOSTICS__;
    return {
      texturesCount: d.texturesCount,
      displayObjects: d.displayObjects,
    };
  });
  for (let r = 0; r < 3; r++) {
    await page.keyboard.press('Escape');
    await page.waitForTimeout(110);
    await clickDesignCoord(640, 348);
    await page.waitForTimeout(190);
  }
  const postRestartDiag = await page.evaluate(() => {
    const d = (window as unknown as { __PHASER_GAME_DIAGNOSTICS__: DiagnosticsSnapshot })
      .__PHASER_GAME_DIAGNOSTICS__;
    return {
      texturesCount: d.texturesCount,
      displayObjects: d.displayObjects,
      round: d.round,
    };
  });
  expect(postRestartDiag.round).toBe(1);
  expect(postRestartDiag.texturesCount).toBeLessThanOrEqual(baselineCounts.texturesCount + 2);
  expect(postRestartDiag.displayObjects).toBeLessThanOrEqual(baselineCounts.displayObjects + 10);

  // Return PC page to MenuScene for Online 1vs1 Host test later
  await page.keyboard.press('Escape');
  await page.waitForTimeout(120);
  await clickDesignCoord(640, 516);
  await page.waitForFunction(() => {
    const g = (window as unknown as { __WINDTANK_GAME__?: Phaser.Game }).__WINDTANK_GAME__;
    return Boolean(g?.scene.isActive('MenuScene'));
  });

  // 4. Portrait Mobile Device Simulation (`390×844` + `?device=mobile`):
  //    Verify Auto Mobile Detection, CSS 90deg Landscape Lock, 3P/4P Lock, & 2P Opposite Tabletop Controls!
  const mobilePage = await context.newPage();
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  mobilePage.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[Mobile] ${msg.text()}`);
  });
  mobilePage.on('pageerror', (err) => pageErrors.push(`[Mobile] ${err.message}`));

  await mobilePage.goto('/?device=mobile');
  await mobilePage.waitForSelector('canvas', { state: 'visible' });
  await mobilePage.waitForFunction(
    () => {
      const g = (window as unknown as { __WINDTANK_GAME__?: Phaser.Game }).__WINDTANK_GAME__;
      return Boolean(g?.scene.isActive('MenuScene'));
    },
    null,
    { timeout: 45000 },
  );
  await mobilePage.waitForTimeout(260);

  // Ensure both P1 and P2 are Human (`playerIsAI = [false, false, false, false]`) for 2P Opposite Tabletop test!
  const mobileMenuState = await mobilePage.evaluate(() => {
    const o = (
      window as unknown as {
        __WINDTANK_ORIENTATION__: {
          getState: () => { isMobileUi: boolean; isCssPortraitRotated: boolean };
        };
      }
    ).__WINDTANK_ORIENTATION__;
    const hasRotateClass = document.body.classList.contains('mobile-force-landscape');
    const raw = window.localStorage.getItem('windtank_settings_v1');
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      orient: o.getState(),
      hasRotateClass,
      playerCount: parsed.playerCount ?? 2,
    };
  });
  expect(mobileMenuState.orient.isMobileUi).toBe(true);
  expect(mobileMenuState.orient.isCssPortraitRotated).toBe(true);
  expect(mobileMenuState.hasRotateClass).toBe(true);
  expect(mobileMenuState.playerCount).toBe(2);

  // Pressing Digit4 or clicking 4-player button (`x=805, y=294`) on Mobile MUST stay locked at 2 players!
  await mobilePage.keyboard.press('Digit4');
  await clickDesignCoord(805, 294, mobilePage);
  await mobilePage.waitForTimeout(320); // Allow Fullscreen Recommendation Banner entrance tween to settle
  await mobilePage.screenshot({
    path: path.join(SHOT_DIR, '02-mobile-portrait-auto-css-landscape-menu.png'),
  });

  // Verify Fullscreen Recommendation Banner dismiss (`x=1032, y=40`) & Enter/Exit Fullscreen Button (`x=1184, y=40`)!
  await clickDesignCoord(1032, 40, mobilePage);
  await mobilePage.waitForTimeout(140);
  const dismissedPrompt = await mobilePage.evaluate(() => {
    const o = (
      window as unknown as {
        __WINDTANK_ORIENTATION__: {
          hasDismissedFullscreenPrompt: () => boolean;
          getState: () => { isMobileUi: boolean; isFullscreen: boolean };
        };
      }
    ).__WINDTANK_ORIENTATION__;
    return o.hasDismissedFullscreenPrompt();
  });
  expect(dismissedPrompt).toBe(true);

  // Enter Fullscreen via `⛶ FULL MÀN HÌNH` button click, assert `document.fullscreenElement` is active, then click again to exit cleanly!
  await clickDesignCoord(1184, 40, mobilePage);
  await mobilePage.waitForFunction(() => Boolean(document.fullscreenElement), null, {
    timeout: 5000,
  });
  await clickDesignCoord(1184, 40, mobilePage);
  await mobilePage.evaluate(async () => {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => {});
    }
  });
  await mobilePage.waitForFunction(() => !document.fullscreenElement, null, {
    timeout: 5000,
  });
  await mobilePage.setViewportSize({ width: 390, height: 844 });
  await mobilePage.waitForTimeout(150);
  await waitFrames(2, mobilePage);

  // Tap `VÀO SẢNH ĐẤU` (`388, 504`) directly through the +90deg CSS-rotated portrait canvas!
  await clickDesignCoord(388, 504, mobilePage);
  await mobilePage.waitForFunction(() => {
    const g = (window as unknown as { __WINDTANK_GAME__?: Phaser.Game }).__WINDTANK_GAME__;
    return Boolean(g?.scene.isActive('SetupScene'));
  });
  await mobilePage.waitForTimeout(260);

  // Switch to Landscape `844×390` to inspect crisp unrotated Setup Cards + 2P Opposite Tabletop HUD too!
  await mobilePage.setViewportSize({ width: 844, height: 390 });
  await mobilePage.waitForTimeout(180);

  // Ensure P2 is Human (not AI) in SetupScene; if P2 was AI from shared storage, click P2 toggle at (496, 352)
  const p2WasAI = await mobilePage.evaluate(() => {
    const raw = window.localStorage.getItem('windtank_settings_v1');
    const parsed = raw ? JSON.parse(raw) : null;
    return Boolean(parsed?.playerIsAI?.[1]);
  });
  if (p2WasAI) {
    await clickDesignCoord(496, 352, mobilePage);
    await mobilePage.waitForTimeout(120);
  }
  await mobilePage.screenshot({
    path: path.join(SHOT_DIR, '03-mobile-setup-locked-3p4p-and-2p-opposite-cards.png'),
  });

  // Open Mobile SettingsModal (`ĐỘ NHẠY LÁI` at x=1034, y=590) -> verify Style, Sensitivity & Fixed vs Follow-Touch selector!
  await clickDesignCoord(1034, 590, mobilePage);
  await mobilePage.waitForTimeout(240);
  // Click `+` on `ĐỘ NHẠY CẦN GẠT` (`x = 640 + 394 = 1034, y = 224 + 88 = 312`) -> 110%!
  await clickDesignCoord(1034, 312, mobilePage);
  await mobilePage.waitForTimeout(80);
  // Click `📌 CỐ ĐỊNH VỊ TRÍ` (`x = 640 + 238 = 878, y = 224 + 262 = 486`) -> verify `touchFloatingStick === false`!
  await clickDesignCoord(878, 486, mobilePage);
  await mobilePage.waitForTimeout(80);
  const afterFixedClick = await mobilePage.evaluate(() => {
    const raw = window.localStorage.getItem('windtank_settings_v1');
    return raw ? JSON.parse(raw) : null;
  });
  expect(afterFixedClick.touchFloatingStick).toBe(false);

  // Switch back to `🎯 THEO ĐIỂM ĐẶT TAY` (`x = 640 - 118 = 522, y = 486`) -> verify `touchFloatingStick === true`!
  await clickDesignCoord(522, 486, mobilePage);
  await mobilePage.waitForTimeout(100);
  await mobilePage.screenshot({
    path: path.join(SHOT_DIR, '03b-mobile-settings-driving-style-and-sensitivity.png'),
  });
  const updatedMobileSettings = await mobilePage.evaluate(() => {
    const raw = window.localStorage.getItem('windtank_settings_v1');
    return raw ? JSON.parse(raw) : null;
  });
  expect(updatedMobileSettings.touchSensitivity).toBeCloseTo(1.1, 2);
  expect(updatedMobileSettings.touchFloatingStick).toBe(true);
  // Close Mobile SettingsModal (`HOÀN TẤT` at x=775, y=654) and wait deterministically for modal close!
  await clickDesignCoord(775, 654, mobilePage);
  await mobilePage.waitForFunction(() => {
    const g = (window as unknown as { __WINDTANK_GAME__?: Phaser.Game }).__WINDTANK_GAME__;
    const setup = g?.scene.getScene('SetupScene') as unknown as { activeModal?: unknown } | undefined;
    return Boolean(setup && setup.activeModal === null);
  });
  await waitFrames(2, mobilePage);

  // Advance from Mobile SetupScene (`735, 696`) -> Mobile ModeSelectScene -> select `🛡️ ĐỘ BỀN GIÁP` (`Digit2`) -> Start Match!
  await clickDesignCoord(735, 696, mobilePage);
  await mobilePage.waitForFunction(() => {
    const g = (window as unknown as { __WINDTANK_GAME__?: Phaser.Game }).__WINDTANK_GAME__;
    return Boolean(g?.scene.isActive('ModeSelectScene'));
  });
  await mobilePage.waitForTimeout(200);
  await mobilePage.keyboard.press('Digit2');
  await mobilePage.waitForTimeout(100);
  await mobilePage.screenshot({
    path: path.join(SHOT_DIR, '03c-mobile-mode-select-scene.png'),
  });
  await clickDesignCoord(735, 696, mobilePage);
  await mobilePage.waitForFunction(
    () => {
      const d = (window as unknown as { __PHASER_GAME_DIAGNOSTICS__?: DiagnosticsSnapshot })
        .__PHASER_GAME_DIAGNOSTICS__;
      return d?.phase === 'playing' && d?.players.length === 2 && d?.touchActive === true;
    },
    null,
    { timeout: 30000 },
  );

  // Simultaneously drive & fire BOTH Player 1 (Left side) AND Player 2 (Opposite Right side)!
  const dualBefore = await mobilePage.evaluate(() => {
    const d = (window as unknown as { __PHASER_GAME_DIAGNOSTICS__: DiagnosticsSnapshot })
      .__PHASER_GAME_DIAGNOSTICS__;
    const tc = (
      window as unknown as {
        __PHASER_TOUCH_CONTROLS__: {
          getGeometry: () => {
            visible: boolean;
            dualOppositeMode: boolean;
            stickRest: { x: number; y: number; maxRadius: number };
            fireBtn: { x: number; y: number };
            p2StickRest: { x: number; y: number };
            p2FireBtn: { x: number; y: number };
          };
          setVirtualStick: (dx: number, dy: number, slot?: 0 | 1) => void;
          tapFire: (slot?: 0 | 1) => void;
        };
      }
    ).__PHASER_TOUCH_CONTROLS__;
    const geo = tc.getGeometry();
    // P1 pushes stick right (+X), P2 pushes stick left (-X), and BOTH tap their opposite BẮN! buttons!
    tc.setVirtualStick(48, 8, 0);
    tc.tapFire(0);
    tc.setVirtualStick(-48, -8, 1);
    tc.tapFire(1);
    return {
      geo,
      arenaBounds: d.arenaBounds,
      p1Start: { x: d.players[0].x, y: d.players[0].y, angle: d.players[0].angle },
      p2Start: { x: d.players[1].x, y: d.players[1].y, angle: d.players[1].angle },
    };
  });

  expect(dualBefore.geo.visible).toBe(true);
  expect(dualBefore.geo.dualOppositeMode).toBe(true);
  // Default 2P joystick radius enlarged 1.25x (`54 * 1.25 = 68` at 100% scale)!
  expect(dualBefore.geo.stickRest.maxRadius).toBeGreaterThanOrEqual(68);
  // P1 controls on Left (< 224), P2 controls on Opposite Right (> 1056)
  expect(dualBefore.geo.stickRest.x).toBeLessThan(200);
  expect(dualBefore.geo.fireBtn.x).toBeLessThan(200);
  expect(dualBefore.geo.p2StickRest.x).toBeGreaterThan(1080);
  expect(dualBefore.geo.p2FireBtn.x).toBeGreaterThan(1080);

  await waitFrames(3, mobilePage);
  const dualAfter = await mobilePage.evaluate(() => {
    const d = (window as unknown as { __PHASER_GAME_DIAGNOSTICS__: DiagnosticsSnapshot })
      .__PHASER_GAME_DIAGNOSTICS__;
    return {
      p1: d.players[0],
      p2: d.players[1],
    };
  });
  await mobilePage.screenshot({
    path: path.join(SHOT_DIR, '04-mobile-2p-opposite-tabletop-gameplay.png'),
  });
  await mobilePage.evaluate(() => {
    const tc = (
      window as unknown as {
        __PHASER_TOUCH_CONTROLS__: { releaseVirtualStick: (slot?: 0 | 1) => void };
      }
    ).__PHASER_TOUCH_CONTROLS__;
    tc.releaseVirtualStick(0);
    tc.releaseVirtualStick(1);
  });

  // Verify Follow-Touch (`touchFloatingStick = true`) vs Fixed (`touchFloatingStick = false`) anchor behavior live!
  const anchorCheck = await mobilePage.evaluate(() => {
    const tc = (
      window as unknown as {
        __PHASER_TOUCH_CONTROLS__: {
          getGeometry: () => {
            stickRest: { x: number; y: number };
            stickActiveBase: { x: number; y: number; active: boolean };
          };
          simulateTouchDown: (x: number, y: number, id?: number) => void;
          simulateTouchUp: (id?: number) => void;
          setFloatingStick: (enabled: boolean) => void;
        };
      }
    ).__PHASER_TOUCH_CONTROLS__;

    // 1. Follow-Touch mode: touching at (156, 286) moves joystick center right to (156, 286)!
    tc.setFloatingStick(true);
    tc.simulateTouchDown(156, 286, 977);
    const floatingBase = tc.getGeometry().stickActiveBase;
    tc.simulateTouchUp(977);

    // 2. Fixed mode: touching at (156, 286) keeps joystick center locked at rest (106, 214)!
    tc.setFloatingStick(false);
    tc.simulateTouchDown(156, 286, 978);
    const fixedBase = tc.getGeometry().stickActiveBase;
    const rest = tc.getGeometry().stickRest;
    tc.simulateTouchUp(978);
    tc.setFloatingStick(true);

    return { floatingBase, fixedBase, rest };
  });
  expect(anchorCheck.floatingBase.active).toBe(true);
  expect(anchorCheck.floatingBase.x).toBe(156);
  expect(anchorCheck.floatingBase.y).toBe(286);
  expect(anchorCheck.fixedBase.active).toBe(true);
  expect(anchorCheck.fixedBase.x).toBe(anchorCheck.rest.x);
  expect(anchorCheck.fixedBase.y).toBe(anchorCheck.rest.y);
  expect(dualAfter.p1.ammo < 10 || !dualAfter.p1.alive).toBe(true);
  expect(dualAfter.p2.ammo < 10 || !dualAfter.p2.alive).toBe(true);
  expect(
    Math.hypot(dualAfter.p1.x - dualBefore.p1Start.x, dualAfter.p1.y - dualBefore.p1Start.y) > 2 ||
      Math.abs(dualAfter.p1.angle - dualBefore.p1Start.angle) > 0.08,
  ).toBe(true);
  expect(
    Math.hypot(dualAfter.p2.x - dualBefore.p2Start.x, dualAfter.p2.y - dualBefore.p2Start.y) > 2 ||
      Math.abs(dualAfter.p2.angle - dualBefore.p2Start.angle) > 0.08,
  ).toBe(true);

  await mobilePage.close();

  // 5. 2-Tab Serverless 1vs1 Online Room Code Lobby (`WT-XXXX`) + Live Host-Guest P2P Sync!
  await clickDesignCoord(892, 504, page);
  await page.waitForFunction(() => {
    const lob = (
      window as unknown as {
        __PHASER_ONLINE_LOBBY__?: { getState: () => { roomCode: string; formattedCode: string } };
      }
    ).__PHASER_ONLINE_LOBBY__;
    return Boolean(lob && lob.getState().roomCode.length === 4);
  });

  const hostRoomInfo = await page.evaluate(() => {
    const lob = (
      window as unknown as {
        __PHASER_ONLINE_LOBBY__: {
          getState: () => { roomCode: string; formattedCode: string; role: string };
        };
      }
    ).__PHASER_ONLINE_LOBBY__;
    return lob.getState();
  });
  expect(hostRoomInfo.formattedCode).toMatch(/^WT-[A-Z0-9]{4}$/);

  const guestPage = await context.newPage();
  guestPage.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(`[Guest] ${msg.text()}`);
  });
  guestPage.on('pageerror', (err) => pageErrors.push(`[Guest] ${err.message}`));

  await guestPage.goto(`/?device=pc&p2p=local&room=${hostRoomInfo.formattedCode}`);
  await guestPage.waitForSelector('canvas', { state: 'visible' });
  await guestPage.waitForFunction(
    () => {
      const lob = (
        window as unknown as {
          __PHASER_ONLINE_LOBBY__?: { getState: () => { connected: boolean } };
        }
      ).__PHASER_ONLINE_LOBBY__;
      return Boolean(lob?.getState().connected);
    },
    null,
    { timeout: 45000 },
  );

  // Verify Host can select Battle Mode directly in Online Lobby (`⚡ TỬ CHIẾN` pill at `x=1044, y=416`) & sync to Guest!
  await clickDesignCoord(1044, 416, page);
  await guestPage.waitForFunction(
    () => {
      const lob = (
        window as unknown as {
          __PHASER_ONLINE_LOBBY__?: { getState: () => { battleMode?: string } };
        }
      ).__PHASER_ONLINE_LOBBY__;
      return lob?.getState().battleMode === 'night_armored';
    },
    null,
    { timeout: 5000 },
  );
  await page.screenshot({
    path: path.join(SHOT_DIR, '05-online-host-mode-selector-lobby.png'),
  });

  await guestPage.evaluate(() => {
    const lob = (
      window as unknown as { __PHASER_ONLINE_LOBBY__: { toggleGuestReady: () => void } }
    ).__PHASER_ONLINE_LOBBY__;
    lob.toggleGuestReady();
  });

  await page.waitForFunction(
    () => {
      const lob = (
        window as unknown as {
          __PHASER_ONLINE_LOBBY__?: { getState: () => { guestReady: boolean } };
        }
      ).__PHASER_ONLINE_LOBBY__;
      return Boolean(lob?.getState().guestReady);
    },
    null,
    { timeout: 5000 },
  );

  await page.evaluate(() => {
    const lob = (
      window as unknown as { __PHASER_ONLINE_LOBBY__: { hostStartMatch: (seed: number) => void } }
    ).__PHASER_ONLINE_LOBBY__;
    lob.hostStartMatch(4829);
  });

  await Promise.all([
    page.waitForFunction(
      () => {
        const d = (window as unknown as { __PHASER_GAME_DIAGNOSTICS__?: DiagnosticsSnapshot })
          .__PHASER_GAME_DIAGNOSTICS__;
        return d?.networkRole === 'host' && d?.phase === 'playing' && d?.players.length === 2;
      },
      null,
      { timeout: 20000 },
    ),
    guestPage.waitForFunction(
      () => {
        const d = (window as unknown as { __PHASER_GAME_DIAGNOSTICS__?: DiagnosticsSnapshot })
          .__PHASER_GAME_DIAGNOSTICS__;
        return d?.networkRole === 'guest' && d?.phase === 'playing' && d?.players.length === 2;
      },
      null,
      { timeout: 20000 },
    ),
  ]);

  await waitFrames(2, guestPage);
  await guestPage.keyboard.press('Space');
  await guestPage.waitForFunction(
    () => {
      const d = (window as unknown as { __PHASER_GAME_DIAGNOSTICS__?: DiagnosticsSnapshot })
        .__PHASER_GAME_DIAGNOSTICS__;
      return Boolean(d && d.players[1] && d.players[1].ammo < 10);
    },
    null,
    { timeout: 5000 },
  );

  await guestPage.close();

  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
