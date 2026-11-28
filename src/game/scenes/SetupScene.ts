import Phaser from 'phaser';
import { AssetFactory } from '../art/AssetFactory';
import {
  AI_DIFFICULTY_DESCRIPTORS,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  formatCrateSpawnIntervalLabel,
  formatKeyCodeLabel,
  getAIDifficultyDescriptor,
  getPaletteById,
  getTankSkinDescriptor,
  UI_COLORS,
} from '../config/constants';
import { audioManager } from '../managers/AudioManager';
import { mobileOrientationManager } from '../managers/MobileOrientationManager';
import { settingsManager } from '../managers/SettingsManager';
import { MAP_MODES } from '../maps/mapDefinitions';
import type { PlayerIndex } from '../types/gameTypes';
import {
  animateStaggeredEntrance,
  createArcadeButton,
  createScoreStepper,
  drawMazeBackdrop,
  type ArcadeButtonHandle,
  type ScoreStepperHandle,
} from '../../ui/components/ArcadeWidgets';
import { createMobileFullscreenControls } from '../../ui/components/FullscreenPromptWidget';
import { MatchRulesModal } from '../../ui/components/MatchRulesModal';
import { SettingsModal } from '../../ui/components/SettingsModal';
import { SkillGuideModal } from '../../ui/components/SkillGuideModal';
import { TankGarageModal } from '../../ui/components/TankGarageModal';

export class SetupScene extends Phaser.Scene {
  private cardsContainer!: Phaser.GameObjects.Container;
  private countButtons: Map<2 | 3 | 4, ArcadeButtonHandle> = new Map();
  private mapBtn!: ArcadeButtonHandle;
  private mapSubtitleText!: Phaser.GameObjects.Text;
  private rulesBtn!: ArcadeButtonHandle;
  private scoreStepper!: ScoreStepperHandle;
  private previewTanks: Phaser.GameObjects.Image[] = [];
  private activeModal: SettingsModal | null = null;
  private activeSkillModal: SkillGuideModal | null = null;
  private activeRulesModal: MatchRulesModal | null = null;
  private activeGarageModal: TankGarageModal | null = null;
  private skinModeBtn!: ArcadeButtonHandle;
  private onKeyDownBound!: (e: KeyboardEvent) => void;

  constructor() {
    super('SetupScene');
  }

  private isOverlayBusy(): boolean {
    return Boolean(
      this.activeModal ||
        this.activeSkillModal ||
        this.activeRulesModal ||
        this.activeGarageModal ||
        this.scoreStepper?.isEditing(),
    );
  }

