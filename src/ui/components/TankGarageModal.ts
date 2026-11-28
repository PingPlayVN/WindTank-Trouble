import Phaser from 'phaser';
import { AssetFactory } from '../../game/art/AssetFactory';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  getPaletteById,
  getSkillDescriptor,
  getTankSkinDescriptor,
  getTankSkinModule,
  TANK_PALETTES,
  TANK_SKIN_DESCRIPTORS,
  UI_COLORS,
} from '../../game/config/constants';
import { audioManager } from '../../game/managers/AudioManager';
import { settingsManager } from '../../game/managers/SettingsManager';
import {
  skinWalletManager,
  type WindHubWalletSnapshot,
} from '../../game/managers/SkinWalletManager';
import type { PlayerIndex, SkillId, TankSkinId } from '../../game/types/gameTypes';
import {
  animateModalOpen,
  createArcadeButton,
  createModalScrim,
  type ArcadeButtonHandle,
} from './ArcadeWidgets';

export interface TankGarageModalOptions {
  initialPlayerIndex?: PlayerIndex;
  lockSlotSelection?: boolean;
  onUpdated?: () => void;
  onClose: () => void;
}

const PREVIEW_SUIT_CYCLE: Array<SkillId | null> = [
  null,
  'laser',
  'reaper',
  'shield',
  'phantom',
  'cryo',
  'emp',
  'flame',
  'homing',
];

/**
 * Interactive 60 FPS Tank Skin Garage & WindHub Coin Shop (`Xưởng Chiến Xa`):
 * - Live turntable showcasing each Tank Skin with its real-time animated aura VFX
 *   (Hover plasma rings, Magma rising embers, Cyber Quantum Halo + Neon Ribbon, Spider rotary drum, etc.)
 * - Instant Tank Paint Swatch selector proving every Skin dynamically adapts to all Tank Colors
 * - Fair-Play Room Toggle (`Thực Chiến: Áp dụng chỉ số` vs `Thuần Ngoại Trang: Chuẩn 100%`)
 * - WindHub Xu Wallet purchase flow + 100% Offline persistence for all unlocked skins!
 */
export class TankGarageModal {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly contentRoot: Phaser.GameObjects.Container;
  private readonly dynamicRoot: Phaser.GameObjects.Container;
  private readonly onUpdated?: () => void;
  private readonly onCloseCallback: () => void;
  private readonly lockSlotSelection: boolean;

  private targetSlot: PlayerIndex;
  private selectedSkinId: TankSkinId;
  private previewSuitIdx = 0;
  private statusMessage = '';
  private statusIsError = false;
  private purchasing = false;
  private closed = false;

  private showroomSprite: Phaser.GameObjects.Image | null = null;
  private showroomShadow: Phaser.GameObjects.Image | null = null;
  private showroomAuraGfx: Phaser.GameObjects.Graphics | null = null;
  private showroomOverlayGfx: Phaser.GameObjects.Graphics | null = null;
  private showroomCenter = { x: 0, y: 0 };
  private animClock = 0;
  private treadPhase = 0;
  private treadTimer = 0;

  private unsubWallet: (() => void) | null = null;
  private walletSnap: WindHubWalletSnapshot;
  private readonly onKeyDownBound: (e: KeyboardEvent) => void;
  private readonly onSceneUpdateBound: (_time: number, delta: number) => void;

