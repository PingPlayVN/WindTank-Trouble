import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH, UI_COLORS } from '../../game/config/constants';
import { audioManager } from '../../game/managers/AudioManager';
import {
  DEFAULT_DAILY_REWARD_AMOUNTS,
  skinWalletManager,
  type WindHubWalletSnapshot,
} from '../../game/managers/SkinWalletManager';
import { animateModalOpen, createArcadeButton, createModalScrim } from './ArcadeWidgets';

export interface WindHubAccountModalOptions {
  onClose: () => void;
}

/**
 * In-game WindHub Account, 7-Day Daily Check-in & Shared Giftcode Modal (`TÀI KHOẢN & QUÀ TẶNG WINDHUB`),
 * crafted in WindTank's crisp tactile flat-vector Arcade UI while sharing 100% of Tài Xỉu's backend rules:
 * - Unauthenticated state: ONLY shows the Google Sign-In prompt (Giftcode input & Daily Check-in remain hidden
 *   until an account is signed in!).
 * - Authenticated state:
 *   1. Shows Google identity + live shared `◈ Xu` balance + Logout button.
 *   2. 7-Day Daily Login Streak (`+5K` -> `+100K Xu`): shared 1:1 with Tài Xỉu (if already claimed in Tài Xỉu
 *      today, cannot claim again in WindTank, and vice versa!).
 *   3. Giftcode Input Box (real positioned HTML `<input>` synced to Phaser design coordinates for effortless
 *      PC typing, `Ctrl+V` paste, and Mobile virtual keyboard!) + Redeemed Codes history shared 1:1 with Tài Xỉu!
 */
export class WindHubAccountModal {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly contentRoot: Phaser.GameObjects.Container;
  private readonly dynamicRoot: Phaser.GameObjects.Container;
  private readonly onCloseCallback: () => void;

  private walletSnap: WindHubWalletSnapshot;
  private unsubWallet: (() => void) | null = null;
  private htmlInput: HTMLInputElement | null = null;
  private inputDesignRect = { x: 0, y: 0, w: 0, h: 0, active: false };
  private syncInputPosRaf = 0;

  private codeValue = '';
  private claimingDaily = false;
  private submittingCode = false;
  private feedbackMsg = '';
  private feedbackIsError = false;
  private closed = false;

  private readonly onKeyDownBound: (e: KeyboardEvent) => void;
  private readonly onResizeBound: () => void;

  constructor(scene: Phaser.Scene, opts: WindHubAccountModalOptions) {
    this.scene = scene;
    this.onCloseCallback = opts.onClose;
    this.walletSnap = skinWalletManager.getSnapshot();

    this.container = scene.add.container(0, 0).setDepth(265);
    this.contentRoot = scene.add.container(0, 0);
    this.dynamicRoot = scene.add.container(0, 0);

    this.onKeyDownBound = (e: KeyboardEvent) => {
      if (this.closed) return;
      // Block game shortcuts (`Space`, `Enter`, `2/3/4`) while modal or HTML input is open!
      if (this.htmlInput && document.activeElement === this.htmlInput) {
        e.stopPropagation();
        if (e.code === 'Escape') {
          e.preventDefault();
          this.htmlInput.blur();
          this.close();
        } else if (e.code === 'Enter' || e.code === 'NumpadEnter') {
          e.preventDefault();
          void this.handleRedeemCode();
        }
        return;
      }
      if (e.code === 'Escape' && !e.repeat) {
        e.preventDefault();
        e.stopPropagation();
        this.close();
      }
    };

    this.onResizeBound = () => {
      this.positionHtmlInputOverlay();
    };

    window.addEventListener('keydown', this.onKeyDownBound, true);
    window.addEventListener('resize', this.onResizeBound);

    this.buildStaticShell();
    this.rebuildBody();

    this.unsubWallet = skinWalletManager.subscribe((snap) => {
      const prevAuth = this.walletSnap.authenticated;
      this.walletSnap = snap;
      if (!this.closed) {
        if (!prevAuth && snap.authenticated) {
          this.feedbackMsg = '';
        }
        this.rebuildBody();
      }
    });
  }

