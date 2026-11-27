import Phaser from 'phaser';
import {
  ALL_SKILL_IDS,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  formatCrateSpawnIntervalLabel,
  getAIDifficultyDescriptor,
  getAITacticDescriptor,
  getBattleModeDescriptor,
  getPaletteById,
  normalizeCrateSpawnInterval,
  parseCustomIntervalInput,
  POWERUP_CONFIG,
  SKILL_DESCRIPTORS,
  stepCrateSpawnInterval,
  UI_COLORS,
} from '../../game/config/constants';
import { audioManager } from '../../game/managers/AudioManager';
import { settingsManager } from '../../game/managers/SettingsManager';
import { MAP_MODES } from '../../game/maps/mapDefinitions';
import type { PlayerIndex, SkillId } from '../../game/types/gameTypes';
import {
  animateModalOpen,
  createArcadeButton,
  createScoreStepper,
  type ArcadeButtonHandle,
  type ScoreStepperHandle,
} from './ArcadeWidgets';

export interface MatchRulesModalOptions {
  inMatch?: boolean;
  onRulesChanged?: () => void;
  onDropCrateNow?: () => boolean;
  onClose: () => void;
}

export class MatchRulesModal {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly contentRoot: Phaser.GameObjects.Container;
  private readonly inMatch: boolean;
  private readonly onRulesChanged?: () => void;
  private readonly onDropCrateNow?: () => boolean;
  private readonly onCloseCallback: () => void;

  private scoreStepper: ScoreStepperHandle | null = null;
  private maxCratesBtn!: ArcadeButtonHandle;
  private mapBtn!: ArcadeButtonHandle;
  private battleModeBtn!: ArcadeButtonHandle;
  private aiTacticBtn!: ArcadeButtonHandle;
  private statusText!: Phaser.GameObjects.Text;

  private aiSlotButtons: Array<{
    toggleBtn: ArcadeButtonHandle;
    diffBtn: ArcadeButtonHandle;
  }> = [];

  private skillChips: Map<
    SkillId,
    {
      bg: Phaser.GameObjects.Graphics;
      badge: Phaser.GameObjects.Text;
      cx: number;
      cy: number;
    }
  > = new Map();

  private intervalEditing = false;
  private intervalBuffer = '';
  private freshIntervalOpen = false;
  private lastPositiveInterval = 20;
  private intervalCenterLip!: Phaser.GameObjects.Graphics;
  private intervalCenterBox!: Phaser.GameObjects.Graphics;
  private intervalCenterLabel!: Phaser.GameObjects.Text;
  private intervalCenterZone!: Phaser.GameObjects.Zone;
  private intervalOffBtn!: ArcadeButtonHandle;
  private intervalPresetBtns: Map<number, ArcadeButtonHandle> = new Map();

  private closed = false;
  private readonly onWindowKeyDownBound: (e: KeyboardEvent) => void;
  private readonly onScenePointerDownBound: (
    pointer: Phaser.Input.Pointer,
    over: Phaser.GameObjects.GameObject[],
  ) => void;

  constructor(scene: Phaser.Scene, opts: MatchRulesModalOptions) {
    this.scene = scene;
    this.inMatch = Boolean(opts.inMatch);
    this.onRulesChanged = opts.onRulesChanged;
    this.onDropCrateNow = opts.onDropCrateNow;
    this.onCloseCallback = opts.onClose;
    this.container = scene.add.container(0, 0).setDepth(215);
    this.contentRoot = scene.add.container(0, 0);

    const curInterval = settingsManager.getSettings().powerUpSpawnIntervalSec;
    if (curInterval > 0) this.lastPositiveInterval = curInterval;

    this.onWindowKeyDownBound = (e: KeyboardEvent) => this.handleWindowKeyDown(e);
    this.onScenePointerDownBound = (_p, over) => {
      if (this.intervalEditing && !over.includes(this.intervalCenterZone)) {
        this.stopIntervalEditing(true);
      }
    };
    window.addEventListener('keydown', this.onWindowKeyDownBound, true);
    scene.input.on('pointerdown', this.onScenePointerDownBound);

    this.build();
  }