  constructor(scene: Phaser.Scene, opts: TankGarageModalOptions) {
    this.scene = scene;
    this.targetSlot = opts.initialPlayerIndex ?? 0;
    this.lockSlotSelection = Boolean(opts.lockSlotSelection);
    this.onUpdated = opts.onUpdated;
    this.onCloseCallback = opts.onClose;
    this.selectedSkinId = settingsManager.getPlayerSkin(this.targetSlot);
    this.walletSnap = skinWalletManager.getSnapshot();

    this.container = scene.add.container(0, 0).setDepth(230);
    this.contentRoot = scene.add.container(0, 0);
    this.dynamicRoot = scene.add.container(0, 0);

    this.onKeyDownBound = (e: KeyboardEvent) => {
      if (this.closed || e.repeat) return;
      if (e.code === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    };
    this.onSceneUpdateBound = (_t: number, delta: number) => {
      this.stepShowroomAnimation(delta / 1000);
    };

    window.addEventListener('keydown', this.onKeyDownBound, true);
    scene.events.on(Phaser.Scenes.Events.UPDATE, this.onSceneUpdateBound);

    this.buildStaticShell();
    this.rebuildDynamicContent();

    this.unsubWallet = skinWalletManager.subscribe((snap) => {
      this.walletSnap = snap;
      if (!this.closed) {
        this.rebuildDynamicContent();
      }
    });
  }

  private buildStaticShell(): void {
    const scrim = createModalScrim(this.scene, 0x0d1016, 0.68);
    scrim.on('pointerdown', () => {
      // Keep modal open unless close button or ESC pressed so accidental outside taps don't interrupt shopping
    });

    const panelW = 1120;
    const panelH = 668;
    const px = DESIGN_WIDTH / 2;
    const py = DESIGN_HEIGHT / 2;
    const topY = py - panelH / 2;

    const panel = this.scene.add.graphics();
    panel.fillStyle(0x0b0d12, 0.34);
    panel.fillRoundedRect(px - panelW / 2 + 6, topY + 8, panelW, panelH, 16);
    panel.fillStyle(UI_COLORS.cardBg, 1);
    panel.fillRoundedRect(px - panelW / 2, topY, panelW, panelH, 16);
    panel.fillStyle(0x161b26, 1);
    panel.fillRoundedRect(px - panelW / 2, topY, panelW, 54, {
      tl: 16,
      tr: 16,
      bl: 0,
      br: 0,
    });
    panel.lineStyle(3, UI_COLORS.inkDark, 1);
    panel.strokeRoundedRect(px - panelW / 2, topY, panelW, panelH, 16);

    const title = this.scene.add
      .text(px - panelW / 2 + 24, topY + 27, '🛡️ XƯỞNG CHIẾN XA & KHO NGOẠI TRANG', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '21px',
        fontStyle: '900',
        color: '#FFFFFF',
      })
      .setOrigin(0, 0.5);

    const closeBtn = createArcadeButton(this.scene, {
      x: px + panelW / 2 - 64,
      y: topY + 27,
      width: 96,
      height: 36,
      lipHeight: 2.5,
      label: '✕ ĐÓNG',
      fontSize: 13,
      fillColor: 0xe53935,
      hoverColor: 0xf44336,
      textColor: '#FFFFFF',
      onClick: () => this.close(),
    });

    this.container.add([scrim, this.contentRoot]);
    this.contentRoot.add([panel, title, closeBtn.container, this.dynamicRoot]);
    animateModalOpen(this.scene, scrim, this.contentRoot);
  }

