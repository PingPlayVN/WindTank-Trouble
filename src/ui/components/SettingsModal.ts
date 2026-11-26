import Phaser from 'phaser';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  formatKeyCodeLabel,
  getPaletteById,
  UI_COLORS,
} from '../../game/config/constants';
import { audioManager } from '../../game/managers/AudioManager';
import { settingsManager } from '../../game/managers/SettingsManager';
import type { ControlAction, PlayerIndex } from '../../game/types/gameTypes';
import {
  animateModalOpen,
  createArcadeButton,
  createScoreStepper,
  type ArcadeButtonHandle,
  type ScoreStepperHandle,
} from './ArcadeWidgets';

const ACTION_COLUMNS: Array<{ action: ControlAction; label: string }> = [
  { action: 'forward', label: 'Tiến Lên' },
  { action: 'backward', label: 'Lùi Lại' },
  { action: 'left', label: 'Quay Trái' },
  { action: 'right', label: 'Quay Phải' },
  { action: 'fire', label: 'Khai Hỏa' },
];

export interface SettingsModalOptions {
  mode: 'settings' | 'controls';
  onClose: () => void;
  onBindingsUpdated?: () => void;
  onOpenSkillGuide?: () => void;
}

export class SettingsModal {
  private readonly scene: Phaser.Scene;
  private readonly container: Phaser.GameObjects.Container;
  private readonly contentRoot: Phaser.GameObjects.Container;
  private readonly keyButtons: Array<Record<ControlAction, ArcadeButtonHandle>> = [];
  private statusText!: Phaser.GameObjects.Text;
  private scoreStepper: ScoreStepperHandle | null = null;
  private waitingTarget: { playerIndex: PlayerIndex; action: ControlAction } | null = null;
  private closed = false;
  private readonly isMobileDevice: boolean;
  private readonly onKeyCaptureBound: (e: KeyboardEvent) => void;
  private readonly onCloseCallback: () => void;
  private readonly onBindingsUpdated?: () => void;
  private readonly onOpenSkillGuide?: () => void;

  // Mobile Touch Tuning UI handles for instant reset/refresh
  private refreshMobileControlsUI: (() => void) | null = null;

  constructor(scene: Phaser.Scene, opts: SettingsModalOptions) {
    this.scene = scene;
    this.isMobileDevice = settingsManager.isTouchControlsActive();
    this.onCloseCallback = opts.onClose;
    this.onBindingsUpdated = opts.onBindingsUpdated;
    this.onOpenSkillGuide = opts.onOpenSkillGuide;
    this.container = scene.add.container(0, 0).setDepth(200);
    this.contentRoot = scene.add.container(0, 0);

    this.onKeyCaptureBound = (e: KeyboardEvent) => this.handleWindowKeyDown(e);
    window.addEventListener('keydown', this.onKeyCaptureBound, true);

    this.build(opts.mode);
  }

  private build(mode: 'settings' | 'controls'): void {
    const scrim = this.scene.add
      .rectangle(DESIGN_WIDTH / 2, DESIGN_HEIGHT / 2, DESIGN_WIDTH, DESIGN_HEIGHT, 0x111317, 0.58)
      .setInteractive();

    const panelW = 980;
    const panelH = mode === 'settings' ? 624 : 574;
    const px = DESIGN_WIDTH / 2;
    const py = DESIGN_HEIGHT / 2;

    const panel = this.scene.add.graphics();
    panel.fillStyle(0x1d1f22, 0.25);
    panel.fillRoundedRect(px - panelW / 2 + 5, py - panelH / 2 + 7, panelW, panelH, 14);
    panel.fillStyle(UI_COLORS.cardBg, 1);
    panel.fillRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, 14);
    panel.lineStyle(3, UI_COLORS.inkDark, 1);
    panel.strokeRoundedRect(px - panelW / 2, py - panelH / 2, panelW, panelH, 14);

    const headerTitle =
      mode === 'settings'
        ? this.isMobileDevice
          ? 'CÀI ĐẶT ÂM THANH, KIỂU LÁI & ĐỘ NHẠY CẢM ỨNG'
          : 'CÀI ĐẶT ÂM THANH & ĐỔI PHÍM ĐIỀU KHIỂN'
        : this.isMobileDevice
          ? 'HƯỚNG DẪN CÁCH CHƠI & ĐIỀU KHIỂN CẢM ỨNG MOBILE'
          : 'HƯỚNG DẪN CÁCH CHƠI & BẢNG PHÍM ĐIỀU KHIỂN';