  private buildStaticShell(): void {
    const scrim = createModalScrim(this.scene, 0x0d1016, 0.72);
    scrim.on('pointerdown', () => {
      // Keep open unless explicit ĐÓNG or ESC so typing on mobile doesn't accidentally dismiss
    });

    const panelW = 1040;
    const panelH = 612;
    const px = DESIGN_WIDTH / 2;
    const py = DESIGN_HEIGHT / 2;
    const topY = py - panelH / 2;

    const panel = this.scene.add.graphics();
    panel.fillStyle(0x0b0d12, 0.36);
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
      .text(px - panelW / 2 + 24, topY + 27, '🎁 TRUNG TÂM TÀI KHOẢN WINDHUB • ĐIỂM DANH & GIFTCODE', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '20px',
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

  private rebuildBody(): void {
    this.dynamicRoot.removeAll(true);

    const panelW = 1040;
    const panelH = 612;
    const px = DESIGN_WIDTH / 2;
    const py = DESIGN_HEIGHT / 2;
    const leftX = px - panelW / 2;
    const topY = py - panelH / 2;

    if (!this.walletSnap.authenticated) {
      this.destroyHtmlInput();
      this.buildUnauthenticatedGate(px, topY + 332, 760, 468);
      return;
    }

    // 1. Top Account Identity & Shared Xu Balance Strip (`topY + 84`)
    const stripY = topY + 84;
    const stripGfx = this.scene.add.graphics();
    stripGfx.fillStyle(0xf8fafc, 1);
    stripGfx.fillRoundedRect(leftX + 22, stripY - 22, panelW - 44, 44, 10);
    stripGfx.lineStyle(2, UI_COLORS.inkDark, 0.85);
    stripGfx.strokeRoundedRect(leftX + 22, stripY - 22, panelW - 44, 44, 10);

    const identityStr = this.walletSnap.email
      ? `${this.walletSnap.displayName}  (${this.walletSnap.email})`
      : this.walletSnap.displayName;
    const accTxt = this.scene.add
      .text(leftX + 38, stripY, `☁ TÀI KHOẢN GOOGLE: ${identityStr.slice(0, 48)}`, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '13.5px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0, 0.5);

    const balPill = this.scene.add
      .text(
        px + panelW / 2 - 178,
        stripY,
        `◈ VÍ XU CHUNG: ${this.walletSnap.balance.toLocaleString()} XU`,
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '13.5px',
          fontStyle: '900',
          color: '#18191B',
          backgroundColor: '#FFD54F',
          padding: { x: 12, y: 5 },
        },
      )
      .setOrigin(1, 0.5);

    const logoutBtn = createArcadeButton(this.scene, {
      x: px + panelW / 2 - 88,
      y: stripY,
      width: 132,
      height: 32,
      lipHeight: 2,
      label: 'ĐĂNG XUẤT',
      fontSize: 12,
      fillColor: 0xffebee,
      hoverColor: 0xffcdd2,
      textColor: '#C62828',
      onClick: () => {
        void this.handleLogout();
      },
    });

    this.dynamicRoot.add([stripGfx, accTxt, balPill, logoutBtn.container]);

    // 2. Two Symmetrical Arcade Columns (`height = 468`)
    const cardsCenterY = topY + 356;
    const cardW = 488;
    const cardH = 468;
    this.buildDailyCheckInCard(leftX + 22 + cardW / 2, cardsCenterY, cardW, cardH);
    this.buildGiftCodeCard(px + panelW / 2 - 22 - cardW / 2, cardsCenterY, cardW, cardH);
  }

  /**
   * Shown ONLY when not logged in — Giftcode input & Daily Check-in stay hidden until authenticated!
   */
  private buildUnauthenticatedGate(cx: number, cy: number, w: number, h: number): void {
    const g = this.scene.add.graphics();
    g.fillStyle(0xf8fafc, 1);
    g.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 16);
    g.lineStyle(2.8, UI_COLORS.inkDark, 1);
    g.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 16);

    const badge = this.scene.add
      .text(cx, cy - h / 2 + 42, 'WINDHUB UNIFIED ACCOUNT', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '11.5px',
        fontStyle: '900',
        color: '#0D47A1',
        backgroundColor: '#E3F2FD',
        padding: { x: 12, y: 4 },
      })
      .setOrigin(0.5, 0.5);