  private rebuildDynamicContent(): void {
    this.dynamicRoot.removeAll(true);
    this.showroomSprite = null;
    this.showroomShadow = null;
    this.showroomAuraGfx = null;
    this.showroomOverlayGfx = null;

    const panelW = 1120;
    const panelH = 668;
    const px = DESIGN_WIDTH / 2;
    const py = DESIGN_HEIGHT / 2;
    const leftX = px - panelW / 2;
    const topY = py - panelH / 2;

    const s = settingsManager.getSettings();
    const activeColorId = s.playerColors[this.targetSlot] ?? 'red';
    const palette = getPaletteById(activeColorId);
    const equippedOnSlot = settingsManager.getPlayerSkin(this.targetSlot);

    // 1. Header WindHub Wallet / Offline Status Pill
    const walletTextCopy = !this.walletSnap.online
      ? `📴 OFFLINE • ĐÃ MỞ ${this.walletSnap.ownedSkins.length}/${TANK_SKIN_DESCRIPTORS.length} XE`
      : this.walletSnap.authenticated
        ? `◈ ${this.walletSnap.balance.toLocaleString()} XU  •  ${this.walletSnap.displayName.slice(0, 16)}`
        : '🔑 ĐĂNG NHẬP WINDHUB ĐỂ DÙNG XU';

    const walletPill = createArcadeButton(this.scene, {
      x: px + panelW / 2 - 284,
      y: topY + 27,
      width: 320,
      height: 36,
      lipHeight: 2,
      label: walletTextCopy,
      fontSize: 12.5,
      fillColor: !this.walletSnap.online
        ? 0x37474f
        : this.walletSnap.authenticated
          ? 0xffb300
          : 0x1565c0,
      hoverColor: !this.walletSnap.online
        ? 0x455a64
        : this.walletSnap.authenticated
          ? 0xffca28
          : 0x1976d2,
      textColor: this.walletSnap.authenticated && this.walletSnap.online ? '#18191B' : '#FFFFFF',
      onClick: () => {
        if (!this.walletSnap.authenticated && this.walletSnap.online) {
          const redirected = skinWalletManager.openWindHubLogin();
          if (!redirected) {
            this.setStatus(
              'Hãy mở WindTank bên trong mục Giải Trí của WindHub để tự động đồng bộ tài khoản & Ví Xu!',
              false,
            );
          }
        }
      },
    });
    this.dynamicRoot.add(walletPill.container);

    // 2. Sub-Toolbar (`topY + 80`): Slot Tabs + Paint Color Swatches + Fair-Play Mode Toggle
    const toolbarY = topY + 80;
    if (!this.lockSlotSelection) {
      const slotCount = settingsManager.isTouchControlsActive() ? 2 : 4;
      for (let i = 0; i < slotCount; i++) {
        const pIdx = i as PlayerIndex;
        const slotPal = getPaletteById(s.playerColors[i]);
        const isTarget = pIdx === this.targetSlot;
        const slotBtn = createArcadeButton(this.scene, {
          x: leftX + 58 + i * 78,
          y: toolbarY,
          width: 72,
          height: 34,
          lipHeight: 2,
          label: `XE ${i + 1}`,
          fontSize: 12.5,
          fillColor: isTarget ? slotPal.primary : UI_COLORS.cardAltBg,
          hoverColor: isTarget ? slotPal.primary : 0xdce2ea,
          textColor: isTarget ? '#FFFFFF' : UI_COLORS.inkDarkHex,
          onClick: () => {
            this.targetSlot = pIdx;
            this.selectedSkinId = settingsManager.getPlayerSkin(pIdx);
            this.statusMessage = '';
            this.rebuildDynamicContent();
          },
        });
        this.dynamicRoot.add(slotBtn.container);
      }
    } else {
      const onlineTag = this.scene.add
        .text(leftX + 24, toolbarY, '🌐 CHỌN CHIẾN XA ĐẤU ONLINE', {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '13.5px',
          fontStyle: '900',
          color: palette.primaryHex,
        })
        .setOrigin(0, 0.5);
      this.dynamicRoot.add(onlineTag);
    }

    // Dynamic Tank Color Swatches ("skin có thể đổi theo màu xe tank")
    const swatchStartX = leftX + 382;
    const colorLbl = this.scene.add
      .text(swatchStartX, toolbarY, 'MÀU XE:', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '12px',
        fontStyle: '900',
        color: UI_COLORS.inkMutedHex,
      })
      .setOrigin(0, 0.5);
    this.dynamicRoot.add(colorLbl);

    TANK_PALETTES.forEach((pal, idx) => {
      const sx = swatchStartX + 74 + idx * 32;
      const selected = pal.id === palette.id;
      const circle = this.scene.add
        .circle(sx, toolbarY, selected ? 12.5 : 10, pal.primary, 1)
        .setStrokeStyle(selected ? 3 : 1.8, selected ? UI_COLORS.inkDark : 0xffffff, 1)
        .setInteractive({ useHandCursor: true });

      circle.on('pointerdown', () => {
        audioManager.playUiClick(true);
        // Cycle or assign color cleanly without colliding with active slots
        while (settingsManager.getSettings().playerColors[this.targetSlot] !== pal.id) {
          const prev = settingsManager.getSettings().playerColors[this.targetSlot];
          const next = settingsManager.cyclePlayerColor(this.targetSlot, 1);
          if (next === prev || next === pal.id) break;
        }
        this.onUpdated?.();
        this.rebuildDynamicContent();
      });
      this.dynamicRoot.add(circle);
    });

    // Fair-Play Rule Toggle Pill (`Thực Chiến` vs `Thuần Ngoại Trang`)
    const fairBtn: ArcadeButtonHandle = createArcadeButton(this.scene, {
      x: px + panelW / 2 - 196,
      y: toolbarY,
      width: 348,
      height: 36,
      lipHeight: 2.5,
      label: s.skinStatsEnabled
        ? '⚡ LUẬT SKIN: THỰC CHIẾN (CÓ ĐẶC TÍNH)'
        : '🎨 LUẬT SKIN: THUẦN NGOẠI TRANG (100%)',
      fontSize: 12,
      fillColor: s.skinStatsEnabled ? 0xe8f5e9 : 0xe3f2fd,
      hoverColor: s.skinStatsEnabled ? 0xc8e6c9 : 0xbbdefb,
      textColor: s.skinStatsEnabled ? '#1B5E20' : '#0D47A1',
      onClick: () => {
        const next = settingsManager.toggleSkinStatsEnabled();
        this.setStatus(
          next
            ? 'Đã bật Chế độ THỰC CHIẾN: Mỗi Chiến Xa phát huy đúng ưu/nhược điểm riêng!'
            : 'Đã bật LUẬT CÔNG BẰNG (Thuần Ngoại Trang): Mọi xe giữ chỉ số chuẩn 100%, chỉ khoe Skin & hiệu ứng!',
          false,
        );
        this.onUpdated?.();
        this.rebuildDynamicContent();
      },
    });
    this.dynamicRoot.add(fairBtn.container);