    const title = this.scene.add
      .text(px, py - panelH / 2 + 34, headerTitle, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '23px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0.5, 0.5);

    this.container.add([scrim, this.contentRoot]);
    this.contentRoot.add([panel, title]);

    if (mode === 'settings') {
      this.buildSettingsOptionsRow(px, py - panelH / 2 + 92);
      if (this.isMobileDevice) {
        // Mobile automatically replaces the PC keyboard matrix with Driving Style & Sensitivity tuning!
        this.buildMobileTouchTuningPanel(px, py - panelH / 2 + 156);
      } else {
        // PC shows ONLY the 4-Player Keyboard Keybind Matrix!
        this.buildKeybindMatrix(px, py - panelH / 2 + 178, true);
      }
    } else {
      this.buildGameplayRulesRow(px, py - panelH / 2 + 98);
      if (this.isMobileDevice) {
        this.buildMobileControlsGuideCards(px, py - panelH / 2 + 216);
      } else {
        this.buildKeybindMatrix(px, py - panelH / 2 + 205, false);
      }
    }

    const defaultStatusCopy =
      mode === 'settings'
        ? this.isMobileDevice
          ? 'Tùy chỉnh Kiểu Lái, Độ Nhạy Cần Gạt, Vùng Xoay Ngắm và Kích Cỡ Nút sao cho vừa tay nhất!'
          : 'Bấm vào bất kỳ ô phím nào để gán lại phím mới, hoặc bấm ô điểm thắng để nhập số điểm / ∞ Vô Tận.'
        : this.isMobileDevice
          ? 'Mẹo: Đặt điện thoại nằm ngang ở giữa bàn để 2 người ngồi đối diện cùng đấu trên 1 máy!'
          : 'Mẹo: Tối đa 4 người hoặc Máy AI có thể tham chiến cùng lúc và tranh Thùng Gỗ Bí Ẩn!';

    this.statusText = this.scene.add
      .text(px, py + panelH / 2 - 84, defaultStatusCopy, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '14px',
        fontStyle: '600',
        color: UI_COLORS.inkMutedHex,
      })
      .setOrigin(0.5, 0.5);
    this.contentRoot.add(this.statusText);

    if (mode === 'settings') {
      const resetBtn = createArcadeButton(this.scene, {
        x: px - 145,
        y: py + panelH / 2 - 38,
        width: 248,
        height: 42,
        label: this.isMobileDevice ? 'KHÔI PHỤC CẢM ỨNG GỐC' : 'KHÔI PHỤC PHÍM GỐC',
        fontSize: 14,
        fillColor: UI_COLORS.cardAltBg,
        hoverColor: 0xdcdfe4,
        onClick: () => {
          if (this.isMobileDevice) {
            settingsManager.resetTouchSettingsToDefault();
            this.refreshMobileControlsUI?.();
            this.statusText.setText(
              'Đã khôi phục Kiểu Lái, Độ Nhạy (100%), Vùng Ngắm (42%) và Cỡ Nút mặc định.',
            );
            this.onBindingsUpdated?.();
          } else {
            this.waitingTarget = null;
            settingsManager.resetBindingsToDefault();
            this.refreshAllKeyLabels();
            this.statusText.setText('Đã khôi phục bộ phím mặc định cho cả 4 xe.');
            this.onBindingsUpdated?.();
          }
        },
      });

      const closeBtn = createArcadeButton(this.scene, {
        x: px + 135,
        y: py + panelH / 2 - 38,
        width: 204,
        height: 42,
        label: 'HOÀN TẤT',
        fontSize: 16.5,
        fillColor: 0x43a047,
        hoverColor: 0x4caf50,
        textColor: '#FFFFFF',
        onClick: () => this.close(),
      });
      this.contentRoot.add([resetBtn.container, closeBtn.container]);
    } else {
      if (this.onOpenSkillGuide) {
        const skillBtn = createArcadeButton(this.scene, {
          x: px - 140,
          y: py + panelH / 2 - 38,
          width: 256,
          height: 42,
          label: '★ CẨM NANG 10 KỸ NĂNG',
          fontSize: 14.5,
          fillColor: 0xfff8e1,
          hoverColor: 0xffecb3,
          textColor: '#E65100',
          onClick: () => {
            const openFn = this.onOpenSkillGuide;
            this.close();
            openFn?.();
          },
        });
        const closeBtn = createArcadeButton(this.scene, {
          x: px + 140,
          y: py + panelH / 2 - 38,
          width: 210,
          height: 42,
          label: this.isMobileDevice ? 'ĐÃ HIỂU' : 'ĐÃ HIỂU (ESC)',
          fontSize: 16,
          fillColor: 0x1e88e5,
          hoverColor: 0x2196f3,
          textColor: '#FFFFFF',
          onClick: () => this.close(),
        });
        this.contentRoot.add([skillBtn.container, closeBtn.container]);
      } else {
        const closeBtn = createArcadeButton(this.scene, {
          x: px,
          y: py + panelH / 2 - 38,
          width: 210,
          height: 42,
          label: this.isMobileDevice ? 'ĐÃ HIỂU' : 'ĐÃ HIỂU (ESC)',
          fontSize: 16,
          fillColor: 0x1e88e5,
          hoverColor: 0x2196f3,
          textColor: '#FFFFFF',
          onClick: () => this.close(),
        });
        this.contentRoot.add(closeBtn.container);
      }
    }