  create(): void {
    this.countButtons.clear();
    this.previewTanks = [];
    this.activeModal = null;
    this.activeSkillModal = null;
    this.activeRulesModal = null;
    this.activeGarageModal = null;

    mobileOrientationManager.syncLayout();
    const isMobile = settingsManager.isTouchControlsActive();
    if (isMobile && settingsManager.getSettings().playerCount > 2) {
      settingsManager.setPlayerCount(2);
    }
    drawMazeBackdrop(this, DESIGN_WIDTH, DESIGN_HEIGHT);
    const fsControls = createMobileFullscreenControls(this, {
      buttonY: 42,
      showRecommendationBanner: false,
    });

    const header = this.add
      .text(DESIGN_WIDTH / 2, isMobile ? 42 : 46, 'SẢNH CHỌN XE TĂNG, ĐỘ KHÓ AI & LUẬT ĐẤU', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: isMobile ? '26px' : '28px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0.5, 0.5);

    const topItems: Array<Phaser.GameObjects.Container | Phaser.GameObjects.Text> = [header];

    if (isMobile) {
      const mobileSub = this.add
        .text(
          DESIGN_WIDTH / 2,
          82,
          'Chọn màu sơn, bật/tắt Máy AI (4 cấp độ) hoặc để 2 Người Chơi ngồi đối diện trên 1 máy',
          {
            fontFamily: "'Segoe UI', 'Inter', sans-serif",
            fontSize: '13px',
            fontStyle: '800',
            color: UI_COLORS.inkMutedHex,
          },
        )
        .setOrigin(0.5, 0.5);
      topItems.push(mobileSub);
    } else {
      const counts: Array<2 | 3 | 4> = [2, 3, 4];
      counts.forEach((cnt, idx) => {
        const btn = createArcadeButton(this, {
          x: DESIGN_WIDTH / 2 - 270 + idx * 146,
          y: 102,
          width: 136,
          height: 40,
          label: `${cnt} XE ĐẤU`,
          fontSize: 14.5,
          onClick: () => {
            if (this.isOverlayBusy()) return;
            this.scoreStepper?.commitAndStopEditing();
            settingsManager.setPlayerCount(cnt);
            this.refreshAll(cnt - 1);
          },
        });
        this.countButtons.set(cnt, btn);
        topItems.push(btn.container);
      });
    }

    const topRowY = isMobile ? 84 : 102;
    const garageTopBtn = createArcadeButton(this, {
      x: isMobile ? DESIGN_WIDTH / 2 - 190 : DESIGN_WIDTH / 2 + 178,
      y: topRowY,
      width: 196,
      height: isMobile ? 36 : 40,
      lipHeight: 2.5,
      label: '🛡️ XƯỞNG CHIẾN XA',
      fontSize: 13,
      fillColor: 0xffb300,
      hoverColor: 0xffca28,
      textColor: '#18191B',
      onClick: () => this.openGarageForPlayer(0),
    });
    topItems.push(garageTopBtn.container);

    this.skinModeBtn = createArcadeButton(this, {
      x: isMobile ? DESIGN_WIDTH / 2 + 165 : DESIGN_WIDTH / 2 + 398,
      y: topRowY,
      width: 224,
      height: isMobile ? 36 : 40,
      lipHeight: 2.5,
      label: '',
      fontSize: 12,
      onClick: () => {
        if (this.isOverlayBusy()) return;
        settingsManager.toggleSkinStatsEnabled();
        this.refreshRulesRow();
        this.rebuildPlayerCards();
      },
    });
    topItems.push(this.skinModeBtn.container);

    this.cardsContainer = this.add.container(0, 0);

    const s = settingsManager.getSettings();
    const initialMode = MAP_MODES.find((m) => m.id === s.mapMode) ?? MAP_MODES[0];

    // Symmetrically balanced Rules Bar (`x = 60 .. 1220`, centered around 640)
    const mapPrevBtn = createArcadeButton(this, {
      x: 79,
      y: 590,
      width: 38,
      height: 44,
      lipHeight: 3,
      label: '◀',
      fontSize: 14,
      fillColor: UI_COLORS.cardAltBg,
      onClick: () => {
        if (this.activeModal || this.activeSkillModal || this.activeRulesModal) return;
        this.scoreStepper?.commitAndStopEditing();
        this.cycleMapMode(-1);
      },
    });

    this.mapBtn = createArcadeButton(this, {
      x: 262,
      y: 590,
      width: 316,
      height: 44,
      label: `BẢN ĐỒ: ${initialMode.label.toUpperCase()}`,
      fontSize: 13,
      fillColor: UI_COLORS.cardBg,
      onClick: () => {
        if (this.activeModal || this.activeSkillModal || this.activeRulesModal) return;
        this.scoreStepper?.commitAndStopEditing();
        this.cycleMapMode(1);
      },
    });

    const mapNextBtn = createArcadeButton(this, {
      x: 445,
      y: 590,
      width: 38,
      height: 44,
      lipHeight: 3,
      label: '▶',
      fontSize: 14,
      fillColor: UI_COLORS.cardAltBg,
      onClick: () => {
        if (this.activeModal || this.activeSkillModal || this.activeRulesModal) return;
        this.scoreStepper?.commitAndStopEditing();
        this.cycleMapMode(1);
      },
    });

    this.mapSubtitleText = this.add
      .text(262, 624, initialMode.subtitle, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '12px',
        fontStyle: '600',
        color: UI_COLORS.inkMutedHex,
      })
      .setOrigin(0.5, 0.5);

    this.scoreStepper = createScoreStepper(this, {
      x: 648,
      y: 590,
      width: 332,
      height: 44,
      value: s.winningScore,
      onChange: (nextScore) => {
        settingsManager.setWinningScore(nextScore);
      },
    });

    const scoreHint = this.add
      .text(648, 624, 'Bấm ◀/▶, bấm vào ô để gõ điểm, hoặc ∞ Vô Tận', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '12px',
        fontStyle: '600',
        color: UI_COLORS.inkMutedHex,
      })
      .setOrigin(0.5, 0.5);

