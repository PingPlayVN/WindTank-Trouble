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
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));

  // 0. Capture Smooth Hero-Tank Loading Screen (`PreloadScene`) mid-progress, then wait for MenuScene!
  await page.goto('/?device=pc&p2p=local', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('canvas', { state: 'visible' });
  await page.waitForFunction(() => {
    const g = (window as unknown as { __WINDTANK_GAME__?: Phaser.Game }).__WINDTANK_GAME__;
    const pre = g?.scene.getScene('PreloadScene') as unknown as { displayProgress?: number } | undefined;
    if (g?.scene.isActive('PreloadScene') && (pre?.displayProgress ?? 0) >= 0.45) {
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
  await page.waitForTimeout(260);

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

  // Cycle Map to Procedural Titan (20x12) & Start Battle
  for (let i = 0; i < 5; i++) {
    await clickDesignCoord(456, 590);
    await page.waitForTimeout(45);
  }
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
  await mobilePage.waitForTimeout(100);
  await mobilePage.screenshot({
    path: path.join(SHOT_DIR, '02-mobile-portrait-auto-css-landscape-menu.png'),
  });

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

  // Open Mobile SettingsModal (`ĐỘ NHẠY LÁI` at x=1034, y=590) -> verify Keyboard Matrix is replaced by Style & Sensitivity!
  await clickDesignCoord(1034, 590, mobilePage);
  await mobilePage.waitForTimeout(240);
  // Click `+` on `ĐỘ NHẠY CẦN GẠT` (`x = 640 + 394 = 1034, y = 380 - 312 + 156 + 98 = 322`) -> 110%!
  await clickDesignCoord(1034, 322, mobilePage);
  await mobilePage.waitForTimeout(120);
  await mobilePage.screenshot({
    path: path.join(SHOT_DIR, '03b-mobile-settings-driving-style-and-sensitivity.png'),
  });
  const updatedMobileSettings = await mobilePage.evaluate(() => {
    const raw = window.localStorage.getItem('windtank_settings_v1');
    return raw ? JSON.parse(raw) : null;
  });
  expect(updatedMobileSettings.touchSensitivity).toBeCloseTo(1.1, 2);
  // Close Mobile SettingsModal (`HOÀN TẤT` at x=775, y=654) and wait deterministically for modal close!
  await clickDesignCoord(775, 654, mobilePage);
  await mobilePage.waitForFunction(() => {
    const g = (window as unknown as { __WINDTANK_GAME__?: Phaser.Game }).__WINDTANK_GAME__;
    const setup = g?.scene.getScene('SetupScene') as unknown as { activeModal?: unknown } | undefined;
    return Boolean(setup && setup.activeModal === null);
  });
  await waitFrames(2, mobilePage);

  // Start 2-Player Opposite Tabletop Match on Mobile!
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
            stickRest: { x: number; y: number };
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
      { timeout: 10000 },
    ),
    guestPage.waitForFunction(
      () => {
        const d = (window as unknown as { __PHASER_GAME_DIAGNOSTICS__?: DiagnosticsSnapshot })
          .__PHASER_GAME_DIAGNOSTICS__;
        return d?.networkRole === 'guest' && d?.phase === 'playing' && d?.players.length === 2;
      },
      null,
      { timeout: 10000 },
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
