import Phaser from 'phaser';
import {
  AI_DIFFICULTY_DESCRIPTORS,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  formatCrateSpawnIntervalLabel,
  formatKeyCodeLabel,
  getAIDifficultyDescriptor,
  getPaletteById,
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
  private onKeyDownBound!: (e: KeyboardEvent) => void;

  constructor() {
    super('SetupScene');
  }

  private isOverlayBusy(): boolean {
    return Boolean(
      this.activeModal ||
        this.activeSkillModal ||
        this.activeRulesModal ||
        this.scoreStepper?.isEditing(),
    );
  }

  create(): void {
    this.countButtons.clear();
    this.previewTanks = [];
    this.activeModal = null;
    this.activeSkillModal = null;
    this.activeRulesModal = null;

    mobileOrientationManager.syncLayout();
    drawMazeBackdrop(this, DESIGN_WIDTH, DESIGN_HEIGHT);
    const fsControls = createMobileFullscreenControls(this, {
      buttonX: DESIGN_WIDTH - 96,
      buttonY: 46,
      showRecommendationBanner: false,
    });

    const header = this.add
      .text(DESIGN_WIDTH / 2, 46, 'SẢNH CHỌN XE TĂNG, ĐỘ KHÓ AI & LUẬT ĐẤU', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '28px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0.5, 0.5);

    const counts: Array<2 | 3 | 4> = [2, 3, 4];
    counts.forEach((cnt, idx) => {
      const btn = createArcadeButton(this, {
        x: DESIGN_WIDTH / 2 + (idx - 1) * 156,
        y: 102,
        width: 142,
        height: 40,
        label: `${cnt} XE ĐẤU`,
        fontSize: 15,
        onClick: () => {
          if (this.activeModal || this.activeSkillModal || this.activeRulesModal) return;
          this.scoreStepper?.commitAndStopEditing();
          settingsManager.setPlayerCount(cnt);
          this.refreshAll( cnt - 1 );
        },
      });
      this.countButtons.set(cnt, btn);
    });

    this.cardsContainer = this.add.container(0, 0);

    const s = settingsManager.getSettings();
    const initialMode = MAP_MODES.find((m) => m.id === s.mapMode) ?? MAP_MODES[0];

    const mapPrevBtn = createArcadeButton(this, {
      x: 92,
      y: 590,
      width: 36,
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
      x: 274,
      y: 590,
      width: 318,
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
      x: 456,
      y: 590,
      width: 36,
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
      .text(274, 624, initialMode.subtitle, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '12px',
        fontStyle: '600',
        color: UI_COLORS.inkMutedHex,
      })
      .setOrigin(0.5, 0.5);

    this.scoreStepper = createScoreStepper(this, {
      x: 656,
      y: 590,
      width: 332,
      height: 44,
      value: s.winningScore,
      onChange: (nextScore) => {
        settingsManager.setWinningScore(nextScore);
      },
    });

    const scoreHint = this.add
      .text(656, 624, 'Bấm ◀/▶, bấm vào ô để gõ điểm, hoặc ∞ Vô Tận', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '12px',
        fontStyle: '600',
        color: UI_COLORS.inkMutedHex,
      })
      .setOrigin(0.5, 0.5);

    this.rulesBtn = createArcadeButton(this, {
      x: 900,
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
      x: 1034,
      y: 590,
      width: 118,
      height: 44,
      label: settingsManager.isTouchControlsActive() ? 'ĐỘ NHẠY LÁI' : 'ĐỔI PHÍM',
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
      x: 1164,
      y: 590,
      width: 118,
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

    const backBtn = createArcadeButton(this, {
      x: 250,
      y: 696,
      width: 196,
      height: 52,
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
      x: DESIGN_WIDTH / 2 + 95,
      y: 696,
      width: 360,
      height: 56,
      lipHeight: 5,
      label: 'BẮT ĐẦU TRẬN ĐẤU →',
      fontSize: 21,
      fillColor: 0x43a047,
      hoverColor: 0x4caf50,
      textColor: '#FFFFFF',
      onClick: () => {
        if (this.activeModal || this.activeSkillModal || this.activeRulesModal) return;
        this.scoreStepper?.commitAndStopEditing();
        this.scene.start('GameScene', { freshMatch: true });
      },
    });

    this.refreshAll(undefined, true);

    animateStaggeredEntrance(
      this,
      [
        header,
        ...Array.from(this.countButtons.values()).map((b) => b.container),
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
        this.scene.start('GameScene', { freshMatch: true });
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
  }

  private rebuildPlayerCards(pulseCardIndex?: number, animateInitial = false): void {
    this.cardsContainer.removeAll(true);
    this.previewTanks = [];

    const s = settingsManager.getSettings();
    const cardW = 266;
    const cardH = 382;
    const startX = DESIGN_WIDTH / 2 - 1.5 * 288;
    const cardY = 342;

    for (let i = 0; i < 4; i++) {
      const pIdx = i as PlayerIndex;
      const cx = startX + i * 288;
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
            fontSize: '18px',
            fontStyle: '900',
            color: '#FFFFFF',
          })
          .setOrigin(0.5, 0.5);

        const ring = this.add
          .circle(0, -94, 38, isAI ? 0xe3f2fd : 0xf3f4f6, 1)
          .setStrokeStyle(2.2, isAI ? aiDesc.fillColor : 0xd5d8de, 1);
        const tankSprite = this.add
          .image(0, -94, `tank_${palette.id}_0`)
          .setScale(1.12)
          .setRotation(-Math.PI / 4 + i * 0.5);
        this.previewTanks.push(tankSprite);

        const colorBtn = createArcadeButton(this, {
          x: 0,
          y: -32,
          width: 210,
          height: 33,
          lipHeight: 3,
          label: `◀  ${palette.name.toUpperCase()}  ▶`,
          fontSize: 13.5,
          fillColor: UI_COLORS.cardAltBg,
          onClick: () => {
            if (this.activeModal || this.activeSkillModal || this.activeRulesModal) return;
            settingsManager.cyclePlayerColor(pIdx, 1);
            this.rebuildPlayerCards(i);
          },
        });

        const modeToggleBtn = createArcadeButton(this, {
          x: 0,
          y: 10,
          width: 210,
          height: 34,
          lipHeight: 3,
          label: isAI ? '🤖 CHẾ ĐỘ: MÁY AI (TẮT)' : '👤 NGƯỜI CHƠI  •  BẬT AI',
          fontSize: 12.5,
          fillColor: isAI ? 0x1d2430 : UI_COLORS.cardBg,
          hoverColor: isAI ? 0x2b3648 : 0xe8f0fe,
          textColor: isAI ? '#40C4FF' : UI_COLORS.inkDarkHex,
          onClick: () => {
            if (this.activeModal || this.activeSkillModal || this.activeRulesModal) return;
            settingsManager.togglePlayerIsAI(pIdx);
            this.rebuildPlayerCards(i);
          },
        });

        slotRoot.add([title, ring, tankSprite, colorBtn.container, modeToggleBtn.container]);

        if (isAI) {
          const aiHdr = this.add
            .text(0, 42, 'CHỌN 4 CẤP ĐỘ AI:', {
              fontFamily: "'Segoe UI', 'Inter', sans-serif",
              fontSize: '11.5px',
              fontStyle: '900',
              color: UI_COLORS.inkMutedHex,
            })
            .setOrigin(0.5, 0.5);
          slotRoot.add(aiHdr);

          AI_DIFFICULTY_DESCRIPTORS.forEach((dDesc, dIdx) => {
            const col = dIdx % 2;
            const row = Math.floor(dIdx / 2);
            const bx = col === 0 ? -56 : 56;
            const by = 70 + row * 38;
            const selected = dDesc.id === aiDiff;

            const dBtn = createArcadeButton(this, {
              x: bx,
              y: by,
              width: 104,
              height: 31,
              lipHeight: 2.5,
              label: dDesc.label,
              fontSize: 12.5,
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

          const descBox = this.add.graphics();
          descBox.fillStyle(aiDesc.fillColor, 0.11);
          descBox.fillRoundedRect(-114, 134, 228, 42, 7);
          descBox.lineStyle(1.4, aiDesc.fillColor, 0.55);
          descBox.strokeRoundedRect(-114, 134, 228, 42, 7);

          const descTxt = this.add
            .text(0, 155, aiDesc.summary, {
              fontFamily: "'Segoe UI', 'Inter', sans-serif",
              fontSize: '11px',
              fontStyle: '800',
              color: aiDesc.textHex,
              align: 'center',
              wordWrap: { width: 214 },
            })
            .setOrigin(0.5, 0.5);

          slotRoot.add([descBox, descTxt]);
        } else if (settingsManager.isTouchControlsActive()) {
          const isOpposite2P = i === 1 && !s.playerIsAI[0] && !s.playerIsAI[1];
          const mobileBox = this.add.graphics();
          mobileBox.fillStyle(i === 0 ? 0xe8f5e9 : 0xe3f2fd, 1);
          mobileBox.fillRoundedRect(-114, 48, 228, 92, 9);
          mobileBox.lineStyle(1.8, palette.primary, 0.65);
          mobileBox.strokeRoundedRect(-114, 48, 228, 92, 9);

          const mobileTitle = this.add
            .text(
              0,
              74,
              i === 0
                ? '📱 CỤM ĐIỀU KHIỂN BÊN TRÁI'
                : '📱 CỤM ĐỐI DIỆN (BÊN PHẢI)',
              {
                fontFamily: "'Segoe UI', 'Inter', sans-serif",
                fontSize: '12px',
                fontStyle: '900',
                color: palette.primaryHex,
              },
            )
            .setOrigin(0.5, 0.5);

          const mobileDesc = this.add
            .text(
              0,
              108,
              isOpposite2P
                ? 'Ngồi đối diện cạnh phải điện thoại!\nCần gạt + Nút Bắn xoay ngược 180°'
                : i === 0 && !s.playerIsAI[1]
                  ? 'Ngồi cạnh trái điện thoại!\nCần gạt trên + Nút Bắn dưới'
                  : 'Cần Gạt Thông Minh bên trái\n+ Nút Bắn & Lùi bên phải',
              {
                fontFamily: "'Segoe UI', 'Inter', sans-serif",
                fontSize: '11px',
                fontStyle: '700',
                color: UI_COLORS.inkDarkHex,
                align: 'center',
                lineSpacing: 4,
              },
            )
            .setOrigin(0.5, 0.5);

          const hint = this.add
            .text(0, 162, 'Tự động nhận diện cảm ứng Mobile', {
              fontFamily: "'Segoe UI', 'Inter', sans-serif",
              fontSize: '11px',
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
