import Phaser from 'phaser';
import { AssetFactory } from '../art/AssetFactory';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  getAIDifficultyDescriptor,
  getPaletteById,
  getTankSkinDescriptor,
  UI_COLORS,
} from '../config/constants';
import { audioManager } from '../managers/AudioManager';
import { mobileOrientationManager } from '../managers/MobileOrientationManager';
import { settingsManager } from '../managers/SettingsManager';
import {
  skinWalletManager,
  type WindHubWalletSnapshot,
} from '../managers/SkinWalletManager';
import { networkStatus } from '../network/networkStatus';
import type { PlayerIndex } from '../types/gameTypes';
import {
  animateStaggeredEntrance,
  createArcadeButton,
  createLogoHeader,
  drawMazeBackdrop,
  type ArcadeButtonHandle,
} from '../../ui/components/ArcadeWidgets';
import { createMobileFullscreenControls } from '../../ui/components/FullscreenPromptWidget';
import { SettingsModal } from '../../ui/components/SettingsModal';
import { SkillGuideModal } from '../../ui/components/SkillGuideModal';
import { TankGarageModal } from '../../ui/components/TankGarageModal';
import { WindHubAccountModal } from '../../ui/components/WindHubAccountModal';

export class MenuScene extends Phaser.Scene {
  private countButtons: Map<2 | 3 | 4, ArcadeButtonHandle> = new Map();
  private mobileSoloAiBtn: ArcadeButtonHandle | null = null;
  private mobileDualHumanBtn: ArcadeButtonHandle | null = null;
  private onlineBtn!: ArcadeButtonHandle;
  private accountHudBtn!: ArcadeButtonHandle;
  private giftCodeHudBtn!: ArcadeButtonHandle;
  private offlineBadgeText!: Phaser.GameObjects.Text;
  private unsubNetwork: (() => void) | null = null;
  private unsubWallet: (() => void) | null = null;
  private previewContainer!: Phaser.GameObjects.Container;
  private activeModal: SettingsModal | null = null;
  private activeSkillModal: SkillGuideModal | null = null;
  private activeGarageModal: TankGarageModal | null = null;
  private activeAccountModal: WindHubAccountModal | null = null;
  private onKeyDownBound!: (e: KeyboardEvent) => void;

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.countButtons.clear();
    this.mobileSoloAiBtn = null;
    this.mobileDualHumanBtn = null;
    this.activeModal = null;
    this.activeSkillModal = null;
    this.activeGarageModal = null;
    this.activeAccountModal = null;
    mobileOrientationManager.syncLayout();
    const isMobile = settingsManager.isTouchControlsActive();
    if (isMobile) {
      const cur = settingsManager.getSettings();
      if (cur.playerCount > 2) {
        settingsManager.setPlayerCount(2);
      }
      // On Mobile, ensure Tank 1 is ALWAYS controlled by the human player (never stranded as AI!)
      if (cur.playerIsAI[0]) {
        settingsManager.setPlayerIsAI(0, false);
        settingsManager.setPlayerIsAI(1, true);
      }
    }

    this.cameras.main.fadeIn(220, 238, 238, 236);
    drawMazeBackdrop(this, DESIGN_WIDTH, DESIGN_HEIGHT);
    const fsControls = createMobileFullscreenControls(this, {
      buttonY: 40,
      showRecommendationBanner: true,
      bannerY: 40,
    });
    const logo = createLogoHeader(this, DESIGN_WIDTH / 2, 146, 1.04);

    // Top-Right WindHub Login + Giftcode/Daily Reward HUD (Giftcode button ONLY appears when authenticated!)
    const rightEdge = mobileOrientationManager.getViewRight();
    const hudY = isMobile ? 96 : 36;
    const accBtnW = isMobile ? 216 : 226;
    const giftBtnW = isMobile ? 216 : 238;

    this.accountHudBtn = createArcadeButton(this, {
      x: rightEdge - accBtnW / 2 - 18,
      y: hudY,
      width: accBtnW,
      height: 36,
      lipHeight: 2.5,
      label: '🔑 ĐĂNG NHẬP WINDHUB',
      fontSize: 12,
      fillColor: 0x1565c0,
      hoverColor: 0x1976d2,
      textColor: '#FFFFFF',
      onClick: () => this.openAccountModal(),
    });
    this.accountHudBtn.container.setDepth(85);