    const heading = this.scene.add
      .text(cx, cy - h / 2 + 86, 'ĐĂNG NHẬP GOOGLE ĐỂ MỞ Ô GIFTCODE & ĐIỂM DANH', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '21px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
        align: 'center',
      })
      .setOrigin(0.5, 0.5);

    const sub = this.scene.add
      .text(
        cx,
        cy - h / 2 + 124,
        'Liên kết trực tiếp với tài khoản Tài Xỉu & Hệ sinh thái Giải Trí WindHub — dùng chung Ví Xu 100%.',
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '13.5px',
          fontStyle: '700',
          color: UI_COLORS.inkMutedHex,
          align: 'center',
          wordWrap: { width: w - 64 },
        },
      )
      .setOrigin(0.5, 0.5);

    this.dynamicRoot.add([g, badge, heading, sub]);

    const perks = [
      {
        icon: '🎟️',
        title: 'Ô Nhập Giftcode Dùng Chung Toàn Hệ Thống',
        desc: 'Chỉ hiện sau khi đăng nhập • Mã quà tặng đồng bộ chung với Tài Xỉu (mỗi mã nhập 1 lần duy nhất).',
      },
      {
        icon: '📅',
        title: 'Lộc Đầu Ngày 7 Ngày Liên Tiếp (+5K → +100K Xu)',
        desc: 'Điểm danh 1 lần/ngày dùng chung giữa Tài Xỉu & WindTank — đã nhận bên Tài Xỉu sẽ tự khóa trong ngày.',
      },
      {
        icon: '🛡️',
        title: 'Đồng Bộ Chiến Xa Qua Google & Chơi Offline 100%',
        desc: 'Mọi Skin xe tăng mua bằng Xu đều gắn vào tài khoản Google và giữ nguyên khi mất mạng.',
      },
    ];

    perks.forEach((p, idx) => {
      const py = cy - 42 + idx * 72;
      const box = this.scene.add.graphics();
      box.fillStyle(0xffffff, 1);
      box.fillRoundedRect(cx - w / 2 + 36, py - 28, w - 72, 58, 10);
      box.lineStyle(1.8, 0xcfd8dc, 1);
      box.strokeRoundedRect(cx - w / 2 + 36, py - 28, w - 72, 58, 10);

      const ic = this.scene.add
        .text(cx - w / 2 + 64, py, p.icon, { fontSize: '22px' })
        .setOrigin(0.5, 0.5);
      const tl = this.scene.add
        .text(cx - w / 2 + 94, py - 10, p.title, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '13.5px',
          fontStyle: '900',
          color: UI_COLORS.inkDarkHex,
        })
        .setOrigin(0, 0.5);
      const ds = this.scene.add
        .text(cx - w / 2 + 94, py + 11, p.desc, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11.5px',
          fontStyle: '700',
          color: UI_COLORS.inkMutedHex,
        })
        .setOrigin(0, 0.5);
      this.dynamicRoot.add([box, ic, tl, ds]);
    });

    if (this.feedbackMsg) {
      const fb = this.scene.add
        .text(cx, cy + h / 2 - 86, this.feedbackMsg, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '12.5px',
          fontStyle: '800',
          color: this.feedbackIsError ? '#C62828' : '#1565C0',
          align: 'center',
          wordWrap: { width: w - 64 },
        })
        .setOrigin(0.5, 0.5);
      this.dynamicRoot.add(fb);
    }

    const loginBtn = createArcadeButton(this.scene, {
      x: cx,
      y: cy + h / 2 - 40,
      width: 420,
      height: 48,
      lipHeight: 4,
      label: this.walletSnap.online
        ? '🔑 ĐĂNG NHẬP BẰNG GOOGLE (WINDHUB)'
        : '📴 CẦN MẠNG ĐỂ ĐĂNG NHẬP GOOGLE',
      fontSize: 15,
      fillColor: this.walletSnap.online ? 0x1565c0 : 0x607d8b,
      hoverColor: this.walletSnap.online ? 0x1976d2 : 0x78909c,
      textColor: '#FFFFFF',
      onClick: () => {
        if (!this.walletSnap.online) {
          this.setFeedback('📴 Vui lòng kết nối mạng để đăng nhập tài khoản Google!', true);
          return;
        }
        const ok = skinWalletManager.openWindHubLogin();
        if (ok) {
          this.setFeedback('🔑 Đang mở cửa sổ chọn tài khoản Google…', false);
        } else {
          this.setFeedback(
            'Hãy mở WindTank từ mục Giải Trí trên WindHub để liên kết đăng nhập Google trực tiếp!',
            true,
          );
        }
      },
    });
    this.dynamicRoot.add(loginBtn.container);
  }

  /**
   * Left Card: 7-Day Daily Login Streak (100% shared with Tài Xỉu!)
   */
  private buildDailyCheckInCard(cx: number, cy: number, w: number, h: number): void {
    const daily = this.walletSnap.dailyReward;
    const amounts = daily?.rewardAmounts ?? DEFAULT_DAILY_REWARD_AMOUNTS;
    const currentStreak = daily?.currentStreak ?? 0;
    const claimedToday = Boolean(daily?.claimedToday);
    const canClaimToday = daily ? Boolean(daily.canClaimToday) : !claimedToday;
    const nextStreakDay = daily?.nextStreakDay ?? 1;
    const nextRewardAmount = daily?.nextRewardAmount ?? amounts[nextStreakDay - 1] ?? 5000;

    const card = this.scene.add.graphics();
    card.fillStyle(0xf8fafc, 1);
    card.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    card.lineStyle(2.5, UI_COLORS.inkDark, 1);
    card.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);

    const headerTag = this.scene.add
      .text(cx - w / 2 + 20, cy - h / 2 + 24, 'LỘC ĐẦU NGÀY // CHUNG VỚI TÀI XỈU', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '10.5px',
        fontStyle: '900',
        color: '#E65100',
      })
      .setOrigin(0, 0.5);

    const headerTitle = this.scene.add
      .text(cx - w / 2 + 20, cy - h / 2 + 48, '📅 ĐIỂM DANH 7 NGÀY NHẬN XU', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '18px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0, 0.5);

    // Streak progress bar
    const progY = cy - h / 2 + 88;
    const progW = w - 40;
    card.fillStyle(0xe2e8f0, 1);
    card.fillRoundedRect(cx - progW / 2, progY, progW, 12, 6);
    const ratio = Math.min(1, Math.max(0, currentStreak / 7));
    if (ratio > 0) {
      card.fillStyle(0xffb300, 1);
      card.fillRoundedRect(cx - progW / 2, progY, Math.max(14, progW * ratio), 12, 6);
    }

    const streakLbl = this.scene.add
      .text(cx - w / 2 + 20, progY - 12, `Chuỗi điểm danh liên tiếp: ${currentStreak} / 7 ngày`, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '12px',
        fontStyle: '800',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0, 0.5);

    this.dynamicRoot.add([card, headerTag, headerTitle, streakLbl]);

    // 7 Day Tiles: Row 1 (Days 1..4), Row 2 (Days 5..7, Day 7 wide jackpot!)
    const gridLeft = cx - w / 2 + 20;
    const gap = 10;
    const row1Y = cy - h / 2 + 162;
    const row2Y = cy - h / 2 + 266;
    const tileH = 90;
    const tileW4 = (w - 40 - gap * 3) / 4;
    const tileW3 = (w - 40 - gap * 2) / 3;

    amounts.forEach((amt, idx) => {
      const dayNum = idx + 1;
      const isPastClaimed = (dayNum <= currentStreak && claimedToday) || dayNum < nextStreakDay;
      const isTodayTarget = dayNum === nextStreakDay && canClaimToday;

      const inRow1 = idx < 4;
      const tw = inRow1 ? tileW4 : tileW3;
      const col = inRow1 ? idx : idx - 4;
      const tx = gridLeft + col * (tw + gap) + tw / 2;
      const ty = inRow1 ? row1Y : row2Y;

      const tg = this.scene.add.graphics();
      const fill = isTodayTarget ? 0xfff8e1 : isPastClaimed ? 0xe8f5e9 : 0xffffff;
      const stroke = isTodayTarget ? 0xf57f17 : isPastClaimed ? 0x2e7d32 : 0xb0bec5;
      tg.fillStyle(fill, 1);
      tg.fillRoundedRect(tx - tw / 2, ty - tileH / 2, tw, tileH, 10);
      tg.lineStyle(isTodayTarget ? 3 : 2, stroke, 1);
      tg.strokeRoundedRect(tx - tw / 2, ty - tileH / 2, tw, tileH, 10);

      const dTxt = this.scene.add
        .text(
          tx,
          ty - 26,
          isTodayTarget ? `★ NGÀY ${dayNum}` : `NGÀY ${dayNum}`,
          {
            fontFamily: "'Segoe UI', 'Inter', sans-serif",
            fontSize: '11.5px',
            fontStyle: '900',
            color: isTodayTarget ? '#E65100' : isPastClaimed ? '#1B5E20' : UI_COLORS.inkMutedHex,
          },
        )
        .setOrigin(0.5, 0.5);

      const iconStr = isPastClaimed ? '✓ ĐÃ NHẬN' : isTodayTarget ? '🎁 HÔM NAY' : '🔒 CHỜ';
      const stTxt = this.scene.add
        .text(tx, ty, iconStr, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11.5px',
          fontStyle: '900',
          color: isPastClaimed ? '#2E7D32' : isTodayTarget ? '#D84315' : '#90A4AE',
        })
        .setOrigin(0.5, 0.5);

      const amtTxt = this.scene.add
        .text(tx, ty + 25, `+${amt >= 1000 ? `${amt / 1000}K` : amt} XU`, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '13.5px',
          fontStyle: '900',
          color: isPastClaimed ? '#1B5E20' : '#18191B',
        })
        .setOrigin(0.5, 0.5);

      this.dynamicRoot.add([tg, dTxt, stTxt, amtTxt]);
    });

    const ruleNote = this.scene.add
      .text(
        cx,
        cy + h / 2 - 92,
        '• Đồng bộ trực tiếp với Tài Xỉu WindHub (múi giờ Việt Nam).\n• Đã điểm danh bên Tài Xỉu hôm nay thì bên Xe Tank sẽ không nhận lại.',
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11px',
          fontStyle: '700',
          color: UI_COLORS.inkMutedHex,
          align: 'center',
          lineSpacing: 3,
        },
      )
      .setOrigin(0.5, 0.5);

    const claimBtn = createArcadeButton(this.scene, {
      x: cx,
      y: cy + h / 2 - 36,
      width: w - 40,
      height: 46,
      lipHeight: 3.5,
      label: canClaimToday
        ? this.claimingDaily
          ? '⏳ ĐANG NHẬN XU ĐIỂM DANH…'
          : `🎁 ĐIỂM DANH NHẬN +${nextRewardAmount.toLocaleString()} XU`
        : '✓ ĐÃ NHẬN THƯỞNG HÔM NAY (CHUNG TÀI XỈU)',
      fontSize: 13.5,
      fillColor: canClaimToday ? 0xffb300 : 0xe8f5e9,
      hoverColor: canClaimToday ? 0xffca28 : 0xe8f5e9,
      textColor: canClaimToday ? '#18191B' : '#1B5E20',
      onClick: () => {
        if (!canClaimToday || this.claimingDaily) return;
        void this.handleClaimDaily();
      },
    });
    if (!canClaimToday) {
      claimBtn.setEnabled(false);
      // Keep crisp readable emerald label even when disabled
      claimBtn.setFill(0xe8f5e9, 0xe8f5e9, '#1B5E20');
      claimBtn.labelText.setAlpha(1);
    }

    this.dynamicRoot.add([ruleNote, claimBtn.container]);
  }

  /**
   * Right Card: Shared Giftcode Redemption Input + Used Codes History (100% shared with Tài Xỉu!)
   */
  private buildGiftCodeCard(cx: number, cy: number, w: number, h: number): void {
    const card = this.scene.add.graphics();
    card.fillStyle(0xf8fafc, 1);
    card.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    card.lineStyle(2.5, UI_COLORS.inkDark, 1);
    card.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);

    const headerTag = this.scene.add
      .text(cx - w / 2 + 20, cy - h / 2 + 24, 'QUÀ TẶNG TRI ÂN // MÃ DÙNG CHUNG TÀI XỈU', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '10.5px',
        fontStyle: '900',
        color: '#0D47A1',
      })
      .setOrigin(0, 0.5);

    const headerTitle = this.scene.add
      .text(cx - w / 2 + 20, cy - h / 2 + 48, '🎟️ Ô NHẬP GIFTCODE NHẬN XU', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '18px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0, 0.5);

    const inputLabel = this.scene.add
      .text(cx - w / 2 + 20, cy - h / 2 + 86, 'NHẬP MÃ GIFTCODE CỦA BẠN:', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '11.5px',
        fontStyle: '900',
        color: UI_COLORS.inkMutedHex,
      })
      .setOrigin(0, 0.5);

    // Visual frame for the HTML Input box (`y = cy - h / 2 + 126`)
    const inputW = w - 40;
    const inputH = 48;
    const inputX = cx - inputW / 2;
    const inputY = cy - h / 2 + 104;

    card.fillStyle(0xffffff, 1);
    card.fillRoundedRect(inputX, inputY, inputW, inputH, 10);
    card.lineStyle(2.6, UI_COLORS.inkDark, 1);
    card.strokeRoundedRect(inputX, inputY, inputW, inputH, 10);

    this.dynamicRoot.add([card, headerTag, headerTitle, inputLabel]);

    // Mount / reposition real HTML `<input>` right inside `[inputX, inputY, inputW, inputH]`
    this.inputDesignRect = {
      x: inputX + 4,
      y: inputY + 4,
      w: inputW - 8,
      h: inputH - 8,
      active: true,
    };
    this.ensureHtmlInputMounted();

    // Action row (`NHẬN XU THƯỞNG` + `XÓA MÃ`)
    const btnY = inputY + inputH + 34;
    const submitBtn = createArcadeButton(this.scene, {
      x: cx - 54,
      y: btnY,
      width: inputW - 108,
      height: 44,
      lipHeight: 3.5,
      label: this.submittingCode ? '⏳ ĐANG KIỂM TRA GIFTCODE…' : '✦ NHẬP CODE NHẬN XU NGAY',
      fontSize: 13.5,
      fillColor: 0x2e7d32,
      hoverColor: 0x388e3c,
      textColor: '#FFFFFF',
      onClick: () => {
        void this.handleRedeemCode();
      },
    });

    const clearBtn = createArcadeButton(this.scene, {
      x: cx + inputW / 2 - 46,
      y: btnY,
      width: 92,
      height: 44,
      lipHeight: 3.5,
      label: 'XÓA MÃ',
      fontSize: 12.5,
      fillColor: UI_COLORS.cardAltBg,
      hoverColor: 0xdce2ea,
      textColor: UI_COLORS.inkDarkHex,
      onClick: () => {
        this.codeValue = '';
        if (this.htmlInput) {
          this.htmlInput.value = '';
          this.htmlInput.focus();
        }
      },
    });
    this.dynamicRoot.add([submitBtn.container, clearBtn.container]);

    // Feedback Status Banner (`btnY + 48`)
    if (this.feedbackMsg) {
      const fbBox = this.scene.add.graphics();
      fbBox.fillStyle(this.feedbackIsError ? 0xffebee : 0xe8f5e9, 1);
      fbBox.fillRoundedRect(cx - inputW / 2, btnY + 32, inputW, 44, 8);
      fbBox.lineStyle(1.8, this.feedbackIsError ? 0xc62828 : 0x2e7d32, 0.9);
      fbBox.strokeRoundedRect(cx - inputW / 2, btnY + 32, inputW, 44, 8);

      const fbTxt = this.scene.add
        .text(cx, btnY + 54, this.feedbackMsg, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11.5px',
          fontStyle: '800',
          color: this.feedbackIsError ? '#B71C1C' : '#1B5E20',
          align: 'center',
          wordWrap: { width: inputW - 20 },
        })
        .setOrigin(0.5, 0.5);
      this.dynamicRoot.add([fbBox, fbTxt]);
    }

    // Shared Rules Box
    const rulesTop = cy + 44;
    const ruleBox = this.scene.add.graphics();
    ruleBox.fillStyle(0xffffff, 1);
    ruleBox.fillRoundedRect(cx - inputW / 2, rulesTop, inputW, 74, 10);
    ruleBox.lineStyle(1.6, 0xcfd8dc, 1);
    ruleBox.strokeRoundedRect(cx - inputW / 2, rulesTop, inputW, 74, 10);

    const ruleCopy = this.scene.add
      .text(
        cx - inputW / 2 + 14,
        rulesTop + 37,
        '🛡️ Quy tắc Giftcode:\n• Dùng chung 100% với Tài Xỉu WindHub (mỗi tài khoản nhập 1 lần/mã).\n• Mã đã nhập bên Tài Xỉu sẽ không thể nhập lại bên Xe Tank và ngược lại.',
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11px',
          fontStyle: '700',
          color: UI_COLORS.inkMutedHex,
          lineSpacing: 3,
          wordWrap: { width: inputW - 24 },
        },
      )
      .setOrigin(0, 0.5);
    this.dynamicRoot.add([ruleBox, ruleCopy]);

    // Redeemed Giftcodes History (`Mã bạn đã sử dụng`)
    const used = this.walletSnap.redeemedGiftcodes;
    const usedTitle = this.scene.add
      .text(
        cx - inputW / 2,
        rulesTop + 94,
        used.length > 0
          ? `MÃ BẠN ĐÃ SỬ DỤNG (${used.length}):`
          : 'MÃ BẠN ĐÃ SỬ DỤNG: Chưa nhập mã nào',
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11px',
          fontStyle: '900',
          color: UI_COLORS.inkDarkHex,
        },
      )
      .setOrigin(0, 0.5);
    this.dynamicRoot.add(usedTitle);

    if (used.length > 0) {
      const shown = used.slice(-8);
      const badgeStr = shown.map((c) => `[✓ ${c}]`).join('   ');
      const badgesTxt = this.scene.add
        .text(cx - inputW / 2, rulesTop + 122, badgeStr, {
          fontFamily: "'Consolas', 'Courier New', monospace",
          fontSize: '12px',
          fontStyle: '800',
          color: '#1B5E20',
          wordWrap: { width: inputW },
          lineSpacing: 4,
        })
        .setOrigin(0, 0);
      this.dynamicRoot.add(badgesTxt);
    }
  }

  private ensureHtmlInputMounted(): void {
    if (typeof document === 'undefined' || this.closed) return;
    if (!this.htmlInput) {
      const inp = document.createElement('input');
      inp.type = 'text';
      inp.id = 'windtank-giftcode-input';
      inp.placeholder = 'VD: TANTHU, WINDHUB...';
      inp.autocomplete = 'off';
      inp.autocapitalize = 'characters';
      inp.spellcheck = false;
      inp.maxLength = 36;
      inp.value = this.codeValue;
      Object.assign(inp.style, {
        position: 'fixed',
        zIndex: '10020',
        border: 'none',
        outline: 'none',
        background: 'transparent',
        color: '#18191B',
        fontFamily: "'Consolas', 'Segoe UI', monospace",
        fontWeight: '900',
        letterSpacing: '0.06em',
        padding: '0 12px',
        boxSizing: 'border-box',
        textTransform: 'uppercase',
      });

      inp.addEventListener('input', () => {
        const up = inp.value.toUpperCase();
        if (inp.value !== up) inp.value = up;
        this.codeValue = up;
      });
      for (const evt of ['keydown', 'keyup', 'keypress', 'pointerdown', 'mousedown', 'touchstart']) {
        inp.addEventListener(evt, (e) => e.stopPropagation());
      }

      document.body.appendChild(inp);
      this.htmlInput = inp;
    }

    this.htmlInput.disabled = this.submittingCode;
    this.htmlInput.value = this.codeValue;
    this.positionHtmlInputOverlay();

    // Keep aligned during the 210ms modal open pop-in animation
    cancelAnimationFrame(this.syncInputPosRaf);
    let frames = 0;
    const tick = () => {
      if (this.closed || !this.htmlInput) return;
      this.positionHtmlInputOverlay();
      if (++frames < 22) {
        this.syncInputPosRaf = requestAnimationFrame(tick);
      }
    };
    this.syncInputPosRaf = requestAnimationFrame(tick);
  }

  private positionHtmlInputOverlay(): void {
    if (!this.htmlInput || !this.inputDesignRect.active) return;
    const canvas = this.scene.game.canvas;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const cam = this.scene.cameras.main;
    const viewW = cam.width || DESIGN_WIDTH;
    const viewH = cam.height || DESIGN_HEIGHT;
    const scaleX = rect.width / viewW;
    const scaleY = rect.height / viewH;

    // Account for camera scrollX on widescreen mobile viewports!
    const localX = (this.inputDesignRect.x - cam.scrollX) * scaleX;
    const localY = (this.inputDesignRect.y - cam.scrollY) * scaleY;
    const pxW = this.inputDesignRect.w * scaleX;
    const pxH = this.inputDesignRect.h * scaleY;

    this.htmlInput.style.left = `${Math.round(rect.left + localX)}px`;
    this.htmlInput.style.top = `${Math.round(rect.top + localY)}px`;
    this.htmlInput.style.width = `${Math.max(80, Math.round(pxW))}px`;
    this.htmlInput.style.height = `${Math.max(24, Math.round(pxH))}px`;
    this.htmlInput.style.fontSize = `${Math.max(13, Math.min(18, Math.round(16 * scaleY)))}px`;
  }

  private destroyHtmlInput(): void {
    cancelAnimationFrame(this.syncInputPosRaf);
    this.inputDesignRect.active = false;
    if (this.htmlInput) {
      this.htmlInput.remove();
      this.htmlInput = null;
    }
  }

  private setFeedback(msg: string, isError: boolean): void {
    this.feedbackMsg = msg;
    this.feedbackIsError = isError;
    if (!this.closed) {
      this.rebuildBody();
    }
  }

  private async handleClaimDaily(): Promise<void> {
    if (this.claimingDaily || this.closed) return;
    this.claimingDaily = true;
    this.rebuildBody();
    try {
      const res = await skinWalletManager.claimDailyReward();
      this.claimingDaily = false;
      if (this.closed) return;

      if (res.success) {
        audioManager.playScorePoint();
        const amt = res.amount ?? res.rewardAmount ?? 0;
        this.setFeedback(
          `🎉 Điểm danh thành công! Đã cộng +${amt.toLocaleString()} Xu vào Ví chung WindHub!`,
          false,
        );
      } else {
        audioManager.playUiClick(true);
        this.setFeedback(
          res.message || 'Hôm nay bạn đã điểm danh nhận thưởng rồi!',
          true,
        );
      }
    } catch {
      this.claimingDaily = false;
      if (!this.closed) {
        this.setFeedback('Lỗi kết nối khi điểm danh nhận thưởng. Vui lòng thử lại!', true);
      }
    }
  }

  private async handleRedeemCode(): Promise<void> {
    if (this.submittingCode || this.closed) return;
    const raw = (this.htmlInput?.value ?? this.codeValue).trim().toUpperCase();
    this.codeValue = raw;
    if (!raw) {
      audioManager.playUiClick(true);
      this.setFeedback('⚠ Vui lòng nhập mã Giftcode vào ô trước khi bấm Nhận Xu!', true);
      return;
    }

    this.submittingCode = true;
    this.rebuildBody();
    try {
      const res = await skinWalletManager.redeemGiftCode(raw);
      this.submittingCode = false;
      if (this.closed) return;

      if (res.success) {
        this.codeValue = '';
        if (this.htmlInput) this.htmlInput.value = '';
        audioManager.playScorePoint();
        this.setFeedback(
          res.message ||
            `🎉 Nhập mã ${raw} thành công! Đã cộng +${(res.rewardAmount ?? 0).toLocaleString()} Xu!`,
          false,
        );
      } else {
        audioManager.playUiClick(true);
        this.setFeedback(
          res.message || 'Mã Giftcode không tồn tại, đã hết hạn hoặc bạn đã nhập bên Tài Xỉu rồi!',
          true,
        );
      }
    } catch {
      this.submittingCode = false;
      if (!this.closed) {
        this.setFeedback('Có lỗi khi kiểm tra mã Giftcode. Vui lòng thử lại!', true);
      }
    }
  }

  private async handleLogout(): Promise<void> {
    audioManager.playUiClick(true);
    this.codeValue = '';
    this.feedbackMsg = 'Đã đăng xuất tài khoản Google khỏi phiên hiện tại.';
    this.feedbackIsError = false;
    await skinWalletManager.logoutAccount();
    if (!this.closed) {
      this.rebuildBody();
    }
  }

  close(silent = false): void {
    if (this.closed) return;
    this.closed = true;
    if (!silent) {
      audioManager.playUiClick(true);
    }
    this.destroyHtmlInput();
    this.unsubWallet?.();
    this.unsubWallet = null;
    window.removeEventListener('keydown', this.onKeyDownBound, true);
    window.removeEventListener('resize', this.onResizeBound);
    this.container.destroy(true);
    this.onCloseCallback();
  }
}
