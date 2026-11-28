import assert from 'node:assert/strict';
import test from 'node:test';
import { TANK_PALETTES } from '../src/game/config/paletteConfig';
import { SettingsManager } from '../src/game/managers/SettingsManager';
import { SkinWalletManager } from '../src/game/managers/SkinWalletManager';
import {
  ALL_TANK_SKIN_IDS,
  getTankSkinDescriptor,
  getTankSkinModule,
  NEUTRAL_SKIN_STATS,
  resolveEffectiveSkinStats,
  TANK_SKIN_DESCRIPTORS,
  TANK_SKIN_MODULES,
} from '../src/game/skins';

function createMockCanvasContext(recordedColors: Set<string>): CanvasRenderingContext2D {
  let fillStyleVal: unknown = '#000000';
  let strokeStyleVal: unknown = '#000000';

  const makeGrad = () => ({
    addColorStop(_offset: number, color: string) {
      recordedColors.add(color.toUpperCase());
    },
  });

  const ctx = {
    get fillStyle() {
      return fillStyleVal;
    },
    set fillStyle(v: unknown) {
      fillStyleVal = v;
      if (typeof v === 'string') recordedColors.add(v.toUpperCase());
    },
    get strokeStyle() {
      return strokeStyleVal;
    },
    set strokeStyle(v: unknown) {
      strokeStyleVal = v;
      if (typeof v === 'string') recordedColors.add(v.toUpperCase());
    },
    lineWidth: 1,
    save() {},
    restore() {},
    translate() {},
    rotate() {},
    scale() {},
    beginPath() {},
    closePath() {},
    moveTo() {},
    lineTo() {},
    quadraticCurveTo() {},
    bezierCurveTo() {},
    arc() {},
    arcTo() {},
    ellipse() {},
    rect() {},
    fill() {},
    stroke() {},
    clip() {},
    fillRect() {},
    strokeRect() {},
    setLineDash() {},
    createLinearGradient: makeGrad,
    createRadialGradient: makeGrad,
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

test('8 ES6 Tank Skin Modules: valid descriptors, balanced stat trade-offs, and dynamic Tank Color adaptation', () => {
  assert.equal(TANK_SKIN_MODULES.length, 8);
  assert.equal(TANK_SKIN_DESCRIPTORS.length, 8);
  assert.equal(ALL_TANK_SKIN_IDS.length, 8);
  assert.equal(getTankSkinDescriptor('classic').priceXu, 0);

  for (const skinMod of TANK_SKIN_MODULES) {
    const d = skinMod.descriptor;
    assert.ok(d.name.length > 3);
    assert.equal(d.pros.length, 2);
    assert.equal(d.cons.length, 2);

    if (d.id !== 'classic') {
      assert.ok(d.priceXu >= 25000, `Paid skin ${d.id} must have a positive WindHub Xu price`);
      const st = d.stats;
      const hasBuff =
        st.radiusScale < 1 ||
        st.forwardSpeedScale > 1 ||
        st.backwardSpeedScale > 1 ||
        st.turnSpeedScale > 1 ||
        st.maxAmmo > 10 ||
        st.fireCooldownScale < 1 ||
        st.projectileSpeedScale > 1 ||
        st.projectileRadiusScale > 1 ||
        st.armorHpScale > 1 ||
        st.standardBulletDamageScale > 1;
      const hasTradeoff =
        st.radiusScale > 1 ||
        st.forwardSpeedScale < 1 ||
        st.backwardSpeedScale < 1 ||
        st.maxAmmo < 10 ||
        st.projectileSpeedScale < 1 ||
        st.armorHpScale < 1;
      assert.equal(hasBuff, true, `Skin ${d.id} must provide a distinct tactical buff`);
      assert.equal(hasTradeoff, true, `Skin ${d.id} must include a genuine balancing trade-off`);
    }

    // Verify every single Skin dynamically adapts to ANY selected TankColorPalette!
    for (const palette of TANK_PALETTES) {
      const usedColors = new Set<string>();
      const ctx = createMockCanvasContext(usedColors);
      skinMod.drawChassis(ctx, palette, 1, null);
      skinMod.drawHullClipPath(ctx);
      skinMod.drawStandardBarrel(ctx, palette);
      skinMod.drawTurret(ctx, palette, null);

      assert.equal(
        usedColors.has(palette.primaryHex.toUpperCase()),
        true,
        `Skin ${d.id} must dynamically paint with tank palette ${palette.id} (${palette.primaryHex})`,
      );
    }
  }
});

test('Fair-Play Room Rule (skinStatsEnabled): toggles cleanly between Thực Chiến stats and 100% Chuẩn Ngoại Trang', () => {
  const viperCombat = resolveEffectiveSkinStats('viper_scout', true);
  assert.equal(viperCombat.radiusScale, 0.82);
  assert.equal(viperCombat.maxAmmo, 6);
  assert.equal(viperCombat.forwardSpeedScale, 1.18);

  const titanCombat = resolveEffectiveSkinStats('titan_heavy', true);
  assert.equal(titanCombat.armorHpScale, 1.45);
  assert.equal(titanCombat.knockbackScale, 0.4);

  const spiderCombat = resolveEffectiveSkinStats('arachnid_barrage', true);
  assert.equal(spiderCombat.maxAmmo, 15);
  assert.equal(spiderCombat.projectileBonusBounces, 4);

  const hoverCombat = resolveEffectiveSkinStats('hover_specter', true);
  assert.equal(hoverCombat.backwardSpeedScale, 1.38);
  assert.equal(hoverCombat.iceResistRatio, 0.5);
  assert.equal(getTankSkinModule('hover_specter').descriptor.leavesTreadMarks, false);

  // When Fair-Play Cosmetic-Only mode (`skinStatsEnabled = false`) is active, ALL 8 skins get 100% neutral stats!
  for (const id of ALL_TANK_SKIN_IDS) {
    const fairStats = resolveEffectiveSkinStats(id, false);
    assert.deepEqual(
      fairStats,
      NEUTRAL_SKIN_STATS,
      `Skin ${id} must use 100% neutral stats when skinStatsEnabled=false`,
    );
  }
});

test('WindHub Wallet Bridge & 100% Offline Skin Persistence: buy online via WindHub Xu, play 100% Offline forever', async () => {
  const g = globalThis as unknown as {
    window?: Record<string, unknown>;
    localStorage?: Storage;
    navigator?: { onLine: boolean };
  };
  const prevWin = g.window;
  const prevLs = g.localStorage;
  const prevNav = g.navigator;

  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => {
      store.set(k, String(v));
    },
    removeItem: (k: string) => {
      store.delete(k);
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;

  let isOnline = true;
  let mockBalance = 100000;
  const cloudSkins = new Set<string>(['classic']);

  const mockBridge = {
    getState: () => ({
      connectedToWindHub: true,
      authenticated: true,
      online: isOnline,
      uid: 'wh_user_001',
      displayName: 'Phong WindHub',
      avatarUrl: '',
      balance: mockBalance,
      ownedSkins: Array.from(cloudSkins),
    }),
    purchaseSkin: async ({
      skinId,
      skinName,
      costXu,
    }: {
      skinId: string;
      skinName: string;
      costXu: number;
    }) => {
      if (!isOnline) {
        return { success: false, code: 'OFFLINE' as const, message: 'Offline' };
      }
      if (mockBalance < costXu) {
        return {
          success: false,
          code: 'INSUFFICIENT_FUNDS' as const,
          newBalance: mockBalance,
          message: `Thiếu xu mua ${skinName}`,
        };
      }
      mockBalance -= costXu;
      cloudSkins.add(skinId);
      return {
        success: true,
        newBalance: mockBalance,
        ownedSkins: Array.from(cloudSkins),
        message: `Đã mở khóa ${skinName}`,
      };
    },
  };

  try {
    g.localStorage = mockStorage;
    Object.defineProperty(g, 'navigator', {
      value: {
        get onLine() {
          return isOnline;
        },
      },
      configurable: true,
    });
    g.window = {
      localStorage: mockStorage,
      __WINDHUB_TANK_WALLET_BRIDGE__: mockBridge,
    };

    const wallet = new SkinWalletManager();
    assert.equal(wallet.getSnapshot().authenticated, true);
    assert.equal(wallet.getSnapshot().balance, 100000);
    assert.deepEqual(wallet.getOwnedSkins(), ['classic']);

    // 1. Buy Viper Scout (25,000 Xu) and Titan Heavy (55,000 Xu) online!
    const buyViper = await wallet.purchaseSkin('viper_scout', 'Bọ Cạp Trinh Sát', 25000);
    assert.equal(buyViper.success, true);
    assert.equal(wallet.getSnapshot().balance, 75000);

    const buyTitan = await wallet.purchaseSkin('titan_heavy', 'Pháo Đài Titan', 55000);
    assert.equal(buyTitan.success, true);
    assert.equal(wallet.getSnapshot().balance, 20000);

    // 2. Buying Cyber Omega (500,000 Xu) with 20,000 Xu fails cleanly
    const buyOmegaFail = await wallet.purchaseSkin('cyber_omega', 'Chiến Thần Quang Tử', 500000);
    assert.equal(buyOmegaFail.success, false);
    assert.equal(buyOmegaFail.code, 'INSUFFICIENT_FUNDS');

    // 3. Disconnect internet AND remove WindHub parent bridge -> 100% Offline standalone session!
    isOnline = false;
    delete g.window.__WINDHUB_TANK_WALLET_BRIDGE__;

    const offlineWallet = new SkinWalletManager();
    const offlineSnap = offlineWallet.getSnapshot();
    assert.equal(offlineSnap.online, false);
    assert.equal(offlineWallet.isSkinOwned('viper_scout'), true, 'Viper Scout MUST stay unlocked Offline!');
    assert.equal(offlineWallet.isSkinOwned('titan_heavy'), true, 'Titan Heavy MUST stay unlocked Offline!');
    assert.equal(offlineWallet.isSkinOwned('falcon_sniper'), false);

    // Buying new skin while Offline is rejected cleanly without corrupting owned skins
    const offlineBuy = await offlineWallet.purchaseSkin('falcon_sniper', 'Ưng Tiễn', 90000);
    assert.equal(offlineBuy.success, false);
    assert.equal(offlineBuy.code, 'OFFLINE');

    // SettingsManager equips unlocked Offline skins and rejects unowned skins
    const sm = new SettingsManager();
    assert.equal(sm.toggleSkinStatsEnabled(), false);
    assert.equal(sm.getSettings().skinStatsEnabled, false);
    assert.equal(sm.toggleSkinStatsEnabled(), true);
  } finally {
    if (prevWin === undefined) delete g.window;
    else g.window = prevWin;
    if (prevLs === undefined) delete g.localStorage;
    else g.localStorage = prevLs;
    if (prevNav === undefined) {
      delete (g as Record<string, unknown>).navigator;
    } else {
      Object.defineProperty(g, 'navigator', { value: prevNav, configurable: true });
    }
  }
});