  private build(): void {
    const scrim = this.scene.add
      .rectangle(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT, 0x101216, 0.62)
      .setInteractive();

    const panelW = 1020;
    const panelH = 686;
    const px = DESIGN_WIDTH / 2;
    const py = DESIGN_HEIGHT / 2;
    const topY = py - panelH / 2;

    const panel = this.scene.add.graphics();
    panel.fillStyle(0x1d1f22, 0.28);
    panel.fillRoundedRect(px - panelW / 2 + 5, topY + 7, panelW, panelH, 14);
    panel.fillStyle(UI_COLORS.cardBg, 1);
    panel.fillRoundedRect(px - panelW / 2, topY, panelW, panelH, 14);
    panel.fillStyle(0x1565c0, 1);
    panel.fillRoundedRect(px - panelW / 2, topY, panelW, 50, {
      tl: 14,
      tr: 14,
      bl: 0,
      br: 0,
    });
    panel.lineStyle(3, UI_COLORS.inkDark, 1);
    panel.strokeRoundedRect(px - panelW / 2, topY, panelW, panelH, 14);

    const title = this.scene.add
      .text(
        px,
        topY + 25,
        this.inMatch
          ? '⚙ LUẬT CHƠI & ĐỘ KHÓ AI TRỰC TIẾP (ÁP DỤNG NGAY)'
          : '⚙ TÙY CHỈNH LUẬT CHƠI, POWER-UP & AI',
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '21px',
          fontStyle: '900',
          color: '#FFFFFF',
        },
      )
      .setOrigin(0.5, 0.5);

    this.container.add([scrim, this.contentRoot]);
    this.contentRoot.add([panel, title]);

    // Row 1 (`topY + 86`): Crate Spawn Interval + Quick Presets + Drop Crate Now
    this.buildCrateIntervalRow(px, topY + 86);

    // Row 2 (`topY + 146`): Max Crates + Score Goal
    this.buildCrateLimitAndScoreRow(px, topY + 146);

    // Row 3 (`topY + 204`): Live Per-Tank Human / AI + 4-Tier Difficulty Controls!
    this.buildLiveAISlotsRow(px, topY + 204);

    // Row 4 (`topY + 262`): Map Mode Selector
    this.buildMapSelectorRow(px, topY + 262);

    // Row 5 (`topY + 306..584`): 10 Superhero Skills Enable/Disable Matrix
    this.buildSkillsToggleMatrix(px, topY + 308);