    animateModalOpen(this.scene, scrim, this.contentRoot);
  }

  private buildSettingsOptionsRow(centerX: number, y: number): void {
    const s = settingsManager.getSettings();

    const soundBtn = createArcadeButton(this.scene, {
      x: centerX - 352,
      y,
      width: 176,
      height: 40,
      label: `ÂM THANH: ${s.soundEnabled ? 'BẬT' : 'TẮT'}`,
      fontSize: 13.5,
      fillColor: s.soundEnabled ? 0xe8f5e9 : UI_COLORS.cardAltBg,
      onClick: () => {
        const next = !settingsManager.getSettings().soundEnabled;
        settingsManager.setSoundEnabled(next);
        soundBtn.setLabel(`ÂM THANH: ${next ? 'BẬT' : 'TẮT'}`);
        soundBtn.setFill(next ? 0xe8f5e9 : UI_COLORS.cardAltBg);
      },
    });

    const volSteps = [0.25, 0.5, 0.75, 1.0];
    const volBtn = createArcadeButton(this.scene, {
      x: centerX - 166,
      y,
      width: 176,
      height: 40,
      label: `ÂM LƯỢNG: ${Math.round(s.masterVolume * 100)}%`,
      fontSize: 13.5,
      fillColor: UI_COLORS.cardAltBg,
      onClick: () => {
        const cur = settingsManager.getSettings().masterVolume;
        const idx = volSteps.findIndex((v) => Math.abs(v - cur) < 0.08);
        const next = volSteps[(idx + 1) % volSteps.length];
        settingsManager.setMasterVolume(next);
        volBtn.setLabel(`ÂM LƯỢNG: ${Math.round(next * 100)}%`);
        audioManager.playUiClick(false);
      },
    });

    const shakeBtn = createArcadeButton(this.scene, {
      x: centerX + 20,
      y,
      width: 176,
      height: 40,
      label: `RUNG MÀN: ${s.screenShake ? 'BẬT' : 'TẮT'}`,
      fontSize: 13.5,
      fillColor: s.screenShake ? 0xe3f2fd : UI_COLORS.cardAltBg,
      onClick: () => {
        const next = !settingsManager.getSettings().screenShake;
        settingsManager.setScreenShake(next);
        shakeBtn.setLabel(`RUNG MÀN: ${next ? 'BẬT' : 'TẮT'}`);
        shakeBtn.setFill(next ? 0xe3f2fd : UI_COLORS.cardAltBg);
      },
    });

    this.scoreStepper = createScoreStepper(this.scene, {
      x: centerX + 286,
      y,
      width: 324,
      height: 40,
      value: s.winningScore,
      compact: true,
      onInteract: () => {
        if (this.waitingTarget) {
          this.waitingTarget = null;
          this.refreshAllKeyLabels();
        }
      },
      onChange: (next) => {
        settingsManager.setWinningScore(next);
        this.onBindingsUpdated?.();
      },
    });

    this.contentRoot.add([
      soundBtn.container,
      volBtn.container,
      shakeBtn.container,
      this.scoreStepper.container,
    ]);
  }

  /**
   * Dedicated Mobile Touch Control Panel (replaces the PC keyboard matrix when on Mobile):
   * - Driving Style selector (`Cần Gạt Thông Minh` vs `Cụm Phím Cổ Điển`)
   * - Joystick Sensitivity stepper (`60% .. 150%`)
   * - Precision Aim-Only Zone stepper (`22% .. 60%`)
   * - Button Size scale stepper (`85% .. 125%`)
   * - Floating Joystick toggle & Solo Left/Right Hand swap
   */
  private buildMobileTouchTuningPanel(centerX: number, topY: number): void {
    const panelBg = this.scene.add.graphics();
    panelBg.fillStyle(0xf5f7fa, 1);
    panelBg.fillRoundedRect(centerX - 446, topY - 12, 892, 336, 12);
    panelBg.lineStyle(2, 0xd4dae3, 1);
    panelBg.strokeRoundedRect(centerX - 446, topY - 12, 892, 336, 12);
    this.contentRoot.add(panelBg);

    // 1. Driving Style Row (`topY + 30`)
    const schemeHdr = this.scene.add
      .text(centerX - 420, topY + 28, 'KIỂU LÁI XE:', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '14.5px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0, 0.5);

    const vectorSchemeBtn = createArcadeButton(this.scene, {
      x: centerX - 118,
      y: topY + 28,
      width: 332,
      height: 44,
      label: '🕹 CẦN GẠT THÔNG MINH (NGẮM + LÁI)',
      fontSize: 13.5,
      onClick: () => {
        settingsManager.setTouchScheme('vector_stick');
        refreshUI();
        this.onBindingsUpdated?.();
      },
    });

    const dpadSchemeBtn = createArcadeButton(this.scene, {
      x: centerX + 238,
      y: topY + 28,
      width: 352,
      height: 44,
      label: '🎮 CỤM PHÍM CỔ ĐIỂN (TRÁI/PHẢI + TIẾN)',
      fontSize: 13,
      onClick: () => {
        settingsManager.setTouchScheme('dual_pad');
        refreshUI();
        this.onBindingsUpdated?.();
      },
    });

    this.contentRoot.add([schemeHdr, vectorSchemeBtn.container, dpadSchemeBtn.container]);

    // Helper for clean `- / Value Bar / +` tuning rows
    const createTuningRow = (
      ry: number,
      titleCopy: string,
      subCopy: string,
      onStep: (dir: -1 | 1) => void,
    ) => {
      const rowCard = this.scene.add.graphics();
      rowCard.fillStyle(0xffffff, 1);
      rowCard.fillRoundedRect(centerX - 426, ry - 26, 852, 52, 9);
      rowCard.lineStyle(1.5, 0xdcdfe6, 1);
      rowCard.strokeRoundedRect(centerX - 426, ry - 26, 852, 52, 9);

      const tLbl = this.scene.add
        .text(centerX - 406, ry - 8, titleCopy, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '14px',
          fontStyle: '900',
          color: UI_COLORS.inkDarkHex,
        })
        .setOrigin(0, 0.5);

      const sLbl = this.scene.add
        .text(centerX - 406, ry + 11, subCopy, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11.5px',
          fontStyle: '600',
          color: UI_COLORS.inkMutedHex,
        })
        .setOrigin(0, 0.5);

      const minusBtn = createArcadeButton(this.scene, {
        x: centerX + 76,
        y: ry,
        width: 44,
        height: 36,
        lipHeight: 2.5,
        label: '−',
        fontSize: 19,
        fillColor: UI_COLORS.cardAltBg,
        onClick: () => onStep(-1),
      });

      const gaugeGfx = this.scene.add.graphics();
      const valTxt = this.scene.add
        .text(centerX + 236, ry, '', {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '13.5px',
          fontStyle: '900',
          color: '#0D47A1',
        })
        .setOrigin(0.5, 0.5);

      const plusBtn = createArcadeButton(this.scene, {
        x: centerX + 394,
        y: ry,
        width: 44,
        height: 36,
        lipHeight: 2.5,
        label: '+',
        fontSize: 18,
        fillColor: UI_COLORS.cardAltBg,
        onClick: () => onStep(1),
      });

      this.contentRoot.add([
        rowCard,
        tLbl,
        sLbl,
        minusBtn.container,
        gaugeGfx,
        valTxt,
        plusBtn.container,
      ]);

      return { gaugeGfx, valTxt, ry };
    };

    // 2. Sensitivity Row (`topY + 98`)
    const sensRow = createTuningRow(
      topY + 98,
      'ĐỘ NHẠY CẦN GẠT',
      'Tăng độ nhạy giúp xoay nòng và vọt xe nhanh hơn với quãng kéo ngón cái ngắn',
      (dir) => {
        settingsManager.stepTouchSensitivity(dir * 0.1);
        refreshUI();
        this.onBindingsUpdated?.();
      },
    );

    // 3. Precision Aim Zone Row (`topY + 162`)
    const aimRow = createTuningRow(
      topY + 162,
      'VÙNG XOAY NGẮM TẠI CHỖ',
      'Độ rộng vòng trong để xoay nòng căn góc đạn nảy tường mà xe không trôi về trước',
      (dir) => {
        settingsManager.stepTouchAimZone(dir * 0.05);
        refreshUI();
        this.onBindingsUpdated?.();
      },
    );

    // 4. Button Size Scale Row (`topY + 226`)
    const scaleRow = createTuningRow(
      topY + 226,
      'KÍCH CỠ NÚT ĐIỀU KHIỂN',
      'Phóng to hoặc thu gọn kích thước Cần Gạt, nút BẮN! và nút LÙI trên màn hình',
      (dir) => {
        settingsManager.stepTouchButtonScale(dir * 0.1);
        refreshUI();
        this.onBindingsUpdated?.();
      },
    );

    // 5. Floating Stick & Handedness Toggles (`topY + 290`)
    const floatStickBtn = createArcadeButton(this.scene, {
      x: centerX - 216,
      y: topY + 290,
      width: 412,
      height: 40,
      lipHeight: 2.5,
      label: '',
      fontSize: 13,
      onClick: () => {
        const next = !settingsManager.getSettings().touchFloatingStick;
        settingsManager.setTouchFloatingStick(next);
        refreshUI();
        this.onBindingsUpdated?.();
      },
    });

    const swapHandsBtn = createArcadeButton(this.scene, {
      x: centerX + 216,
      y: topY + 290,
      width: 412,
      height: 40,
      lipHeight: 2.5,
      label: '',
      fontSize: 13,
      onClick: () => {
        const next = !settingsManager.getSettings().touchSwapHands;
        settingsManager.setTouchSwapHands(next);
        refreshUI();
        this.onBindingsUpdated?.();
      },
    });

    this.contentRoot.add([floatStickBtn.container, swapHandsBtn.container]);

    const drawGauge = (
      gfx: Phaser.GameObjects.Graphics,
      ry: number,
      frac01: number,
      fillCol: number,
    ) => {
      const gx = centerX + 110;
      const gw = 252;
      const gh = 30;
      gfx.clear();
      gfx.fillStyle(0xe8ecf2, 1);
      gfx.fillRoundedRect(gx, ry - gh / 2, gw, gh, 7);
      gfx.fillStyle(fillCol, 0.24);
      gfx.fillRoundedRect(gx + 2, ry - gh / 2 + 2, Math.max(12, (gw - 4) * frac01), gh - 4, 5);
      gfx.lineStyle(1.6, fillCol, 0.75);
      gfx.strokeRoundedRect(gx, ry - gh / 2, gw, gh, 7);
    };

    const refreshUI = () => {
      const cfg = settingsManager.getSettings();
      const isVec = cfg.touchScheme === 'vector_stick';

      vectorSchemeBtn.setFill(
        isVec ? 0x1565c0 : UI_COLORS.cardBg,
        isVec ? 0x1976d2 : 0xf0f4f8,
        isVec ? '#FFFFFF' : UI_COLORS.inkDarkHex,
      );
      dpadSchemeBtn.setFill(
        !isVec ? 0x1565c0 : UI_COLORS.cardBg,
        !isVec ? 0x1976d2 : 0xf0f4f8,
        !isVec ? '#FFFFFF' : UI_COLORS.inkDarkHex,
      );

      const sensPct = Math.round(cfg.touchSensitivity * 100);
      const sensTier =
        sensPct <= 80
          ? 'ĐẦM TAY'
          : sensPct <= 110
            ? 'CHUẨN'
            : sensPct <= 130
              ? 'NHẠY'
              : 'SIÊU NHẠY';
      sensRow.valTxt.setText(`${sensPct}% (${sensTier})`);
      drawGauge(sensRow.gaugeGfx, sensRow.ry, (cfg.touchSensitivity - 0.6) / 0.9, 0x1e88e5);

      const aimPct = Math.round(cfg.touchAimZone * 100);
      aimRow.valTxt.setText(`${aimPct}% BÁN KÍNH`);
      drawGauge(aimRow.gaugeGfx, aimRow.ry, (cfg.touchAimZone - 0.22) / 0.38, 0x00838f);

      const scalePct = Math.round(cfg.touchButtonScale * 100);
      scaleRow.valTxt.setText(`${scalePct}% KÍCH CỠ`);
      drawGauge(scaleRow.gaugeGfx, scaleRow.ry, (cfg.touchButtonScale - 0.85) / 0.4, 0x2e7d32);

      floatStickBtn.setLabel(
        cfg.touchFloatingStick
          ? '🎯 TÂM CẦN GẠT: LINH HOẠT THEO NGÓN CHẠM'
          : '📌 TÂM CẦN GẠT: KHÓA VỊ TRÍ CỐ ĐỊNH',
      );
      floatStickBtn.setFill(cfg.touchFloatingStick ? 0xe8f5e9 : UI_COLORS.cardBg);

      swapHandsBtn.setLabel(
        cfg.touchSwapHands
          ? '🤚 BỐ CỤC 1 NGƯỜI: BẮN TRÁI • LÁI PHẢI'
          : '✋ BỐ CỤC 1 NGƯỜI: LÁI TRÁI • BẮN PHẢI',
      );
      swapHandsBtn.setFill(cfg.touchSwapHands ? 0xfff8e1 : UI_COLORS.cardBg);
    };

    this.refreshMobileControlsUI = refreshUI;
    refreshUI();
  }

  /**
   * Mobile-friendly Controls Guide cards shown in `HƯỚNG DẪN CHƠI` instead of PC keyboard keys!
   */
  private buildMobileControlsGuideCards(centerX: number, topY: number): void {
    const cards = [
      {
        cx: centerX - 222,
        accent: 0x1565c0,
        title: '🕹 CHẾ ĐỘ 1 NGƯỜI (ĐẤU AI / ONLINE 1VS1)',
        body:
          '• Ngón cái TRÁI điều khiển Cần Gạt Thông Minh:\n' +
          '  - Kéo nhẹ trong vòng xanh: xoay nòng ngắm bắn nảy tường tại chỗ.\n' +
          '  - Kéo ra ngoài: tự động rẽ và tiến mượt mà theo hướng kéo.\n' +
          '  - Kéo ngược >130° (hoặc giữ nút LÙI): lùi xe khẩn cấp ngay lập tức!\n' +
          '• Ngón cái PHẢI bấm/giữ nút BẮN! (vòng tròn quanh nút báo số đạn).',
      },
      {
        cx: centerX + 222,
        accent: 0x2e7d32,
        title: '👥 CHẾ ĐỘ 2 NGƯỜI NGỒI ĐỐI DIỆN TRÊN 1 MÁY',
        body:
          '• Đặt điện thoại nằm ngang ở giữa bàn:\n' +
          '  - XE 1 ngồi ở cạnh TRÁI màn hình (Cần Gạt trên + nút BẮN! dưới).\n' +
          '  - XE 2 ngồi ĐỐI DIỆN ở cạnh PHẢI màn hình (xoay ngược 180°).\n' +
          '• Cả 2 người đều có thể vừa xoay cần gạt vừa bấm BẮN! + LÙI cùng lúc!\n' +
          '• Vào Cài Đặt để chỉnh Độ Nhạy Lái, Cỡ Nút hoặc đổi Cụm Phím Cổ Điển.',
      },
    ];

    for (const c of cards) {
      const w = 424;
      const h = 236;
      const g = this.scene.add.graphics();
      g.fillStyle(0xf7f9fc, 1);
      g.fillRoundedRect(c.cx - w / 2, topY - 16, w, h, 12);
      g.fillStyle(c.accent, 1);
      g.fillRoundedRect(c.cx - w / 2, topY - 16, w, 38, { tl: 12, tr: 12, bl: 0, br: 0 });
      g.lineStyle(2.2, UI_COLORS.inkDark, 0.9);
      g.strokeRoundedRect(c.cx - w / 2, topY - 16, w, h, 12);

      const hdr = this.scene.add
        .text(c.cx, topY + 3, c.title, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '13.5px',
          fontStyle: '900',
          color: '#FFFFFF',
        })
        .setOrigin(0.5, 0.5);

      const body = this.scene.add
        .text(c.cx - w / 2 + 18, topY + 36, c.body, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '12.5px',
          fontStyle: '600',
          color: UI_COLORS.inkDarkHex,
          lineSpacing: 6,
          wordWrap: { width: w - 34 },
        })
        .setOrigin(0, 0);

      this.contentRoot.add([g, hdr, body]);
    }
  }

  private buildGameplayRulesRow(centerX: number, y: number): void {
    const box = this.scene.add.graphics();
    box.fillStyle(0xf5f6f8, 1);
    box.fillRoundedRect(centerX - 430, y - 38, 860, 82, 10);
    box.lineStyle(2, 0xd0d4da, 1);
    box.strokeRoundedRect(centerX - 430, y - 38, 860, 82, 10);

    const copy = this.scene.add
      .text(
        centerX,
        y + 3,
        '• Đạn nảy tường tối đa 14 lần và có thể tiêu diệt MỌI xe tăng — kể cả chính người bắn!\n' +
          '• Mỗi xe có băng đạn 10 viên. Thùng Gỗ Bí Ẩn chứa 10 kỹ năng Giáp Siêu Nhân (tùy chỉnh giờ rơi trong Luật Chơi).\n' +
          '• Sau khi hạ đối thủ cuối, hiệp đấu chờ 1.75s — né sạch đạn/bẫy còn sót lại nếu không sẽ thành HÒA!',
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '13.8px',
          fontStyle: '600',
          color: UI_COLORS.inkDarkHex,
          lineSpacing: 5,
          align: 'center',
        },
      )
      .setOrigin(0.5, 0.5);

    this.contentRoot.add([box, copy]);
  }

  private buildKeybindMatrix(centerX: number, topY: number, interactive: boolean): void {
    const s = settingsManager.getSettings();
    const colStartX = centerX - 180;
    const colGap = 132;

    ACTION_COLUMNS.forEach((col, cIdx) => {
      const hdr = this.scene.add
        .text(colStartX + cIdx * colGap, topY, col.label.toUpperCase(), {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '13.5px',
          fontStyle: '800',
          color: UI_COLORS.inkMutedHex,
        })
        .setOrigin(0.5, 0.5);
      this.contentRoot.add(hdr);
    });

    for (let p = 0; p < 4; p++) {
      const pIdx = p as PlayerIndex;
      const rowY = topY + 52 + p * 64;
      const palette = getPaletteById(s.playerColors[p]);

      const rowBg = this.scene.add.graphics();
      rowBg.fillStyle(p % 2 === 0 ? 0xf6f7f9 : 0xedeff2, 1);
      rowBg.fillRoundedRect(centerX - 445, rowY - 26, 890, 52, 8);
      this.contentRoot.add(rowBg);

      const tankIcon = this.scene.add
        .image(centerX - 406, rowY, `tank_icon_${palette.id}`)
        .setScale(0.76);
      const pLabel = this.scene.add
        .text(centerX - 366, rowY, `XE ${p + 1}`, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '16px',
          fontStyle: '800',
          color: palette.primaryHex,
        })
        .setOrigin(0, 0.5);

      this.contentRoot.add([tankIcon, pLabel]);

      const mapForPlayer = {} as Record<ControlAction, ArcadeButtonHandle>;
      ACTION_COLUMNS.forEach((col, cIdx) => {
        const bx = colStartX + cIdx * colGap;
        const code = s.playerBindings[pIdx][col.action];
        const btn = createArcadeButton(this.scene, {
          x: bx,
          y: rowY,
          width: 114,
          height: 36,
          lipHeight: 3,
          label: formatKeyCodeLabel(code),
          fontSize: 15,
          fillColor: 0xffffff,
          hoverColor: interactive ? 0xfff8e1 : 0xffffff,
          onClick: () => {
            if (!interactive) return;
            this.scoreStepper?.commitAndStopEditing();
            this.beginKeyCapture(pIdx, col.action);
          },
        });
        if (!interactive) {
          btn.setEnabled(true);
        }
        mapForPlayer[col.action] = btn;
        this.contentRoot.add(btn.container);
      });

      this.keyButtons.push(mapForPlayer);
    }
  }

  private beginKeyCapture(playerIndex: PlayerIndex, action: ControlAction): void {
    this.refreshAllKeyLabels();
    this.waitingTarget = { playerIndex, action };
    const btn = this.keyButtons[playerIndex][action];
    btn.setLabel('NHẤN PHÍM…');
    btn.setFill(0xffe082, 0xffe082, UI_COLORS.inkDarkHex);
    const colLabel = ACTION_COLUMNS.find((c) => c.action === action)?.label ?? action;
    this.statusText.setText(
      `Đang chờ gán phím "${colLabel.toUpperCase()}" cho Xe ${playerIndex + 1} — nhấn phím bất kỳ (ESC để hủy)`,
    );
  }

  private refreshAllKeyLabels(): void {
    const s = settingsManager.getSettings();
    for (let p = 0; p < 4; p++) {
      const pIdx = p as PlayerIndex;
      for (const col of ACTION_COLUMNS) {
        const btn = this.keyButtons[pIdx]?.[col.action];
        if (!btn) continue;
        btn.setLabel(formatKeyCodeLabel(s.playerBindings[pIdx][col.action]));
        btn.setFill(0xffffff, 0xfff8e1, UI_COLORS.inkDarkHex);
      }
    }
  }

  private handleWindowKeyDown(e: KeyboardEvent): void {
    if (this.scoreStepper?.isEditing()) {
      return;
    }

    if (this.waitingTarget && !this.isMobileDevice) {
      e.preventDefault();
      e.stopPropagation();
      if (e.repeat) return;

      if (e.code === 'Escape') {
        this.waitingTarget = null;
        this.refreshAllKeyLabels();
        this.statusText.setText('Đã hủy thao tác đổi phím.');
        return;
      }

      const { playerIndex, action } = this.waitingTarget;
      this.waitingTarget = null;
      const res = settingsManager.rebindKey(playerIndex, action, e.code);
      this.refreshAllKeyLabels();

      if (!res.ok) {
        this.statusText.setText(`Không thể dùng phím ${formatKeyCodeLabel(e.code)} (phím hệ thống).`);
      } else if (res.swappedWith) {
        this.statusText.setText(
          `Đã gán ${formatKeyCodeLabel(e.code)} cho Xe ${playerIndex + 1} (hoán đổi tự động với Xe ${
            res.swappedWith.playerIndex + 1
          }).`,
        );
        audioManager.playUiClick(false);
        this.onBindingsUpdated?.();
      } else {
        this.statusText.setText(
          `Đã gán phím ${formatKeyCodeLabel(e.code)} cho Xe ${playerIndex + 1}.`,
        );
        audioManager.playUiClick(false);
        this.onBindingsUpdated?.();
      }
      return;
    }

    if (e.code === 'Escape' && !e.repeat) {
      e.preventDefault();
      e.stopPropagation();
      this.close();
    }
  }

  close(silent = false): void {
    if (this.closed) return;
    this.closed = true;
    this.refreshMobileControlsUI = null;
    this.scoreStepper?.destroy();
    this.scoreStepper = null;
    window.removeEventListener('keydown', this.onKeyCaptureBound, true);
    if (this.container.scene) {
      this.container.destroy(true);
    }
    if (!silent) {
      this.onCloseCallback();
    }
  }
}