    this.giftCodeHudBtn = createArcadeButton(this, {
      x: isMobile
        ? rightEdge - giftBtnW / 2 - 18
        : rightEdge - accBtnW - giftBtnW / 2 - 28,
      y: isMobile ? hudY + 44 : hudY,
      width: giftBtnW,
      height: 36,
      lipHeight: 2.5,
      label: '🎟️ NHẬP GIFTCODE',
      fontSize: 12,
      fillColor: 0xffb300,
      hoverColor: 0xffca28,
      textColor: '#18191B',
      onClick: () => this.openAccountModal(),
    });
    this.giftCodeHudBtn.container.setDepth(85).setVisible(false);

    this.unsubWallet = skinWalletManager.subscribe((snap) => {
      this.syncAccountHud(snap);
    });

    const subHeader = this.add
      .text(
        DESIGN_WIDTH / 2,
        230,
        isMobile
          ? '✦ TOÀN KHUNG HÌNH NGANG TỰ ĐỘNG  •  ĐẤU AI, 2 NGƯỜI ĐỐI DIỆN HOẶC ONLINE 1VS1'
          : 'ĐẠI CHIẾN XE TĂNG MÊ CUNG CÙNG MÁY AI & BẠN BÈ  •  2 ĐẾN 4 XE',
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: isMobile ? '13.5px' : '14.5px',
          fontStyle: '800',
          color: UI_COLORS.inkMutedHex,
          letterSpacing: 0.8,
        },
      )
      .setOrigin(0.5, 0.5);

    const topModeItems = this.buildPlayerCountSelector(DESIGN_WIDTH / 2, 294);

    this.previewContainer = this.add.container(DESIGN_WIDTH / 2, 394);
    this.refreshTankPreview(false);

    const lobbyBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2 - 256,
      y: 504,
      width: 240,
      height: 58,
      lipHeight: 5,
      label: 'VÀO SẢNH ĐẤU',
      fontSize: 18.5,
      fillColor: 0xe53935,
      hoverColor: 0xf44336,
      textColor: '#FFFFFF',
      onClick: () => {
        if (this.hasOpenModal()) return;
        this.scene.start('SetupScene');
      },
    });

    const quickBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2,
      y: 504,
      width: 244,
      height: 58,
      lipHeight: 5,
      label: '▶ ĐẤU NHANH',
      fontSize: 19,
      fillColor: 0x43a047,
      hoverColor: 0x4caf50,
      textColor: '#FFFFFF',
      onClick: () => {
        if (this.hasOpenModal()) return;
        this.scene.start('GameScene', { freshMatch: true });
      },
    });

    this.onlineBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2 + 256,
      y: 504,
      width: 240,
      height: 58,
      lipHeight: 5,
      label: '🌐 ONLINE 1VS1',
      fontSize: 18,
      fillColor: 0x1565c0,
      hoverColor: 0x1976d2,
      textColor: '#FFFFFF',
      onClick: () => {
        if (this.hasOpenModal()) return;
        if (!networkStatus.isOnline()) return;
        this.scene.start('OnlineLobbyScene');
      },
    });

    this.offlineBadgeText = this.add
      .text(
        DESIGN_WIDTH / 2 + 256,
        547,
        '📴 Chế độ Offline • Vẫn chơi mượt với AI & Nội Bộ!',
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11px',
          fontStyle: '800',
          color: '#C62828',
        },
      )
      .setOrigin(0.5, 0.5)
      .setVisible(false);

    this.syncOnlineButtonAvailability();
    this.unsubNetwork = networkStatus.subscribe(() => {
      this.syncOnlineButtonAvailability();
    });

    // Symmetrical 4-button utility row (`Xưởng Chiến Xa`, `Cẩm Nang 15 Kỹ Năng`, `Cài Đặt`, `Hướng Dẫn`)
    const garageBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2 - 360,
      y: 598,
      width: 228,
      height: 48,
      label: '🛡️ XƯỞNG CHIẾN XA',
      fontSize: 14.5,
      fillColor: 0xffb300,
      hoverColor: 0xffca28,
      textColor: '#18191B',
      onClick: () => this.openGarageModal(),
    });

    const codexBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2 - 120,
      y: 598,
      width: 228,
      height: 48,
      label: '★ 15 KỸ NĂNG',
      fontSize: 14.5,
      fillColor: 0xfff8e1,
      hoverColor: 0xffecb3,
      textColor: '#E65100',
      onClick: () => this.openSkillGuide(),
    });

    const settingsBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2 + 120,
      y: 598,
      width: 228,
      height: 48,
      label: isMobile ? '⚙ CÀI ĐẶT & ĐỘ NHẠY' : '⚙ CÀI ĐẶT & ĐỔI PHÍM',
      fontSize: 14,
      fillColor: UI_COLORS.cardBg,
      hoverColor: 0xf4f6f8,
      onClick: () => this.openModal('settings'),
    });

    const guideBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2 + 360,
      y: 598,
      width: 228,
      height: 48,
      label: 'HƯỚNG DẪN CHƠI',
      fontSize: 14.5,
      fillColor: UI_COLORS.cardBg,
      hoverColor: 0xf4f6f8,
      onClick: () => this.openModal('controls'),
    });

    const footer = this.add
      .text(
        DESIGN_WIDTH / 2,
        704,
        isMobile
          ? '✦ Mobile 2 Người: Đặt điện thoại nằm ngang ở giữa — Người 1 cầm cạnh Trái, Người 2 ngồi đối diện cầm cạnh Phải!'
          : 'Xe 1: WASD + Space   |   Xe 2: Mũi Tên + Enter   |   Xe 3: IJKL + U   |   Xe 4: Phím Số 8546 + 0',
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '13px',
          fontStyle: '700',
          color: UI_COLORS.inkMutedHex,
        },
      )
      .setOrigin(0.5, 0.5);

    animateStaggeredEntrance(
      this,
      [
        logo,
        subHeader,
        ...topModeItems,
        this.previewContainer,
        lobbyBtn.container,
        quickBtn.container,
        this.onlineBtn.container,
        garageBtn.container,
        codexBtn.container,
        settingsBtn.container,
        guideBtn.container,
        footer,
      ],
      14,
      26,
    );

    this.onKeyDownBound = (e: KeyboardEvent) => {
      if (this.hasOpenModal() || e.repeat) return;
      if (e.code === 'Enter' || e.code === 'Space') {
        audioManager.unlock();
        audioManager.playUiClick(false);
        this.scene.start('SetupScene');
      } else if (e.code === 'Digit2') {
        this.selectCount(2);
      } else if (e.code === 'Digit3') {
        this.selectCount(3);
      } else if (e.code === 'Digit4') {
        this.selectCount(4);
      }
    };
    window.addEventListener('keydown', this.onKeyDownBound);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.onKeyDownBound);
      this.unsubNetwork?.();
      this.unsubNetwork = null;
      this.unsubWallet?.();
      this.unsubWallet = null;
      fsControls.destroy();
      this.activeModal?.close(true);
      this.activeModal = null;
      this.activeSkillModal?.close();
      this.activeSkillModal = null;
      this.activeGarageModal?.close(true);
      this.activeGarageModal = null;
      this.activeAccountModal?.close(true);
      this.activeAccountModal = null;
    });
  }

  private hasOpenModal(): boolean {
    return Boolean(
      this.activeModal ||
        this.activeSkillModal ||
        this.activeGarageModal ||
        this.activeAccountModal,
    );
  }

  private syncAccountHud(snap: WindHubWalletSnapshot): void {
    if (!this.accountHudBtn?.container?.scene || !this.giftCodeHudBtn?.container?.scene) {
      return;
    }

    if (!snap.authenticated) {
      // STRICT REQUIREMENT: Giftcode & Daily Check-in button is HIDDEN until logged into an account!
      this.giftCodeHudBtn.container.setVisible(false);
      this.accountHudBtn.setLabel(
        snap.online ? '🔑 ĐĂNG NHẬP WINDHUB' : '📴 OFFLINE (KHÁCH)',
      );
      this.accountHudBtn.setFill(
        snap.online ? 0x1565c0 : 0x546e7a,
        snap.online ? 0x1976d2 : 0x607d8b,
        '#FFFFFF',
      );
      return;
    }

    // Authenticated: show BOTH Account Xu Pill AND Giftcode / Daily Check-in Button!
    const shortName = (snap.displayName || snap.email || 'Tài khoản').slice(0, 12);
    this.accountHudBtn.setLabel(`◈ ${snap.balance.toLocaleString()} XU • ${shortName}`);
    this.accountHudBtn.setFill(0xffffff, 0xf8fafc, UI_COLORS.inkDarkHex);

    if (snap.online) {
      this.giftCodeHudBtn.container.setVisible(true);
      const canClaim = Boolean(snap.dailyReward?.canClaimToday);
      if (canClaim) {
        this.giftCodeHudBtn.setLabel('🎁 ĐIỂM DANH & NHẬP CODE');
        this.giftCodeHudBtn.setFill(0xffb300, 0xffca28, '#18191B');
      } else {
        this.giftCodeHudBtn.setLabel('🎟️ NHẬP GIFTCODE (ĐÃ NHẬN)');
        this.giftCodeHudBtn.setFill(0xe8f5e9, 0xc8e6c9, '#1B5E20');
      }
    } else {
      this.giftCodeHudBtn.container.setVisible(false);
    }
  }

  private syncOnlineButtonAvailability(): void {
    if (!this.onlineBtn) return;
    const online = networkStatus.isOnline();
    if (online) {
      this.onlineBtn.setEnabled(true);
      this.onlineBtn.setLabel('🌐 ONLINE 1VS1');
      this.onlineBtn.setFill(0x1565c0, 0x1976d2, '#FFFFFF');
      this.offlineBadgeText?.setVisible(false);
    } else {
      this.onlineBtn.setEnabled(false);
      this.onlineBtn.setLabel('🔒 ONLINE (OFFLINE)');
      this.onlineBtn.setFill(0xe0e3e7, 0xe0e3e7, '#788089');
      this.offlineBadgeText?.setVisible(true);
    }
  }

  private buildPlayerCountSelector(centerX: number, y: number): Phaser.GameObjects.Container[] {
    if (settingsManager.isTouchControlsActive()) {
      // On Mobile, replace dead locked 3P/4P buttons with 2 instant playable mode pills!
      this.mobileSoloAiBtn = createArcadeButton(this, {
        x: centerX - 152,
        y,
        width: 288,
        height: 46,
        label: '✦ 1 NGƯỜI ĐẤU MÁY AI',
        fontSize: 15,
        onClick: () => {
          if (this.activeModal || this.activeSkillModal) return;
          settingsManager.setPlayerCount(2);
          settingsManager.setPlayerIsAI(0, false);
          settingsManager.setPlayerIsAI(1, true);
          audioManager.playUiClick(true);
          this.refreshCountButtons();
          this.refreshTankPreview(true);
        },
      });

      this.mobileDualHumanBtn = createArcadeButton(this, {
        x: centerX + 152,
        y,
        width: 288,
        height: 46,
        label: '✦ 2 NGƯỜI ĐỐI DIỆN',
        fontSize: 15,
        onClick: () => {
          if (this.activeModal || this.activeSkillModal) return;
          settingsManager.setPlayerCount(2);
          settingsManager.setPlayerIsAI(0, false);
          settingsManager.setPlayerIsAI(1, false);
          audioManager.playUiClick(true);
          this.refreshCountButtons();
          this.refreshTankPreview(true);
        },
      });

      this.refreshCountButtons();
      return [this.mobileSoloAiBtn.container, this.mobileDualHumanBtn.container];
    }

    const counts: Array<2 | 3 | 4> = [2, 3, 4];
    counts.forEach((cnt, idx) => {
      const bx = centerX + (idx - 1) * 168;
      const btn = createArcadeButton(this, {
        x: bx,
        y,
        width: 156,
        height: 44,
        label: `${cnt} XE THAM CHIẾN`,
        fontSize: 15,
        onClick: () => {
          if (this.activeModal || this.activeSkillModal) return;
          this.selectCount(cnt);
        },
      });
      this.countButtons.set(cnt, btn);
    });
    this.refreshCountButtons();
    return Array.from(this.countButtons.values()).map((b) => b.container);
  }

  private selectCount(cnt: 2 | 3 | 4): void {
    if (settingsManager.isTouchControlsActive() && cnt > 2) return;
    settingsManager.setPlayerCount(cnt);
    audioManager.playUiClick(true);
    this.refreshCountButtons();
    this.refreshTankPreview(true);
  }

  private refreshCountButtons(): void {
    const isMobile = settingsManager.isTouchControlsActive();
    const s = settingsManager.getSettings();
    if (isMobile && s.playerCount > 2) {
      settingsManager.setPlayerCount(2);
    }

    if (this.mobileSoloAiBtn && this.mobileDualHumanBtn) {
      const soloVsAi = Boolean(s.playerIsAI[1]) && !s.playerIsAI[0];
      const dualOpposite = !s.playerIsAI[0] && !s.playerIsAI[1];
      this.mobileSoloAiBtn.setFill(
        soloVsAi ? UI_COLORS.inkDark : UI_COLORS.cardBg,
        soloVsAi ? 0x2c3036 : 0xf4f6f8,
        soloVsAi ? '#FFFFFF' : UI_COLORS.inkDarkHex,
      );
      this.mobileDualHumanBtn.setFill(
        dualOpposite ? UI_COLORS.inkDark : UI_COLORS.cardBg,
        dualOpposite ? 0x2c3036 : 0xf4f6f8,
        dualOpposite ? '#FFFFFF' : UI_COLORS.inkDarkHex,
      );
      return;
    }

    const activeCnt = settingsManager.getSettings().playerCount;
    for (const [cnt, btn] of this.countButtons.entries()) {
      btn.setEnabled(true);
      btn.setLabel(`${cnt} XE THAM CHIẾN`);
      const isSelected = cnt === activeCnt;
      btn.setFill(
        isSelected ? UI_COLORS.inkDark : UI_COLORS.cardBg,
        isSelected ? 0x2c3036 : 0xf4f6f8,
        isSelected ? '#FFFFFF' : UI_COLORS.inkDarkHex,
      );
    }
  }

  private refreshTankPreview(animatePop = false): void {
    this.previewContainer.removeAll(true);
    const s = settingsManager.getSettings();
    const count = s.playerCount;

    const cardW = count * 130 + 36;
    const cardH = 92;
    const bg = this.add.graphics();
    bg.fillStyle(UI_COLORS.cardBg, 1);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
    bg.lineStyle(2.5, UI_COLORS.inkDark, 1);
    bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
    this.previewContainer.add(bg);

    for (let i = 0; i < count; i++) {
      const px = (i - (count - 1) / 2) * 130;
      const palette = getPaletteById(s.playerColors[i]);
      const skinId = settingsManager.getPlayerSkin(i as PlayerIndex);
      const skinDesc = getTankSkinDescriptor(skinId);
      const texKey = AssetFactory.ensureTankTexture(this, palette.id, skinId, null, 0, false);
      const shadow = this.add
        .image(px + 2, -6 + 3, 'tank_shadow')
        .setScale(0.95)
        .setRotation(-Math.PI / 2);
      const sprite = this.add
        .image(px, -6, texKey)
        .setScale(0.95)
        .setRotation(-Math.PI / 2);
      const isAI = Boolean(s.playerIsAI[i]);
      const slotCopy = isAI
        ? `XE ${i + 1} • ${getAIDifficultyDescriptor(s.playerAIDifficulty[i] ?? 'normal').shortBadge}`
        : `XE ${i + 1} • ${skinDesc.shortName.toUpperCase()}`;
      const label = this.add
        .text(px, 30, slotCopy, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11.5px',
          fontStyle: '800',
          color: palette.primaryHex,
        })
        .setOrigin(0.5, 0.5);
      this.previewContainer.add([shadow, sprite, label]);
    }

    if (animatePop) {
      this.tweens.killTweensOf(this.previewContainer);
      this.previewContainer.setScale(0.94);
      this.tweens.add({
        targets: this.previewContainer,
        scaleX: 1,
        scaleY: 1,
        duration: 180,
        ease: 'Back.easeOut',
      });
    }
  }

  private openModal(mode: 'settings' | 'controls'): void {
    if (this.hasOpenModal()) return;
    this.activeModal = new SettingsModal(this, {
      mode,
      onClose: () => {
        this.activeModal = null;
        mobileOrientationManager.syncLayout();
        this.refreshCountButtons();
        this.refreshTankPreview(false);
      },
      onBindingsUpdated: () => {
        mobileOrientationManager.syncLayout();
        this.refreshCountButtons();
        this.refreshTankPreview(false);
      },
      onOpenSkillGuide: () => {
        this.openSkillGuide();
      },
    });
  }

  private openSkillGuide(): void {
    if (this.hasOpenModal()) return;
    this.activeSkillModal = new SkillGuideModal(this, {
      onClose: () => {
        this.activeSkillModal = null;
      },
    });
  }

  private openGarageModal(): void {
    if (this.hasOpenModal()) return;
    this.activeGarageModal = new TankGarageModal(this, {
      initialPlayerIndex: 0,
      onUpdated: () => {
        this.refreshTankPreview(false);
      },
      onClose: () => {
        this.activeGarageModal = null;
        this.refreshTankPreview(false);
      },
    });
  }

  private openAccountModal(): void {
    if (this.hasOpenModal()) return;
    this.activeAccountModal = new WindHubAccountModal(this, {
      onClose: () => {
        this.activeAccountModal = null;
        this.refreshTankPreview(false);
      },
    });
  }
}