    this.rulesBtn = createArcadeButton(this, {
      x: 894,
      y: 590,
      width: 124,
      height: 44,
      label: '⚙ LUẬT CHƠI',
      fontSize: 13,
      fillColor: 0xe3f2fd,
      hoverColor: 0xbbdefb,
      textColor: '#0D47A1',
      onClick: () => {
        if (this.activeModal || this.activeSkillModal || this.activeRulesModal) return;
        this.scoreStepper?.commitAndStopEditing();
        this.activeRulesModal = new MatchRulesModal(this, {
          inMatch: false,
          onRulesChanged: () => this.refreshAll(),
          onClose: () => {
            this.activeRulesModal = null;
            this.refreshAll();
          },
        });
      },
    });

    const keysBtn = createArcadeButton(this, {
      x: 1026,
      y: 590,
      width: 124,
      height: 44,
      label: settingsManager.isTouchControlsActive() ? '⚙ ĐỘ NHẠY' : '⚙ ĐỔI PHÍM',
      fontSize: 13,
      fillColor: UI_COLORS.cardAltBg,
      hoverColor: 0xdcdfe4,
      onClick: () => {
        if (this.activeModal || this.activeSkillModal || this.activeRulesModal) return;
        this.scoreStepper?.commitAndStopEditing();
        this.activeModal = new SettingsModal(this, {
          mode: 'settings',
          onClose: () => {
            this.activeModal = null;
            this.refreshAll();
          },
          onBindingsUpdated: () => this.refreshAll(),
        });
      },
    });

    const skillsBtn = createArcadeButton(this, {
      x: 1158,
      y: 590,
      width: 124,
      height: 44,
      label: '★ KỸ NĂNG',
      fontSize: 13,
      fillColor: 0xfff8e1,
      hoverColor: 0xffecb3,
      textColor: '#E65100',
      onClick: () => {
        if (this.activeModal || this.activeSkillModal || this.activeRulesModal) return;
        this.scoreStepper?.commitAndStopEditing();
        this.activeSkillModal = new SkillGuideModal(this, {
          onClose: () => {
            this.activeSkillModal = null;
          },
        });
      },
    });

    // Symmetrically centered bottom navigation pair (`x = 332 .. 948`, exact center = 640!)
    const backBtn = createArcadeButton(this, {
      x: 442,
      y: 696,
      width: 220,
      height: 54,
      label: '← TRANG CHỦ',
      fontSize: 16,
      fillColor: UI_COLORS.cardBg,
      onClick: () => {
        if (this.activeModal || this.activeSkillModal || this.activeRulesModal) return;
        this.scoreStepper?.commitAndStopEditing();
        this.scene.start('MenuScene');
      },
    });

    const startBtn = createArcadeButton(this, {
      x: 762,
      y: 696,
      width: 372,
      height: 56,
      lipHeight: 5,
      label: 'TIẾP TỤC: CHỌN CHẾ ĐỘ →',
      fontSize: 19.5,
      fillColor: 0x43a047,
      hoverColor: 0x4caf50,
      textColor: '#FFFFFF',
      onClick: () => {
        if (this.activeModal || this.activeSkillModal || this.activeRulesModal) return;
        this.scoreStepper?.commitAndStopEditing();
        this.scene.start('ModeSelectScene');
      },
    });

    this.refreshAll(undefined, true);

    animateStaggeredEntrance(
      this,
      [
        ...topItems,
        mapPrevBtn.container,
        this.mapBtn.container,
        mapNextBtn.container,
        this.mapSubtitleText,
        this.scoreStepper.container,
        scoreHint,
        this.rulesBtn.container,
        keysBtn.container,
        skillsBtn.container,
        backBtn.container,
        startBtn.container,
      ],
      14,
      20,
    );

