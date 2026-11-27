import Phaser from 'phaser';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  getAIDifficultyDescriptor,
  getPaletteById,
  UI_COLORS,
} from '../config/constants';
import { audioManager } from '../managers/AudioManager';
import { mobileOrientationManager } from '../managers/MobileOrientationManager';
import { settingsManager } from '../managers/SettingsManager';
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

export class MenuScene extends Phaser.Scene {
  private countButtons: Map<2 | 3 | 4, ArcadeButtonHandle> = new Map();
  private previewContainer!: Phaser.GameObjects.Container;
  private activeModal: SettingsModal | null = null;
  private activeSkillModal: SkillGuideModal | null = null;
  private onKeyDownBound!: (e: KeyboardEvent) => void;

  constructor() {
    super('MenuScene');
  }

  create(): void {
    this.countButtons.clear();
    this.activeModal = null;
    this.activeSkillModal = null;
    mobileOrientationManager.syncLayout();
    const isMobile = settingsManager.isTouchControlsActive();
    if (isMobile && settingsManager.getSettings().playerCount > 2) {
      settingsManager.setPlayerCount(2);
    }

    this.cameras.main.fadeIn(220, 238, 238, 236);
    drawMazeBackdrop(this, DESIGN_WIDTH, DESIGN_HEIGHT);
    const fsControls = createMobileFullscreenControls(this, {
      buttonX: DESIGN_WIDTH - 96,
      buttonY: 40,
      showRecommendationBanner: true,
      bannerY: 40,
    });
    const logo = createLogoHeader(this, DESIGN_WIDTH / 2, 148, 1.04);

    const subHeader = this.add
      .text(
        DESIGN_WIDTH / 2,
        232,
        isMobile
          ? '📱 CHẾ ĐỘ MOBILE TỰ ĐỘNG XOAY NGANG  •  ĐẤU AI, 2 NGƯỜI ĐỐI DIỆN HOẶC ONLINE 1VS1'
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

    this.buildPlayerCountSelector(DESIGN_WIDTH / 2, 294);

    this.previewContainer = this.add.container(DESIGN_WIDTH / 2, 392);
    this.refreshTankPreview(false);

    const lobbyBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2 - 252,
      y: 504,
      width: 236,
      height: 56,
      lipHeight: 5,
      label: 'VÀO SẢNH ĐẤU',
      fontSize: 19,
      fillColor: 0xe53935,
      hoverColor: 0xf44336,
      textColor: '#FFFFFF',
      onClick: () => {
        if (this.activeModal || this.activeSkillModal) return;
        this.scene.start('SetupScene');
      },
    });

    const quickBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2,
      y: 504,
      width: 236,
      height: 56,
      lipHeight: 5,
      label: 'ĐẤU NHANH',
      fontSize: 19,
      fillColor: 0x43a047,
      hoverColor: 0x4caf50,
      textColor: '#FFFFFF',
      onClick: () => {
        if (this.activeModal || this.activeSkillModal) return;
        this.scene.start('GameScene', { freshMatch: true });
      },
    });

    const onlineBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2 + 252,
      y: 504,
      width: 236,
      height: 56,
      lipHeight: 5,
      label: '🌐 ONLINE 1VS1',
      fontSize: 19,
      fillColor: 0x1565c0,
      hoverColor: 0x1976d2,
      textColor: '#FFFFFF',
      onClick: () => {
        if (this.activeModal || this.activeSkillModal) return;
        this.scene.start('OnlineLobbyScene');
      },
    });

    const guideBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2 - 125,
      y: 584,
      width: 235,
      height: 46,
      label: 'HƯỚNG DẪN CHƠI',
      fontSize: 15.5,
      fillColor: UI_COLORS.cardBg,
      hoverColor: 0xf4f6f8,
      onClick: () => this.openModal('controls'),
    });

    const settingsBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2 + 125,
      y: 584,
      width: 235,
      height: 46,
      label: isMobile ? 'CÀI ĐẶT & ĐỘ NHẠY' : 'CÀI ĐẶT & ĐỔI PHÍM',
      fontSize: 15.5,
      fillColor: UI_COLORS.cardBg,
      hoverColor: 0xf4f6f8,
      onClick: () => this.openModal('settings'),
    });

    const codexBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2,
      y: 644,
      width: 485,
      height: 42,
      lipHeight: 3,
      label: '★ CẨM NANG 10 KỸ NĂNG & THÙNG GỖ BÍ ẨN ★',
      fontSize: 15,
      fillColor: 0xfff8e1,
      hoverColor: 0xffecb3,
      textColor: '#E65100',
      onClick: () => this.openSkillGuide(),
    });

    const footer = this.add
      .text(
        DESIGN_WIDTH / 2,
        714,
        isMobile
          ? '📱 Mobile 2 Người: Đặt điện thoại nằm ngang ở giữa — Người 1 cầm cạnh Trái, Người 2 ngồi đối diện cầm cạnh Phải!'
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
        ...Array.from(this.countButtons.values()).map((b) => b.container),
        this.previewContainer,
        lobbyBtn.container,
        quickBtn.container,
        onlineBtn.container,
        guideBtn.container,
        settingsBtn.container,
        codexBtn.container,
        footer,
      ],
      14,
      26,
    );

    this.onKeyDownBound = (e: KeyboardEvent) => {
      if (this.activeModal || this.activeSkillModal || e.repeat) return;
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
      fsControls.destroy();
      this.activeModal?.close(true);
      this.activeModal = null;
      this.activeSkillModal?.close();
      this.activeSkillModal = null;
    });
  }

  private buildPlayerCountSelector(centerX: number, y: number): void {
    const counts: Array<2 | 3 | 4> = [2, 3, 4];
    counts.forEach((cnt, idx) => {
      const bx = centerX + (idx - 1) * 165;
      const btn = createArcadeButton(this, {
        x: bx,
        y,
        width: 152,
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
    if (isMobile && settingsManager.getSettings().playerCount > 2) {
      settingsManager.setPlayerCount(2);
    }
    const activeCnt = settingsManager.getSettings().playerCount;
    for (const [cnt, btn] of this.countButtons.entries()) {
      const lockedOnMobile = isMobile && cnt > 2;
      if (lockedOnMobile) {
        btn.setLabel(`🔒 ${cnt} XE (CHỈ PC)`);
        btn.setFill(0xe0e3e7, 0xe0e3e7, '#8D939C');
        btn.setEnabled(false);
        continue;
      }
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
      const shadow = this.add
        .image(px + 2, -6 + 3, 'tank_shadow')
        .setScale(0.95)
        .setRotation(-Math.PI / 2);
      const sprite = this.add
        .image(px, -6, `tank_${palette.id}_0`)
        .setScale(0.95)
        .setRotation(-Math.PI / 2);
      const isAI = Boolean(s.playerIsAI[i]);
      const slotCopy = isAI
        ? `XE ${i + 1} • ${getAIDifficultyDescriptor(s.playerAIDifficulty[i] ?? 'normal').shortBadge}`
        : `XE ${i + 1} • ${palette.name.toUpperCase()}`;
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
    if (this.activeModal || this.activeSkillModal) return;
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
    if (this.activeModal || this.activeSkillModal) return;
    this.activeSkillModal = new SkillGuideModal(this, {
      onClose: () => {
        this.activeSkillModal = null;
      },
    });
  }
}