    this.statusText = this.scene.add
      .text(
        px,
        topY + panelH - 68,
        this.inMatch
          ? 'Chỉnh chu kỳ thùng gỗ, điểm thắng, kỹ năng rơi và cả Người/AI 4 cấp độ ngay giữa trận đấu!'
          : 'Bấm vào ô giây để gõ số tùy ý (0 = Tắt Power-Up), chỉnh Người/AI hoặc bật/tắt từng kỹ năng.',
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '13px',
          fontStyle: '700',
          color: UI_COLORS.inkMutedHex,
        },
      )
      .setOrigin(0.5, 0.5);
    this.contentRoot.add(this.statusText);

    const resetBtn = createArcadeButton(this.scene, {
      x: px - 150,
      y: topY + panelH - 30,
      width: 230,
      height: 40,
      label: 'ĐẶT LẠI MẶC ĐỊNH',
      fontSize: 14,
      fillColor: UI_COLORS.cardAltBg,
      hoverColor: 0xdcdfe4,
      onClick: () => {
        this.commitAllEdits();
        settingsManager.setPowerUpSpawnIntervalSec(POWERUP_CONFIG.spawnIntervalSec);
        settingsManager.setMaxCratesOnFloor(POWERUP_CONFIG.maxCratesOnFloor);
        settingsManager.setAllSkillsEnabled(true);
        settingsManager.setWinningScore(5);
        settingsManager.setBattleMode('classic');
        settingsManager.setTntBarrelsOption('auto');
        settingsManager.setAITactic('balanced');
        this.scoreStepper?.setValue(5);
        this.refreshAllControls();
        this.onRulesChanged?.();
        this.statusText.setText('Đã khôi phục luật mặc định: Thùng gỗ 20s • Tối đa 4 thùng • Đủ 10 kỹ năng.');
      },
    });

    const closeBtn = createArcadeButton(this.scene, {
      x: px + 140,
      y: topY + panelH - 30,
      width: 230,
      height: 40,
      label: this.inMatch ? 'ÁP DỤNG & QUAY LẠI' : 'HOÀN TẤT (ESC)',
      fontSize: 15,
      fillColor: 0x43a047,
      hoverColor: 0x4caf50,
      textColor: '#FFFFFF',
      onClick: () => this.close(),
    });

    this.contentRoot.add([resetBtn.container, closeBtn.container]);
    this.refreshAllControls();
    animateModalOpen(this.scene, scrim, this.contentRoot);
  }

  private buildCrateIntervalRow(centerX: number, y: number): void {
    const rowBg = this.scene.add.graphics();
    rowBg.fillStyle(0xf4f6f9, 1);
    rowBg.fillRoundedRect(centerX - 480, y - 25, 960, 50, 10);
    rowBg.lineStyle(1.6, 0xd5dae2, 1);
    rowBg.strokeRoundedRect(centerX - 480, y - 25, 960, 50, 10);

    const lbl = this.scene.add
      .text(centerX - 462, y, 'CHU KỲ RƠI THÙNG:', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '13.5px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0, 0.5);

    this.contentRoot.add([rowBg, lbl]);

    const decBtn = createArcadeButton(this.scene, {
      x: centerX - 252,
      y,
      width: 34,
      height: 36,
      lipHeight: 2.5,
      label: '◀',
      fontSize: 13,
      fillColor: UI_COLORS.cardAltBg,
      onClick: () => {
        this.commitAllEdits();
        const cur = settingsManager.getSettings().powerUpSpawnIntervalSec;
        this.applyInterval(stepCrateSpawnInterval(cur, -1));
      },
    });

    const boxX = centerX - 138;
    const boxW = 180;
    const boxH = 36;
    this.intervalCenterLip = this.scene.add.graphics();
    this.intervalCenterBox = this.scene.add.graphics();
    this.intervalCenterLabel = this.scene.add
      .text(boxX, y, '', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '13px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0.5, 0.5);

    this.intervalCenterZone = this.scene.add
      .zone(boxX, y, boxW, boxH + 3)
      .setOrigin(0.5, 0.5)
      .setInteractive({ useHandCursor: true });

    this.intervalCenterZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      pointer.event?.stopPropagation?.();
      this.scoreStepper?.commitAndStopEditing();
      if (!this.intervalEditing) {
        const cur = settingsManager.getSettings().powerUpSpawnIntervalSec;
        this.intervalEditing = true;
        this.freshIntervalOpen = true;
        this.intervalBuffer = String(cur);
        audioManager.playUiClick(true);
        this.refreshIntervalDisplay();
      }
    });

    const incBtn = createArcadeButton(this.scene, {
      x: centerX - 24,
      y,
      width: 34,
      height: 36,
      lipHeight: 2.5,
      label: '▶',
      fontSize: 13,
      fillColor: UI_COLORS.cardAltBg,
      onClick: () => {
        this.commitAllEdits();
        const cur = settingsManager.getSettings().powerUpSpawnIntervalSec;
        this.applyInterval(stepCrateSpawnInterval(cur, 1));
      },
    });

    this.intervalOffBtn = createArcadeButton(this.scene, {
      x: centerX + 32,
      y,
      width: 62,
      height: 36,
      lipHeight: 2.5,
      label: 'TẮT',
      fontSize: 12.5,
      fillColor: UI_COLORS.cardBg,
      onClick: () => {
        this.commitAllEdits();
        const cur = settingsManager.getSettings().powerUpSpawnIntervalSec;
        this.applyInterval(cur === 0 ? this.lastPositiveInterval : 0);
      },
    });

    this.contentRoot.add([
      decBtn.container,
      this.intervalCenterLip,
      this.intervalCenterBox,
      this.intervalCenterLabel,
      this.intervalCenterZone,
      incBtn.container,
      this.intervalOffBtn.container,
    ]);

    const presets = [5, 10, 20, 30];
    presets.forEach((sec, idx) => {
      const pBtn = createArcadeButton(this.scene, {
        x: centerX + 102 + idx * 54,
        y,
        width: 48,
        height: 34,
        lipHeight: 2.5,
        label: `${sec}s`,
        fontSize: 12.5,
        fillColor: UI_COLORS.cardBg,
        onClick: () => {
          this.commitAllEdits();
          this.applyInterval(sec);
        },
      });
      this.intervalPresetBtns.set(sec, pBtn);
      this.contentRoot.add(pBtn.container);
    });

    if (this.inMatch && this.onDropCrateNow) {
      const dropNowBtn = createArcadeButton(this.scene, {
        x: centerX + 388,
        y,
        width: 158,
        height: 36,
        lipHeight: 2.5,
        label: '📦 THẢ THÙNG NGAY',
        fontSize: 12.5,
        fillColor: 0xfff8e1,
        hoverColor: 0xffecb3,
        textColor: '#E65100',
        onClick: () => {
          this.commitAllEdits();
          const ok = this.onDropCrateNow?.() ?? false;
          this.statusText.setText(
            ok
              ? 'Đã thả ngay 1 Thùng Gỗ Bí Ẩn xuống đấu trường!'
              : 'Sân đã đạt giới hạn tối đa số thùng gỗ trên mặt đất!',
          );
        },
      });
      this.contentRoot.add(dropNowBtn.container);
    }
  }

  private buildCrateLimitAndScoreRow(centerX: number, y: number): void {
    const rowBg = this.scene.add.graphics();
    rowBg.fillStyle(0xf4f6f9, 1);
    rowBg.fillRoundedRect(centerX - 480, y - 24, 960, 48, 10);
    rowBg.lineStyle(1.6, 0xd5dae2, 1);
    rowBg.strokeRoundedRect(centerX - 480, y - 24, 960, 48, 10);
    this.contentRoot.add(rowBg);

    const limitLbl = this.scene.add
      .text(centerX - 462, y, 'GIỚI HẠN THÙNG SÂN:', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '13.5px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0, 0.5);

    const decLimit = createArcadeButton(this.scene, {
      x: centerX - 252,
      y,
      width: 34,
      height: 36,
      lipHeight: 2.5,
      label: '◀',
      fontSize: 13,
      fillColor: UI_COLORS.cardAltBg,
      onClick: () => {
        this.commitAllEdits();
        const cur = settingsManager.getSettings().maxCratesOnFloor;
        settingsManager.setMaxCratesOnFloor(cur <= 1 ? 12 : cur - 1);
        this.refreshAllControls();
        this.onRulesChanged?.();
      },
    });

    this.maxCratesBtn = createArcadeButton(this.scene, {
      x: centerX - 148,
      y,
      width: 162,
      height: 36,
      lipHeight: 2.5,
      label: 'TỐI ĐA: 4 THÙNG',
      fontSize: 13,
      fillColor: UI_COLORS.cardBg,
      onClick: () => {
        this.commitAllEdits();
        const cur = settingsManager.getSettings().maxCratesOnFloor;
        settingsManager.setMaxCratesOnFloor(cur >= 12 ? 1 : cur + 1);
        this.refreshAllControls();
        this.onRulesChanged?.();
      },
    });

    const incLimit = createArcadeButton(this.scene, {
      x: centerX - 44,
      y,
      width: 34,
      height: 36,
      lipHeight: 2.5,
      label: '▶',
      fontSize: 13,
      fillColor: UI_COLORS.cardAltBg,
      onClick: () => {
        this.commitAllEdits();
        const cur = settingsManager.getSettings().maxCratesOnFloor;
        settingsManager.setMaxCratesOnFloor(cur >= 12 ? 1 : cur + 1);
        this.refreshAllControls();
        this.onRulesChanged?.();
      },
    });

    const scoreLbl = this.scene.add
      .text(centerX + 8, y, 'ĐIỂM THẮNG:', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '13.5px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0, 0.5);

    this.scoreStepper = createScoreStepper(this.scene, {
      x: centerX + 294,
      y,
      width: 344,
      height: 36,
      value: settingsManager.getSettings().winningScore,
      compact: true,
      onInteract: () => {
        if (this.intervalEditing) this.stopIntervalEditing(true);
      },
      onChange: (next) => {
        settingsManager.setWinningScore(next);
        this.onRulesChanged?.();
      },
    });

    this.contentRoot.add([
      limitLbl,
      decLimit.container,
      this.maxCratesBtn.container,
      incLimit.container,
      scoreLbl,
      this.scoreStepper.container,
    ]);
  }

  private buildLiveAISlotsRow(centerX: number, y: number): void {
    const rowBg = this.scene.add.graphics();
    rowBg.fillStyle(0xf4f6f9, 1);
    rowBg.fillRoundedRect(centerX - 480, y - 24, 960, 48, 10);
    rowBg.lineStyle(1.6, 0xd5dae2, 1);
    rowBg.strokeRoundedRect(centerX - 480, y - 24, 960, 48, 10);

    const lbl = this.scene.add
      .text(centerX - 462, y, 'CHẾ ĐỘ & ĐỘ KHÓ AI:', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '13.5px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0, 0.5);

    this.contentRoot.add([rowBg, lbl]);

    this.aiSlotButtons = [];
    for (let i = 0; i < 4; i++) {
      const pIdx = i as PlayerIndex;
      const slotCenter = centerX - 208 + i * 192;

      const toggleBtn = createArcadeButton(this.scene, {
        x: slotCenter - 36,
        y,
        width: 92,
        height: 34,
        lipHeight: 2.5,
        label: `P${i + 1}: NGƯỜI`,
        fontSize: 11.5,
        fillColor: UI_COLORS.cardBg,
        onClick: () => {
          this.commitAllEdits();
          settingsManager.togglePlayerIsAI(pIdx);
          this.refreshAllControls();
          this.onRulesChanged?.();
        },
      });

      const diffBtn = createArcadeButton(this.scene, {
        x: slotCenter + 54,
        y,
        width: 80,
        height: 34,
        lipHeight: 2.5,
        label: 'THƯỜNG',
        fontSize: 11,
        fillColor: UI_COLORS.cardAltBg,
        onClick: () => {
          this.commitAllEdits();
          if (!settingsManager.getSettings().playerIsAI[pIdx]) {
            settingsManager.setPlayerIsAI(pIdx, true);
          } else {
            settingsManager.cyclePlayerAIDifficulty(pIdx, 1);
          }
          this.refreshAllControls();
          this.onRulesChanged?.();
        },
      });

      this.aiSlotButtons.push({ toggleBtn, diffBtn });
      this.contentRoot.add([toggleBtn.container, diffBtn.container]);
    }
  }

  private buildMapSelectorRow(centerX: number, y: number): void {
    const rowBg = this.scene.add.graphics();
    rowBg.fillStyle(0xf4f6f9, 1);
    rowBg.fillRoundedRect(centerX - 480, y - 23, 960, 46, 10);
    rowBg.lineStyle(1.6, 0xd5dae2, 1);
    rowBg.strokeRoundedRect(centerX - 480, y - 23, 960, 46, 10);

    const mapLbl = this.scene.add
      .text(centerX - 462, y, 'BẢN ĐỒ:', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '13px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0, 0.5);

    const cycleMap = (dir: 1 | -1) => {
      this.commitAllEdits();
      const cur = settingsManager.getSettings().mapMode;
      const idx = Math.max(
        0,
        MAP_MODES.findIndex((m) => m.id === cur),
      );
      const next = MAP_MODES[(idx + dir + MAP_MODES.length) % MAP_MODES.length];
      settingsManager.setMapMode(next.id);
      this.refreshAllControls();
      this.onRulesChanged?.();
    };

    const prevBtn = createArcadeButton(this.scene, {
      x: centerX - 364,
      y,
      width: 32,
      height: 34,
      lipHeight: 2.5,
      label: '◀',
      fontSize: 12.5,
      fillColor: UI_COLORS.cardAltBg,
      onClick: () => cycleMap(-1),
    });

    this.mapBtn = createArcadeButton(this.scene, {
      x: centerX - 196,
      y,
      width: 288,
      height: 34,
      lipHeight: 2.5,
      label: '',
      fontSize: 12,
      fillColor: UI_COLORS.cardBg,
      onClick: () => cycleMap(1),
    });

    const nextBtn = createArcadeButton(this.scene, {
      x: centerX - 28,
      y,
      width: 32,
      height: 34,
      lipHeight: 2.5,
      label: '▶',
      fontSize: 12.5,
      fillColor: UI_COLORS.cardAltBg,
      onClick: () => cycleMap(1),
    });

    this.battleModeBtn = createArcadeButton(this.scene, {
      x: centerX + 132,
      y,
      width: 268,
      height: 34,
      lipHeight: 2.5,
      label: '',
      fontSize: 12,
      fillColor: 0xfff8e1,
      hoverColor: 0xffecb3,
      onClick: () => {
        this.commitAllEdits();
        settingsManager.cycleBattleMode(1);
        this.refreshAllControls();
        this.onRulesChanged?.();
      },
    });

    this.aiTacticBtn = createArcadeButton(this.scene, {
      x: centerX + 374,
      y,
      width: 196,
      height: 34,
      lipHeight: 2.5,
      label: '',
      fontSize: 12,
      fillColor: 0xe3f2fd,
      hoverColor: 0xbbdefb,
      textColor: '#0D47A1',
      onClick: () => {
        this.commitAllEdits();
        settingsManager.cycleAITactic(1);
        this.refreshAllControls();
        this.onRulesChanged?.();
      },
    });

    this.contentRoot.add([
      rowBg,
      mapLbl,
      prevBtn.container,
      this.mapBtn.container,
      nextBtn.container,
      this.battleModeBtn.container,
      this.aiTacticBtn.container,
    ]);
  }

  private buildSkillsToggleMatrix(centerX: number, topY: number): void {
    const hdr = this.scene.add
      .text(centerX - 476, topY + 6, 'BỘ 10 KỸ NĂNG RƠI TRONG THÙNG GỖ (BẤM ĐỂ BẬT / TẮT):', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '13.5px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0, 0.5);

    const enableAllBtn = createArcadeButton(this.scene, {
      x: centerX + 286,
      y: topY + 6,
      width: 118,
      height: 28,
      lipHeight: 2,
      label: 'BẬT TẤT CẢ',
      fontSize: 11.5,
      fillColor: 0xe8f5e9,
      hoverColor: 0xc8e6c9,
      textColor: '#1B5E20',
      onClick: () => {
        this.commitAllEdits();
        settingsManager.setAllSkillsEnabled(true);
        this.refreshAllControls();
        this.onRulesChanged?.();
      },
    });

    const disableAllBtn = createArcadeButton(this.scene, {
      x: centerX + 414,
      y: topY + 6,
      width: 112,
      height: 28,
      lipHeight: 2,
      label: 'TẮT TẤT CẢ',
      fontSize: 11.5,
      fillColor: 0xffebee,
      hoverColor: 0xffcdd2,
      textColor: UI_COLORS.dangerRedHex,
      onClick: () => {
        this.commitAllEdits();
        settingsManager.setAllSkillsEnabled(false);
        this.refreshAllControls();
        this.onRulesChanged?.();
      },
    });

    this.contentRoot.add([hdr, enableAllBtn.container, disableAllBtn.container]);

    const cols = 5;
    const chipW = 182;
    const chipH = 88;
    const gapX = 11;
    const gapY = 10;
    const gridW = cols * chipW + (cols - 1) * gapX;
    const startX = centerX - gridW / 2 + chipW / 2;
    const startY = topY + 72;

    SKILL_DESCRIPTORS.forEach((desc, idx) => {
      const col = idx % cols;
      const row = Math.floor(idx / cols);
      const cx = startX + col * (chipW + gapX);
      const cy = startY + row * (chipH + gapY);

      const bg = this.scene.add.graphics();
      const icon = this.scene.add.image(cx - 58, cy - 8, `skill_emblem_${desc.id}`).setScale(0.72);
      const nameTxt = this.scene.add
        .text(cx - 26, cy - 18, desc.hudShort, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '12.5px',
          fontStyle: '900',
          color: UI_COLORS.inkDarkHex,
        })
        .setOrigin(0, 0.5);

      const weightTxt = this.scene.add
        .text(cx - 26, cy + 2, `Tỉ lệ gốc: ${desc.dropPercent}%`, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11px',
          fontStyle: '700',
          color: UI_COLORS.inkMutedHex,
        })
        .setOrigin(0, 0.5);

      const badge = this.scene.add
        .text(cx, cy + 28, '✓ ĐANG BẬT', {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11.5px',
          fontStyle: '900',
          color: '#1B5E20',
        })
        .setOrigin(0.5, 0.5);

      const zone = this.scene.add
        .zone(cx, cy, chipW, chipH)
        .setOrigin(0.5, 0.5)
        .setInteractive({ useHandCursor: true });

      zone.on('pointerdown', () => {
        this.commitAllEdits();
        audioManager.playUiClick(false);
        settingsManager.toggleSkillEnabled(desc.id);
        this.refreshAllControls();
        this.onRulesChanged?.();
      });

      this.skillChips.set(desc.id, { bg, badge, cx, cy });
      this.contentRoot.add([bg, icon, nameTxt, weightTxt, badge, zone]);
    });
  }

  private applyInterval(nextSec: number): void {
    const norm = normalizeCrateSpawnInterval(nextSec);
    if (norm > 0) this.lastPositiveInterval = norm;
    settingsManager.setPowerUpSpawnIntervalSec(norm);
    this.refreshAllControls();
    this.onRulesChanged?.();
  }

  private stopIntervalEditing(commit: boolean): void {
    if (!this.intervalEditing) return;
    this.intervalEditing = false;
    this.freshIntervalOpen = false;
    if (commit) {
      const cur = settingsManager.getSettings().powerUpSpawnIntervalSec;
      const next = parseCustomIntervalInput(this.intervalBuffer, cur);
      this.applyInterval(next);
    } else {
      this.refreshIntervalDisplay();
    }
  }

  private commitAllEdits(): void {
    if (this.intervalEditing) this.stopIntervalEditing(true);
    this.scoreStepper?.commitAndStopEditing();
  }

  private refreshIntervalDisplay(): void {
    const s = settingsManager.getSettings();
    const cur = s.powerUpSpawnIntervalSec;
    const boxX = DESIGN_WIDTH / 2 - 138;
    const boxY = DESIGN_HEIGHT / 2 - 686 / 2 + 86;
    const boxW = 180;
    const boxH = 36;

    this.intervalCenterLip.clear();
    this.intervalCenterBox.clear();
    this.intervalCenterLip.fillStyle(UI_COLORS.inkDark, 1);
    this.intervalCenterLip.fillRoundedRect(boxX - boxW / 2, boxY - boxH / 2 + 3, boxW, boxH, 8);

    const fill = this.intervalEditing ? 0xfff8e1 : cur === 0 ? 0xffebee : UI_COLORS.cardBg;
    const stroke = this.intervalEditing ? 0xfb8c00 : UI_COLORS.inkDark;
    this.intervalCenterBox.fillStyle(fill, 1);
    this.intervalCenterBox.fillRoundedRect(boxX - boxW / 2, boxY - boxH / 2, boxW, boxH, 8);
    this.intervalCenterBox.lineStyle(2.3, stroke, 1);
    this.intervalCenterBox.strokeRoundedRect(boxX - boxW / 2, boxY - boxH / 2, boxW, boxH, 8);

    if (this.intervalEditing) {
      this.intervalCenterLabel
        .setText(`NHẬP GIÂY: ${this.intervalBuffer}▌`)
        .setColor('#E65100');
    } else {
      this.intervalCenterLabel
        .setText(formatCrateSpawnIntervalLabel(cur))
        .setColor(cur === 0 ? UI_COLORS.dangerRedHex : UI_COLORS.inkDarkHex);
    }

    const isOff = cur === 0;
    this.intervalOffBtn.setFill(
      isOff ? UI_COLORS.dangerRed : UI_COLORS.cardBg,
      isOff ? 0xe53935 : 0xf4f6f8,
      isOff ? '#FFFFFF' : UI_COLORS.inkDarkHex,
    );

    for (const [sec, btn] of this.intervalPresetBtns.entries()) {
      const active = cur === sec;
      btn.setFill(
        active ? 0x1565c0 : UI_COLORS.cardBg,
        active ? 0x1976d2 : 0xf4f6f8,
        active ? '#FFFFFF' : UI_COLORS.inkDarkHex,
      );
    }
  }

  private refreshAllControls(): void {
    const s = settingsManager.getSettings();
    this.refreshIntervalDisplay();

    this.maxCratesBtn.setLabel(`TỐI ĐA: ${s.maxCratesOnFloor} THÙNG`);
    const mode = MAP_MODES.find((m) => m.id === s.mapMode) ?? MAP_MODES[0];
    this.mapBtn.setLabel(`${mode.label.toUpperCase()}`);

    const bMode = getBattleModeDescriptor(s.battleMode);
    this.battleModeBtn.setLabel(`CHẾ ĐỘ: ${bMode.shortBadge}`);
    this.battleModeBtn.setFill(bMode.bgTint, bMode.bgTint, bMode.accentHex);

    const tactic = getAITacticDescriptor(s.aiTactic);
    this.aiTacticBtn.setLabel(`AI: ${tactic.shortLabel}`);

    // Refresh Live Per-Tank Human / AI + 4-Tier Difficulty Controls
    for (let i = 0; i < 4; i++) {
      const slot = this.aiSlotButtons[i];
      if (!slot) continue;
      const active = i < s.playerCount;
      const isAI = Boolean(s.playerIsAI[i]);
      const aiDesc = getAIDifficultyDescriptor(s.playerAIDifficulty[i] ?? 'normal');
      const pal = getPaletteById(s.playerColors[i]);

      slot.toggleBtn.setEnabled(active);
      slot.diffBtn.setEnabled(active);

      if (!active) {
        slot.toggleBtn.setLabel(`P${i + 1}: ĐÓNG`);
        slot.diffBtn.setLabel('—');
      } else if (isAI) {
        slot.toggleBtn.setLabel(`P${i + 1}: 🤖 AI`);
        slot.toggleBtn.setFill(0x1d2430, 0x2b3648, '#40C4FF');
        slot.diffBtn.setLabel(aiDesc.label);
        slot.diffBtn.setFill(aiDesc.fillColor, aiDesc.hoverColor, '#FFFFFF');
      } else {
        slot.toggleBtn.setLabel(`P${i + 1}: NGƯỜI`);
        slot.toggleBtn.setFill(UI_COLORS.cardBg, 0xf0f4f8, pal.primaryHex);
        slot.diffBtn.setLabel('BẬT AI');
        slot.diffBtn.setFill(UI_COLORS.cardAltBg, 0xe3f2fd, UI_COLORS.inkMutedHex);
      }
    }

    const enabledSet = new Set<SkillId>(s.enabledSkills);
    const chipW = 182;
    const chipH = 88;

    for (const id of ALL_SKILL_IDS) {
      const chip = this.skillChips.get(id);
      if (!chip) continue;
      const on = enabledSet.has(id);
      const desc = SKILL_DESCRIPTORS.find((d) => d.id === id)!;

      chip.bg.clear();
      chip.bg.fillStyle(on ? 0xffffff : 0xe9ecef, 1);
      chip.bg.fillRoundedRect(chip.cx - chipW / 2, chip.cy - chipH / 2, chipW, chipH, 10);
      chip.bg.fillStyle(on ? desc.accentColor : 0x9aa0a8, on ? 0.16 : 0.14);
      chip.bg.fillRoundedRect(chip.cx - chipW / 2, chip.cy + chipH / 2 - 25, chipW, 25, {
        tl: 0,
        tr: 0,
        bl: 10,
        br: 10,
      });
      chip.bg.lineStyle(on ? 2.4 : 1.6, on ? desc.accentColor : 0xb0b5bd, 1);
      chip.bg.strokeRoundedRect(chip.cx - chipW / 2, chip.cy - chipH / 2, chipW, chipH, 10);

      chip.badge
        .setText(on ? '✓ ĐANG BẬT' : '✕ ĐÃ TẮT')
        .setColor(on ? desc.accentHex : '#7A8089');
    }
  }

  private handleWindowKeyDown(e: KeyboardEvent): void {
    if (this.scoreStepper?.isEditing()) return;

    if (this.intervalEditing) {
      e.preventDefault();
      e.stopPropagation();

      if (e.code === 'Enter' || e.code === 'NumpadEnter') {
        audioManager.playUiClick(false);
        this.stopIntervalEditing(true);
        return;
      }
      if (e.code === 'Escape') {
        audioManager.playUiClick(true);
        this.stopIntervalEditing(false);
        return;
      }
      if (e.code === 'Backspace') {
        if (this.freshIntervalOpen) {
          this.intervalBuffer = '';
          this.freshIntervalOpen = false;
        } else {
          this.intervalBuffer = this.intervalBuffer.slice(0, -1);
        }
        this.refreshIntervalDisplay();
        return;
      }

      let digit = '';
      if (e.code.startsWith('Digit')) digit = e.code.slice(5);
      else if (e.code.startsWith('Numpad') && e.code.length === 7) digit = e.code.slice(6);

      if (/^\d$/.test(digit)) {
        if (this.freshIntervalOpen) {
          this.intervalBuffer = digit;
          this.freshIntervalOpen = false;
        } else if (this.intervalBuffer.length < 3) {
          this.intervalBuffer =
            this.intervalBuffer === '0' ? digit : this.intervalBuffer + digit;
        }
        this.refreshIntervalDisplay();
      }
      return;
    }

    if (e.code === 'Escape' && !e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      audioManager.playUiClick(true);
      this.close();
    }
  }

  close(silent = false): void {
    if (this.closed) return;
    this.closed = true;
    this.commitAllEdits();
    this.scoreStepper?.destroy();
    this.scoreStepper = null;
    window.removeEventListener('keydown', this.onWindowKeyDownBound, true);
    this.scene.input?.off('pointerdown', this.onScenePointerDownBound);
    if (this.container.scene) {
      this.container.destroy(true);
    }
    if (!silent) {
      this.onCloseCallback();
    }
  }
}