    this.onKeyDownBound = (e: KeyboardEvent) => {
      if (this.isOverlayBusy() || e.repeat) return;
      if (e.code === 'Escape') {
        audioManager.playUiClick(true);
        this.scene.start('MenuScene');
      } else if (e.code === 'Enter') {
        audioManager.playUiClick(false);
        this.scene.start('ModeSelectScene');
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
      this.activeRulesModal?.close(true);
      this.activeRulesModal = null;
      this.activeGarageModal?.close(true);
      this.activeGarageModal = null;
      this.scoreStepper?.destroy();
    });
  }

  private cycleMapMode(dir: 1 | -1): void {
    const cur = settingsManager.getSettings().mapMode;
    const idx = Math.max(
      0,
      MAP_MODES.findIndex((m) => m.id === cur),
    );
    const next = MAP_MODES[(idx + dir + MAP_MODES.length) % MAP_MODES.length];
    settingsManager.setMapMode(next.id);
    this.refreshRulesRow();
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    for (const sprite of this.previewTanks) {
      if (sprite.active) {
        sprite.rotation += dt * 0.65;
      }
    }
  }

  private refreshAll(pulseCardIndex?: number, animateInitial = false): void {
    mobileOrientationManager.syncLayout();
    const isMobile = settingsManager.isTouchControlsActive();
    if (isMobile && settingsManager.getSettings().playerCount > 2) {
      settingsManager.setPlayerCount(2);
    }
    const s = settingsManager.getSettings();
    for (const [cnt, btn] of this.countButtons.entries()) {
      const locked = isMobile && cnt > 2;
      if (locked) {
        btn.setLabel(`🔒 ${cnt} XE (PC)`);
        btn.setFill(0xe0e3e7, 0xe0e3e7, '#8D939C');
        btn.setEnabled(false);
        continue;
      }
      btn.setEnabled(true);
      btn.setLabel(`${cnt} XE ĐẤU`);
      const selected = cnt === s.playerCount;
      btn.setFill(
        selected ? UI_COLORS.inkDark : UI_COLORS.cardBg,
        selected ? 0x2c3036 : 0xf4f6f8,
        selected ? '#FFFFFF' : UI_COLORS.inkDarkHex,
      );
    }
    this.refreshRulesRow();
    this.rebuildPlayerCards(pulseCardIndex, animateInitial);
  }

  private refreshRulesRow(): void {
    const s = settingsManager.getSettings();
    const mode = MAP_MODES.find((m) => m.id === s.mapMode) ?? MAP_MODES[0];
    this.mapBtn.setLabel(`BẢN ĐỒ: ${mode.label.toUpperCase()}`);
    this.mapSubtitleText.setText(
      `${mode.subtitle}  •  ${formatCrateSpawnIntervalLabel(s.powerUpSpawnIntervalSec, true)}`,
    );
    this.scoreStepper?.setValue(s.winningScore);
    this.rulesBtn?.setLabel(
      s.powerUpSpawnIntervalSec === 0
        ? '⚙ LUẬT (TẮT)'
        : `⚙ LUẬT (${s.powerUpSpawnIntervalSec}s)`,
    );
    if (this.skinModeBtn) {
      this.skinModeBtn.setLabel(
        s.skinStatsEnabled ? '⚡ SKIN: THỰC CHIẾN' : '🎨 SKIN: CHUẨN 100%',
      );
      this.skinModeBtn.setFill(
        s.skinStatsEnabled ? 0xe8f5e9 : 0xe3f2fd,
        s.skinStatsEnabled ? 0xc8e6c9 : 0xbbdefb,
        s.skinStatsEnabled ? '#1B5E20' : '#0D47A1',
      );
    }
  }

  private openGarageForPlayer(playerIndex: PlayerIndex): void {
    if (this.isOverlayBusy()) return;
    this.scoreStepper?.commitAndStopEditing();
    this.activeGarageModal = new TankGarageModal(this, {
      initialPlayerIndex: playerIndex,
      onUpdated: () => {
        this.refreshRulesRow();
        this.rebuildPlayerCards();
      },
      onClose: () => {
        this.activeGarageModal = null;
        this.refreshRulesRow();
        this.rebuildPlayerCards();
      },
    });
  }

  private rebuildPlayerCards(pulseCardIndex?: number, animateInitial = false): void {
    this.cardsContainer.removeAll(true);
    this.previewTanks = [];

    const s = settingsManager.getSettings();
    const isMobile = settingsManager.isTouchControlsActive();
    // On Mobile, display ONLY the 2 playable tank cards in wide, thumb-friendly proportions!
    const slotCount = isMobile ? 2 : 4;
    const cardW = isMobile ? 436 : 266;
    const cardH = isMobile ? 404 : 382;
    const cardStepX = isMobile ? 468 : 288;
    const startX = DESIGN_WIDTH / 2 - ((slotCount - 1) / 2) * cardStepX;
    const cardY = isMobile ? 320 : 342;

    for (let i = 0; i < slotCount; i++) {
      const pIdx = i as PlayerIndex;
      const cx = startX + i * cardStepX;
      const isActive = i < s.playerCount;
      const palette = getPaletteById(s.playerColors[i]);
      const bind = s.playerBindings[i];
      const isAI = Boolean(s.playerIsAI[i]);
      const aiDiff = s.playerAIDifficulty[i] ?? 'normal';
      const aiDesc = getAIDifficultyDescriptor(aiDiff);

      // Wrap each card in its own centered sub-container at `(cx, cardY)` for silky card animations!
      const slotRoot = this.add.container(cx, cardY);
      this.cardsContainer.add(slotRoot);

      const card = this.add.graphics();
      if (isActive) {
        card.fillStyle(0x1d1f22, 0.14);
        card.fillRoundedRect(-cardW / 2 + 4, -cardH / 2 + 5, cardW, cardH, 12);
        card.fillStyle(isAI ? 0xf7faff : UI_COLORS.cardBg, 1);
        card.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
        card.fillStyle(palette.primary, 1);
        card.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, 48, {
          tl: 12,
          tr: 12,
          bl: 0,
          br: 0,
        });
        card.lineStyle(2.6, UI_COLORS.inkDark, 1);
        card.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
        slotRoot.add(card);

        const title = this.add
          .text(0, -cardH / 2 + 24, isAI ? `XE ${i + 1}  •  MÁY AI` : `XE ${i + 1}`, {
            fontFamily: "'Segoe UI', 'Inter', sans-serif",
            fontSize: isMobile ? '19px' : '18px',
            fontStyle: '900',
            color: '#FFFFFF',
          })
          .setOrigin(0.5, 0.5);

        const skinId = settingsManager.getPlayerSkin(pIdx);
        const skinDesc = getTankSkinDescriptor(skinId);
        const texKey = AssetFactory.ensureTankTexture(this, palette.id, skinId, null, 0, false);

        const ringY = isMobile ? -108 : -102;
        const ring = this.add
          .circle(0, ringY, isMobile ? 38 : 34, isAI ? 0xe3f2fd : 0xf3f4f6, 1)
          .setStrokeStyle(2.2, isAI ? aiDesc.fillColor : skinDesc.rarityColor, 1);
        const tankSprite = this.add
          .image(0, ringY, texKey)
          .setScale(isMobile ? 1.18 : 1.06)
          .setRotation(-Math.PI / 4 + i * 0.5);
        this.previewTanks.push(tankSprite);

        const innerBtnW = isMobile ? 344 : 214;
        const colorBtn = createArcadeButton(this, {
          x: 0,
          y: isMobile ? -50 : -46,
          width: innerBtnW,
          height: isMobile ? 32 : 28,
          lipHeight: 2.5,
          label: `◀  MÀU SƠN: ${palette.name.toUpperCase()}  ▶`,
          fontSize: isMobile ? 13 : 12,
          fillColor: UI_COLORS.cardAltBg,
          onClick: () => {
            if (this.isOverlayBusy()) return;
            settingsManager.cyclePlayerColor(pIdx, 1);
            this.rebuildPlayerCards(i);
          },
        });

        const skinBtn = createArcadeButton(this, {
          x: 0,
          y: isMobile ? -14 : -13,
          width: innerBtnW,
          height: isMobile ? 32 : 28,
          lipHeight: 2.5,
          label: `🛡️ SKIN: ${skinDesc.shortName.toUpperCase()} (ĐỔI)`,
          fontSize: isMobile ? 12.5 : 11.5,
          fillColor: 0xfff8e1,
          hoverColor: 0xffecb3,
          textColor: '#E65100',
          onClick: () => this.openGarageForPlayer(pIdx),
        });

        const modeToggleBtn = createArcadeButton(this, {
          x: 0,
          y: isMobile ? 22 : 20,
          width: innerBtnW,
          height: isMobile ? 34 : 29,
          lipHeight: 2.5,
          label: isAI ? '● CHẾ ĐỘ: MÁY AI (BẤM ĐỂ TẮT)' : '● NGƯỜI CHƠI  •  BẬT MÁY AI',
          fontSize: isMobile ? 13 : 12,
          fillColor: isAI ? 0x1d2430 : UI_COLORS.cardBg,
          hoverColor: isAI ? 0x2b3648 : 0xe8f0fe,
          textColor: isAI ? '#40C4FF' : UI_COLORS.inkDarkHex,
          onClick: () => {
            if (this.isOverlayBusy()) return;
            settingsManager.togglePlayerIsAI(pIdx);
            this.rebuildPlayerCards(i);
          },
        });

        slotRoot.add([
          title,
          ring,
          tankSprite,
          colorBtn.container,
          skinBtn.container,
          modeToggleBtn.container,
        ]);

        if (isAI) {
          const aiHdr = this.add
            .text(0, isMobile ? 50 : 42, 'CHỌN 4 CẤP ĐỘ AI:', {
              fontFamily: "'Segoe UI', 'Inter', sans-serif",
              fontSize: isMobile ? '12px' : '11.5px',
              fontStyle: '900',
              color: UI_COLORS.inkMutedHex,
            })
            .setOrigin(0.5, 0.5);
          slotRoot.add(aiHdr);

          const diffOffsetX = isMobile ? 88 : 56;
          const diffW = isMobile ? 164 : 104;
          const diffH = isMobile ? 35 : 31;
          const diffStartY = isMobile ? 80 : 70;
          const diffStepY = isMobile ? 42 : 38;

          AI_DIFFICULTY_DESCRIPTORS.forEach((dDesc, dIdx) => {
            const col = dIdx % 2;
            const row = Math.floor(dIdx / 2);
            const bx = col === 0 ? -diffOffsetX : diffOffsetX;
            const by = diffStartY + row * diffStepY;
            const selected = dDesc.id === aiDiff;

            const dBtn = createArcadeButton(this, {
              x: bx,
              y: by,
              width: diffW,
              height: diffH,
              lipHeight: 2.5,
              label: dDesc.label,
              fontSize: isMobile ? 13.5 : 12.5,
              fillColor: selected ? dDesc.fillColor : UI_COLORS.cardBg,
              hoverColor: selected ? dDesc.hoverColor : 0xf0f4f8,
              textColor: selected ? '#FFFFFF' : UI_COLORS.inkDarkHex,
              onClick: () => {
                if (this.activeModal || this.activeSkillModal || this.activeRulesModal) return;
                settingsManager.setPlayerAIDifficulty(pIdx, dDesc.id);
                this.rebuildPlayerCards(i);
              },
            });
            slotRoot.add(dBtn.container);
          });

          const descBoxW = isMobile ? 352 : 228;
          const descBoxY = isMobile ? 148 : 134;
          const descBox = this.add.graphics();
          descBox.fillStyle(aiDesc.fillColor, 0.11);
          descBox.fillRoundedRect(-descBoxW / 2, descBoxY, descBoxW, 42, 7);
          descBox.lineStyle(1.4, aiDesc.fillColor, 0.55);
          descBox.strokeRoundedRect(-descBoxW / 2, descBoxY, descBoxW, 42, 7);

          const descTxt = this.add
            .text(0, descBoxY + 21, aiDesc.summary, {
              fontFamily: "'Segoe UI', 'Inter', sans-serif",
              fontSize: isMobile ? '11.5px' : '11px',
              fontStyle: '800',
              color: aiDesc.textHex,
              align: 'center',
              wordWrap: { width: descBoxW - 16 },
            })
            .setOrigin(0.5, 0.5);

          slotRoot.add([descBox, descTxt]);
        } else if (isMobile) {
          const isOpposite2P = i === 1 && !s.playerIsAI[0] && !s.playerIsAI[1];
          const boxW = 352;
          const mobileBox = this.add.graphics();
          mobileBox.fillStyle(i === 0 ? 0xe8f5e9 : 0xe3f2fd, 1);
          mobileBox.fillRoundedRect(-boxW / 2, 52, boxW, 96, 9);
          mobileBox.lineStyle(1.8, palette.primary, 0.65);
          mobileBox.strokeRoundedRect(-boxW / 2, 52, boxW, 96, 9);

          const mobileTitle = this.add
            .text(
              0,
              76,
              i === 0
                ? '✦ CỤM ĐIỀU KHIỂN CẠNH TRÁI'
                : '✦ CỤM ĐỐI DIỆN (CẠNH PHẢI)',
              {
                fontFamily: "'Segoe UI', 'Inter', sans-serif",
                fontSize: '13px',
                fontStyle: '900',
                color: palette.primaryHex,
              },
            )
            .setOrigin(0.5, 0.5);

          const mobileDesc = this.add
            .text(
              0,
              114,
              isOpposite2P
                ? 'Ngồi đối diện cạnh phải điện thoại!\nCần gạt cỡ lớn + Nút Bắn xoay ngược 180°'
                : i === 0 && !s.playerIsAI[1]
                  ? 'Ngồi cạnh trái điện thoại!\nCần gạt trên + Nút Bắn & Lùi bên dưới'
                  : 'Cần Gạt Thông Minh cỡ lớn bên trái\n+ Nút Bắn & Lùi bên phải màn hình',
              {
                fontFamily: "'Segoe UI', 'Inter', sans-serif",
                fontSize: '12px',
                fontStyle: '700',
                color: UI_COLORS.inkDarkHex,
                align: 'center',
                lineSpacing: 4,
              },
            )
            .setOrigin(0.5, 0.5);

          const hint = this.add
            .text(0, 170, 'Có thể chỉnh cỡ nút & độ nhạy trong mục ⚙ Độ Nhạy', {
              fontFamily: "'Segoe UI', 'Inter', sans-serif",
              fontSize: '11.5px',
              fontStyle: '700',
              color: UI_COLORS.inkMutedHex,
            })
            .setOrigin(0.5, 0.5);

          slotRoot.add([mobileBox, mobileTitle, mobileDesc, hint]);
        } else {
          this.drawKeyCap(slotRoot, 0, 54, 54, 28, formatKeyCodeLabel(bind.forward));
          this.drawKeyCap(slotRoot, -60, 88, 54, 28, formatKeyCodeLabel(bind.left));
          this.drawKeyCap(slotRoot, 0, 88, 54, 28, formatKeyCodeLabel(bind.backward));
          this.drawKeyCap(slotRoot, 60, 88, 54, 28, formatKeyCodeLabel(bind.right));
          this.drawKeyCap(
            slotRoot,
            0,
            126,
            186,
            30,
            `BẮN: ${formatKeyCodeLabel(bind.fire)}`,
            palette.primaryHex,
          );
          const hint = this.add
            .text(0, 162, 'Điều khiển bằng bàn phím', {
              fontFamily: "'Segoe UI', 'Inter', sans-serif",
              fontSize: '11px',
              fontStyle: '700',
              color: UI_COLORS.inkMutedHex,
            })
            .setOrigin(0.5, 0.5);
          slotRoot.add(hint);
        }
      } else if (settingsManager.isTouchControlsActive()) {
        card.fillStyle(0xe4e6e9, 0.65);
        card.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
        card.lineStyle(2, 0xb8bec6, 1);
        card.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);

        const lockBadge = this.add
          .text(0, -18, `🔒 XE ${i + 1}\nKHÓA TRÊN MOBILE`, {
            fontFamily: "'Segoe UI', 'Inter', sans-serif",
            fontSize: '17px',
            fontStyle: '900',
            color: '#7A8089',
            align: 'center',
            lineSpacing: 5,
          })
          .setOrigin(0.5, 0.5);

        const lockSub = this.add
          .text(
            0,
            42,
            'Chế độ 3 & 4 Xe chỉ mở trên PC.\nTrên điện thoại tối đa 2 Xe\n(Đấu AI, 2 Người Đối Diện hoặc Online 1v1).',
            {
              fontFamily: "'Segoe UI', 'Inter', sans-serif",
              fontSize: '11.5px',
              fontStyle: '700',
              color: '#88909B',
              align: 'center',
              lineSpacing: 4,
            },
          )
          .setOrigin(0.5, 0.5);

        slotRoot.add([card, lockBadge, lockSub]);
      } else {
        card.fillStyle(0xe4e6e9, 0.75);
        card.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
        card.lineStyle(2, 0xb0b5bd, 1);
        card.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);

        const slotLbl = this.add
          .text(0, -62, `XE ${i + 1}\nCHƯA MỞ Ô`, {
            fontFamily: "'Segoe UI', 'Inter', sans-serif",
            fontSize: '18px',
            fontStyle: '800',
            color: '#7A8089',
            align: 'center',
          })
          .setOrigin(0.5, 0.5);

        const joinHumanBtn = createArcadeButton(this, {
          x: 0,
          y: 6,
          width: 186,
          height: 40,
          label: `+ THÊM NGƯỜI XE ${i + 1}`,
          fontSize: 13.5,
          fillColor: UI_COLORS.cardBg,
          onClick: () => {
            if (this.activeModal || this.activeSkillModal || this.activeRulesModal) return;
            settingsManager.setPlayerIsAI(pIdx, false);
            settingsManager.setPlayerCount((i + 1) as 3 | 4);
            this.refreshAll(i);
          },
        });

        const joinBotBtn = createArcadeButton(this, {
          x: 0,
          y: 58,
          width: 186,
          height: 40,
          label: `+ THÊM MÁY AI XE ${i + 1}`,
          fontSize: 13.5,
          fillColor: 0xe3f2fd,
          hoverColor: 0xbbdefb,
          textColor: '#0D47A1',
          onClick: () => {
            if (this.activeModal || this.activeSkillModal || this.activeRulesModal) return;
            settingsManager.setPlayerIsAI(pIdx, true);
            settingsManager.setPlayerCount((i + 1) as 3 | 4);
            this.refreshAll(i);
          },
        });

        slotRoot.add([card, slotLbl, joinHumanBtn.container, joinBotBtn.container]);
      }

      if (animateInitial) {
        slotRoot.setY(cardY + 22);
        slotRoot.setAlpha(0);
        this.tweens.add({
          targets: slotRoot,
          y: cardY,
          alpha: 1,
          delay: i * 48,
          duration: 240,
          ease: 'Back.easeOut',
        });
      } else if (pulseCardIndex === i) {
        slotRoot.setScale(0.95);
        this.tweens.add({
          targets: slotRoot,
          scaleX: 1,
          scaleY: 1,
          duration: 165,
          ease: 'Back.easeOut',
        });
      }
    }
  }

  private drawKeyCap(
    parent: Phaser.GameObjects.Container,
    x: number,
    y: number,
    w: number,
    h: number,
    label: string,
    accentHex?: string,
  ): void {
    const g = this.add.graphics();
    g.fillStyle(0xd0d4dc, 1);
    g.fillRoundedRect(x - w / 2, y - h / 2 + 2, w, h, 5);
    g.fillStyle(0xf9fafb, 1);
    g.fillRoundedRect(x - w / 2, y - h / 2, w, h, 5);
    g.lineStyle(1.8, UI_COLORS.inkDark, 0.85);
    g.strokeRoundedRect(x - w / 2, y - h / 2, w, h, 5);

    const t = this.add
      .text(x, y, label, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '12.5px',
        fontStyle: '800',
        color: accentHex ?? UI_COLORS.inkDarkHex,
      })
      .setOrigin(0.5, 0.5);

    parent.add([g, t]);
  }
}