    // 3. Left Interactive Showroom Stage (`width = 408`, `height = 528`)
    this.buildShowroomPanel(leftX + 218, topY + 374, 396, 524, palette.id, equippedOnSlot);

    // 4. Right 8-Skin Grid (`2 columns x 4 rows`)
    this.buildSkinGrid(leftX + 434, topY + 112, 664, 524, palette.id, equippedOnSlot);
  }

  private buildShowroomPanel(
    cx: number,
    cy: number,
    w: number,
    h: number,
    colorId: string,
    equippedOnSlot: TankSkinId,
  ): void {
    const desc = getTankSkinDescriptor(this.selectedSkinId);
    const palette = getPaletteById(colorId);
    const owned = skinWalletManager.isSkinOwned(desc.id);
    const isEquipped = equippedOnSlot === desc.id;
    const statsEnabled = settingsManager.getSettings().skinStatsEnabled;
    const activeSuit = PREVIEW_SUIT_CYCLE[this.previewSuitIdx] ?? null;

    const box = this.scene.add.graphics();
    box.fillStyle(0xf8fafc, 1);
    box.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    box.lineStyle(2.4, desc.rarityColor, 0.9);
    box.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);

    // Dark Cyber Turntable Stage (`height = 178`)
    const stageH = 166;
    const stageTop = cy - h / 2 + 12;
    const stageCenterY = stageTop + stageH / 2 - 4;
    this.showroomCenter = { x: cx, y: stageCenterY };

    box.fillStyle(0x121722, 1);
    box.fillRoundedRect(cx - w / 2 + 12, stageTop, w - 24, stageH, 11);
    box.lineStyle(1.6, palette.primary, 0.65);
    box.strokeRoundedRect(cx - w / 2 + 12, stageTop, w - 24, stageH, 11);
    box.lineStyle(1.2, 0x2c374b, 0.9);
    box.strokeCircle(cx, stageCenterY, 54);
    box.strokeCircle(cx, stageCenterY, 36);

    const rarityPill = this.scene.add
      .text(cx - w / 2 + 22, stageTop + 16, `★ ${desc.rarityLabel}`, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '11px',
        fontStyle: '900',
        color: '#FFFFFF',
        backgroundColor: desc.rarityHex,
        padding: { x: 8, y: 3 },
      })
      .setOrigin(0, 0.5);

    const suitLabel = activeSuit ? getSkillDescriptor(activeSuit).hudShort : 'CƠ BẢN';
    const suitToggleBtn = createArcadeButton(this.scene, {
      x: cx + w / 2 - 84,
      y: stageTop + 20,
      width: 136,
      height: 26,
      lipHeight: 2,
      label: `GIÁP: ${suitLabel} ↻`,
      fontSize: 10.5,
      fillColor: 0x263238,
      hoverColor: 0x37474f,
      textColor: '#80D8FF',
      onClick: () => {
        this.previewSuitIdx = (this.previewSuitIdx + 1) % PREVIEW_SUIT_CYCLE.length;
        this.rebuildDynamicContent();
      },
    });

    this.showroomAuraGfx = this.scene.add.graphics();
    const texKey = AssetFactory.ensureTankTexture(
      this.scene,
      colorId,
      desc.id,
      activeSuit,
      this.treadPhase,
      false,
    );
    const scaleMul = statsEnabled ? desc.stats.radiusScale : 1.0;
    this.showroomShadow = this.scene.add
      .image(cx + 4, stageCenterY + 6, 'tank_shadow')
      .setOrigin(0.44, 0.5)
      .setScale(1.85 * scaleMul);
    this.showroomSprite = this.scene.add
      .image(cx, stageCenterY, texKey)
      .setOrigin(0.44, 0.5)
      .setScale(1.85 * scaleMul);
    this.showroomOverlayGfx = this.scene.add.graphics();

    const nameTxt = this.scene.add
      .text(cx, stageTop + stageH + 20, desc.name.toUpperCase(), {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '20px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0.5, 0.5);

    const taglineTxt = this.scene.add
      .text(cx, stageTop + stageH + 46, desc.tagline, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '12px',
        fontStyle: '700',
        color: UI_COLORS.inkMutedHex,
        align: 'center',
        wordWrap: { width: w - 32 },
      })
      .setOrigin(0.5, 0.5);

    this.dynamicRoot.add([
      box,
      rarityPill,
      suitToggleBtn.container,
      this.showroomAuraGfx,
      this.showroomShadow,
      this.showroomSprite,
      this.showroomOverlayGfx,
      nameTxt,
      taglineTxt,
    ]);

    // 4 Visual Stat Comparison Bars (`y = cy - 4 .. cy + 80`)
    const barsStartY = cy - 4;
    const st = desc.stats;
    const statRows: Array<{ label: string; ratio: number; valText: string; col: number }> = [
      {
        label: 'TỐC ĐỘ & XOAY',
        ratio: statsEnabled
          ? Math.min(1, ((st.forwardSpeedScale + st.turnSpeedScale) * 0.5 - 0.65) / 0.65)
          : 0.54,
        valText: statsEnabled ? `${Math.round(st.forwardSpeedScale * 100)}%` : '100% (Chuẩn)',
        col: 0x00acc1,
      },
      {
        label: 'ĐỘ NHỎ GỌN',
        ratio: statsEnabled ? Math.min(1, Math.max(0.18, (1.35 - st.radiusScale) / 0.65)) : 0.54,
        valText: statsEnabled ? `Cỡ ${Math.round(st.radiusScale * 100)}%` : 'Cỡ 100%',
        col: 0x43a047,
      },
      {
        label: 'BĂNG ĐẠN & TỐC XẠ',
        ratio: statsEnabled ? Math.min(1, st.maxAmmo / 15) : 10 / 15,
        valText: statsEnabled ? `${st.maxAmmo} viên` : '10 viên',
        col: 0xfb8c00,
      },
      {
        label: 'GIÁP & KHÁNG LỰC',
        ratio: statsEnabled ? Math.min(1, st.armorHpScale / 1.5) : 1 / 1.5,
        valText: statsEnabled ? `${Math.round(st.armorHpScale * 100)}% HP` : '100% HP',
        col: 0xe53935,
      },
    ];

    const barGfx = this.scene.add.graphics();
    this.dynamicRoot.add(barGfx);

    statRows.forEach((row, rIdx) => {
      const ry = barsStartY + rIdx * 23;
      const lbl = this.scene.add
        .text(cx - w / 2 + 18, ry, row.label, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11px',
          fontStyle: '900',
          color: UI_COLORS.inkDarkHex,
        })
        .setOrigin(0, 0.5);

      const barX = cx - 32;
      const barW = 132;
      barGfx.fillStyle(0xe2e8f0, 1);
      barGfx.fillRoundedRect(barX, ry - 4.5, barW, 9, 4);
      barGfx.fillStyle(statsEnabled ? row.col : 0x78909c, 1);
      barGfx.fillRoundedRect(barX, ry - 4.5, Math.max(8, barW * row.ratio), 9, 4);

      const val = this.scene.add
        .text(cx + w / 2 - 16, ry, row.valText, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11px',
          fontStyle: '800',
          color: statsEnabled ? UI_COLORS.inkDarkHex : '#546E7A',
        })
        .setOrigin(1, 0.5);
      this.dynamicRoot.add([lbl, val]);
    });

    // Pros & Trade-offs Box
    const traitsY = cy + 94;
    const prosCopy = statsEnabled
      ? `✦ ${desc.pros[0]}\n✦ ${desc.pros[1]}`
      : '🎨 Đang bật LUẬT CÔNG BẰNG (Thuần Ngoại Trang):';
    const consCopy = statsEnabled
      ? `• Đánh đổi: ${desc.cons[0]} | ${desc.cons[1]}`
      : 'Mọi Chiến Xa đều giữ chỉ số chuẩn 100% — thoải mái chọn xe đẹp!';

    const prosTxt = this.scene.add
      .text(cx, traitsY + 12, prosCopy, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '11.5px',
        fontStyle: '800',
        color: statsEnabled ? '#1B5E20' : '#0D47A1',
        align: 'center',
        lineSpacing: 3,
        wordWrap: { width: w - 28 },
      })
      .setOrigin(0.5, 0.5);

    const consTxt = this.scene.add
      .text(cx, traitsY + 48, consCopy, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '11px',
        fontStyle: '700',
        color: statsEnabled ? '#B71C1C' : '#455A64',
        align: 'center',
        wordWrap: { width: w - 28 },
      })
      .setOrigin(0.5, 0.5);
    this.dynamicRoot.add([prosTxt, consTxt]);

    // Status feedback line
    if (this.statusMessage) {
      const stTxt = this.scene.add
        .text(cx, cy + h / 2 - 68, this.statusMessage, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11.5px',
          fontStyle: '800',
          color: this.statusIsError ? '#C62828' : '#1B5E20',
          align: 'center',
          wordWrap: { width: w - 24 },
        })
        .setOrigin(0.5, 0.5);
      this.dynamicRoot.add(stTxt);
    }

    // Primary Purchase / Equip Action Button (`cy + h / 2 - 30`)
    let ctaLabel: string;
    let ctaFill: number;
    let ctaHover: number;
    let ctaText = '#FFFFFF';

    if (owned) {
      if (isEquipped) {
        ctaLabel = `✓ ĐANG TRANG BỊ TRÊN XE ${this.targetSlot + 1}`;
        ctaFill = 0x2e7d32;
        ctaHover = 0x388e3c;
      } else {
        ctaLabel = `⚡ TRANG BỊ NGAY CHO XE ${this.targetSlot + 1}`;
        ctaFill = palette.primary;
        ctaHover = palette.primary;
      }
    } else if (!this.walletSnap.online) {
      ctaLabel = `📴 CẦN MẠNG ĐỂ MUA (${desc.priceXu.toLocaleString()} XU)`;
      ctaFill = 0x546e7a;
      ctaHover = 0x607d8b;
    } else if (!this.walletSnap.authenticated) {
      ctaLabel = `🔑 ĐĂNG NHẬP WINDHUB • ${desc.priceXu.toLocaleString()} XU`;
      ctaFill = 0x1565c0;
      ctaHover = 0x1976d2;
    } else if (this.walletSnap.balance < desc.priceXu) {
      ctaLabel = `🔒 THIẾU XU (${desc.priceXu.toLocaleString()} XU)`;
      ctaFill = 0x78909c;
      ctaHover = 0x90a4ae;
    } else {
      ctaLabel = this.purchasing
        ? '⏳ ĐANG XÁC THỰC VÍ WINDHUB…'
        : `◈ MỞ KHÓA VĨNH VIỄN — ${desc.priceXu.toLocaleString()} XU`;
      ctaFill = 0xffb300;
      ctaHover = 0xffca28;
      ctaText = '#18191B';
    }

    const ctaBtn = createArcadeButton(this.scene, {
      x: cx,
      y: cy + h / 2 - 30,
      width: w - 28,
      height: 44,
      lipHeight: 3.5,
      label: ctaLabel,
      fontSize: 13.5,
      fillColor: ctaFill,
      hoverColor: ctaHover,
      textColor: ctaText,
      onClick: () => {
        void this.handlePrimaryAction(desc.id);
      },
    });
    this.dynamicRoot.add(ctaBtn.container);
  }

  private buildSkinGrid(
    startX: number,
    startY: number,
    gridW: number,
    gridH: number,
    colorId: string,
    equippedOnSlot: TankSkinId,
  ): void {
    const cols = 2;
    const rows = 4;
    const gapX = 14;
    const gapY = 12;
    const cardW = (gridW - gapX) / cols;
    const cardH = (gridH - gapY * (rows - 1)) / rows;
    const palette = getPaletteById(colorId);
    const activeSuit = PREVIEW_SUIT_CYCLE[this.previewSuitIdx] ?? null;

    TANK_SKIN_DESCRIPTORS.forEach((desc, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = startX + col * (cardW + gapX) + cardW / 2;
      const cy = startY + row * (cardH + gapY) + cardH / 2;

      const isSelected = desc.id === this.selectedSkinId;
      const owned = skinWalletManager.isSkinOwned(desc.id);
      const isEquipped = desc.id === equippedOnSlot;

      const card = this.scene.add.container(cx, cy);
      const bg = this.scene.add.graphics();
      bg.fillStyle(isSelected ? 0xfffde7 : owned ? 0xffffff : 0xf1f5f9, 1);
      bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
      bg.fillStyle(desc.rarityColor, isSelected ? 1 : 0.85);
      bg.fillRoundedRect(-cardW / 2, -cardH / 2, 9, cardH, {
        tl: 12,
        bl: 12,
        tr: 0,
        br: 0,
      });
      bg.lineStyle(
        isSelected ? 3 : 1.8,
        isSelected ? palette.primary : UI_COLORS.inkDark,
        isSelected ? 1 : 0.75,
      );
      bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);

      // Interactive hit zone
      const zone = this.scene.add
        .zone(0, 0, cardW, cardH)
        .setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        audioManager.playUiClick(true);
        this.selectedSkinId = desc.id;
        this.statusMessage = '';
        if (owned && settingsManager.getPlayerSkin(this.targetSlot) !== desc.id) {
          settingsManager.setPlayerSkin(this.targetSlot, desc.id);
          this.onUpdated?.();
        }
        this.rebuildDynamicContent();
      });

      const iconBg = this.scene.add
        .circle(-cardW / 2 + 52, 0, 34, 0x161b26, 1)
        .setStrokeStyle(1.8, owned ? palette.primary : 0x607d8b, 0.85);
      const texKey = AssetFactory.ensureTankTexture(
        this.scene,
        colorId,
        desc.id,
        activeSuit,
        0,
        false,
      );
      const sp = this.scene.add
        .image(-cardW / 2 + 52, 0, texKey)
        .setOrigin(0.44, 0.5)
        .setScale(0.95)
        .setRotation(-Math.PI / 6);

      const title = this.scene.add
        .text(-cardW / 2 + 98, -36, desc.name, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '15px',
          fontStyle: '900',
          color: UI_COLORS.inkDarkHex,
        })
        .setOrigin(0, 0.5);

      const badgeTextCopy = isEquipped
        ? `✓ ĐANG DÙNG (XE ${this.targetSlot + 1})`
        : owned
          ? '✓ ĐÃ SỞ HỮU (OFFLINE OK)'
          : `◈ ${desc.priceXu.toLocaleString()} XU`;
      const badgeColor = isEquipped ? '#1B5E20' : owned ? '#0277BD' : '#E65100';

      const statusBadge = this.scene.add
        .text(-cardW / 2 + 98, -15, badgeTextCopy, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11.5px',
          fontStyle: '900',
          color: badgeColor,
        })
        .setOrigin(0, 0.5);

      const miniPros = this.scene.add
        .text(-cardW / 2 + 98, 10, `✦ ${desc.pros[0]}`, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11px',
          fontStyle: '700',
          color: '#2E7D32',
          wordWrap: { width: cardW - 108 },
        })
        .setOrigin(0, 0.5);

      const miniCons = this.scene.add
        .text(-cardW / 2 + 98, 38, `• ${desc.cons[0]}`, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '10.5px',
          fontStyle: '600',
          color: UI_COLORS.inkMutedHex,
          wordWrap: { width: cardW - 108 },
        })
        .setOrigin(0, 0.5);

      card.add([bg, iconBg, sp, title, statusBadge, miniPros, miniCons, zone]);
      this.dynamicRoot.add(card);
    });
  }

  private async handlePrimaryAction(skinId: TankSkinId): Promise<void> {
    if (this.purchasing || this.closed) return;
    const desc = getTankSkinDescriptor(skinId);

    if (skinWalletManager.isSkinOwned(skinId)) {
      settingsManager.setPlayerSkin(this.targetSlot, skinId);
      audioManager.playScorePoint();
      this.setStatus(`✓ Đã trang bị ${desc.name} cho XE ${this.targetSlot + 1}!`, false);
      this.onUpdated?.();
      this.rebuildDynamicContent();
      return;
    }

    if (!this.walletSnap.online) {
      audioManager.playUiClick(true);
      this.setStatus(
        '📴 Cần kết nối mạng & đăng nhập WindHub để mua Chiến Xa mới. Xe đã mua vẫn chơi Offline 100%!',
        true,
      );
      this.rebuildDynamicContent();
      return;
    }

    if (!this.walletSnap.authenticated) {
      const opened = skinWalletManager.openWindHubLogin();
      if (!opened) {
        this.setStatus(
          '🔑 Hãy mở game từ mục Giải Trí trên WindHub và đăng nhập tài khoản để dùng Ví Xu!',
          true,
          true,
        );
      }
      return;
    }

    this.purchasing = true;
    this.rebuildDynamicContent();
    try {
      const res = await skinWalletManager.purchaseSkin(desc.id, desc.name, desc.priceXu);
      this.purchasing = false;
      if (this.closed) return;

      if (res.success) {
        settingsManager.setPlayerSkin(this.targetSlot, desc.id);
        audioManager.playScorePoint();
        this.setStatus(res.message, false);
        this.onUpdated?.();
      } else {
        audioManager.playUiClick(true);
        this.setStatus(res.message, true);
      }
      this.rebuildDynamicContent();
    } catch {
      this.purchasing = false;
      if (!this.closed) {
        this.setStatus('Có lỗi khi giao dịch mở khóa Chiến Xa. Vui lòng thử lại!', true, true);
      }
    }
  }

  private setStatus(msg: string, isError: boolean, rebuild = false): void {
    this.statusMessage = msg;
    this.statusIsError = isError;
    if (rebuild && !this.closed) {
      this.rebuildDynamicContent();
    }
  }

  private stepShowroomAnimation(dt: number): void {
    if (
      this.closed ||
      !this.showroomSprite?.active ||
      !this.showroomAuraGfx ||
      !this.showroomOverlayGfx
    ) {
      return;
    }
    this.animClock += dt;
    this.treadTimer += dt;

    const s = settingsManager.getSettings();
    const colorId = s.playerColors[this.targetSlot] ?? 'red';
    const palette = getPaletteById(colorId);
    const skinMod = getTankSkinModule(this.selectedSkinId);
    const activeSuit = PREVIEW_SUIT_CYCLE[this.previewSuitIdx] ?? null;

    if (this.treadTimer >= 0.08) {
      this.treadTimer = 0;
      this.treadPhase = (this.treadPhase + 1) % 3;
      const key = AssetFactory.ensureTankTexture(
        this.scene,
        colorId,
        this.selectedSkinId,
        activeSuit,
        this.treadPhase,
        false,
      );
      this.showroomSprite.setTexture(key);
    }

    const angle = this.animClock * 0.78 - Math.PI / 5;
    const hoverY =
      skinMod.descriptor.hoverBobAmplitude > 0
        ? Math.sin(this.animClock * 5.8) * skinMod.descriptor.hoverBobAmplitude * 1.65
        : 0;
    const cx = this.showroomCenter.x;
    const cy = this.showroomCenter.y + hoverY;

    this.showroomSprite.setPosition(cx, cy).setRotation(angle);
    this.showroomShadow?.setPosition(cx + 4, this.showroomCenter.y + 6).setRotation(angle);

    this.showroomAuraGfx.clear();
    this.showroomOverlayGfx.clear();

    if (skinMod.drawLiveAura) {
      // Synthesize a curved showroom ribbon trail behind the rotating tank for Cyber Omega!
      const fakeTrail: Array<{ x: number; y: number; angle: number }> = [];
      for (let i = 0; i < 9; i++) {
        const backDist = i * 5.5;
        const backAng = angle - i * 0.07;
        fakeTrail.push({
          x: cx - Math.cos(backAng) * backDist,
          y: cy - Math.sin(backAng) * backDist,
          angle: backAng,
        });
      }

      skinMod.drawLiveAura({
        kinematics: {
          index: this.targetSlot,
          x: cx,
          y: cy,
          vx: Math.cos(angle) * 90,
          vy: Math.sin(angle) * 90,
          angle,
          radius: 24,
          alive: true,
        },
        palette,
        scaleRatio: 1.65,
        timeSec: this.animClock,
        auraGraphics: this.showroomAuraGfx,
        overlayGraphics: this.showroomOverlayGfx,
        trailHistory: fakeTrail,
      });
    }
  }

  close(silent = false): void {
    if (this.closed) return;
    this.closed = true;
    if (!silent) {
      audioManager.playUiClick(true);
    }
    this.unsubWallet?.();
    this.unsubWallet = null;
    window.removeEventListener('keydown', this.onKeyDownBound, true);
    this.scene.events.off(Phaser.Scenes.Events.UPDATE, this.onSceneUpdateBound);
    this.container.destroy(true);
    this.onCloseCallback();
  }
}
