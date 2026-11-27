import Phaser from 'phaser';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  formatCrateSpawnIntervalLabel,
  formatWinningScoreLabel,
  getPaletteById,
  UI_COLORS,
} from '../config/constants';
import { audioManager } from '../managers/AudioManager';
import { mobileOrientationManager } from '../managers/MobileOrientationManager';
import { settingsManager } from '../managers/SettingsManager';
import { MAP_MODES } from '../maps/mapDefinitions';
import {
  peerMultiplayer,
  type LobbySharedState,
  type OnlineMatchConfig,
} from '../network/PeerMultiplayerManager';
import { normalizeRoomCode } from '../network/roomCode';
import {
  animateStaggeredEntrance,
  createArcadeButton,
  drawMazeBackdrop,
  type ArcadeButtonHandle,
} from '../../ui/components/ArcadeWidgets';
import { createMobileFullscreenControls } from '../../ui/components/FullscreenPromptWidget';
import { MatchRulesModal } from '../../ui/components/MatchRulesModal';

interface OnlineLobbyInitData {
  autoJoinCode?: string;
}

export class OnlineLobbyScene extends Phaser.Scene {
  private autoJoinCode: string | null = null;
  private modeTab: 'host' | 'join' = 'host';
  private joinCodeBuffer = '';
  private isTypingCode = false;
  private copyToastTimer: Phaser.Time.TimerEvent | null = null;

  private hostTabBtn!: ArcadeButtonHandle;
  private joinTabBtn!: ArcadeButtonHandle;

  private roomPanelContainer!: Phaser.GameObjects.Container;
  private statusText!: Phaser.GameObjects.Text;
  private pingBadgeText!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;

  private activeRulesModal: MatchRulesModal | null = null;
  private unsubLobby: (() => void) | null = null;
  private unsubMatchStart: (() => void) | null = null;
  private onKeyDownBound!: (e: KeyboardEvent) => void;
  private previewSprites: Phaser.GameObjects.Image[] = [];

  constructor() {
    super('OnlineLobbyScene');
  }

  init(data?: OnlineLobbyInitData): void {
    this.autoJoinCode = data?.autoJoinCode ? normalizeRoomCode(data.autoJoinCode) : null;
  }

  create(): void {
    this.activeRulesModal = null;
    this.previewSprites = [];
    mobileOrientationManager.syncLayout();
    this.cameras.main.fadeIn(200, 238, 238, 236);

    drawMazeBackdrop(this, DESIGN_WIDTH, DESIGN_HEIGHT);
    const fsControls = createMobileFullscreenControls(this, {
      buttonX: DESIGN_WIDTH - 96,
      buttonY: 42,
      showRecommendationBanner: true,
      bannerY: 42,
    });

    const header = this.add
      .text(DESIGN_WIDTH / 2, 42, '🌐 SẢNH ĐẤU ONLINE 1VS1  •  KẾT NỐI MÃ PHÒNG P2P', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '27px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0.5, 0.5);

    const subHeader = this.add
      .text(
        DESIGN_WIDTH / 2,
        74,
        'PeerJS Cloud + STUN Google/Cloudflare miễn phí • Vào thẳng bằng Mã Phòng 6 ký tự (WT-XXXX) hoặc Link Mời',
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '13px',
          fontStyle: '700',
          color: UI_COLORS.inkMutedHex,
        },
      )
      .setOrigin(0.5, 0.5);

    this.hostTabBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2 - 155,
      y: 118,
      width: 286,
      height: 44,
      label: '🏠 TẠO PHÒNG MỚI (CHỦ PHÒNG)',
      fontSize: 14.5,
      onClick: () => {
        if (this.activeRulesModal) return;
        this.switchToHostTab();
      },
    });

    this.joinTabBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH / 2 + 155,
      y: 118,
      width: 286,
      height: 44,
      label: '🔑 NHẬP MÃ VÀO PHÒNG (KHÁCH)',
      fontSize: 14.5,
      onClick: () => {
        if (this.activeRulesModal) return;
        this.switchToJoinTab();
      },
    });

    this.roomPanelContainer = this.add.container(0, 0);

    this.pingBadgeText = this.add
      .text(DESIGN_WIDTH - 36, 118, 'PING: -- ms', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '13.5px',
        fontStyle: '900',
        color: '#00695C',
        backgroundColor: '#E0F2F1',
        padding: { x: 10, y: 5 },
      })
      .setOrigin(1, 0.5);

    this.statusText = this.add
      .text(DESIGN_WIDTH / 2, 646, '', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '14.5px',
        fontStyle: '800',
        color: '#0D47A1',
      })
      .setOrigin(0.5, 0.5);

    this.toastText = this.add
      .text(DESIGN_WIDTH / 2, 674, '', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '13.5px',
        fontStyle: '800',
        color: '#2E7D32',
      })
      .setOrigin(0.5, 0.5);

    const backBtn = createArcadeButton(this, {
      x: 175,
      y: 712,
      width: 224,
      height: 48,
      label: '← RỜI PHÒNG / TRANG CHỦ',
      fontSize: 14.5,
      fillColor: UI_COLORS.cardBg,
      onClick: () => {
        if (this.activeRulesModal) return;
        this.clearUrlRoomParam();
        peerMultiplayer.disconnect();
        this.scene.start('MenuScene');
      },
    });

    animateStaggeredEntrance(
      this,
      [header, subHeader, this.hostTabBtn.container, this.joinTabBtn.container, backBtn.container],
      12,
      24,
    );

    this.unsubLobby = peerMultiplayer.subscribeLobby((st) => {
      this.renderLobbyState(st);
    });

    this.unsubMatchStart = peerMultiplayer.subscribeMatchStart((cfg: OnlineMatchConfig) => {
      this.launchOnlineMatch(cfg);
    });

    // Expose programmatic helper for clean diagnostics & automated testing
    this.registerLobbyDiagnostics();

    // Auto-route based on ?room=XXXX or existing session
    if (this.autoJoinCode && this.autoJoinCode.length >= 4) {
      this.modeTab = 'join';
      this.joinCodeBuffer = this.autoJoinCode;
      this.isTypingCode = false;
      peerMultiplayer.joinRoom(this.autoJoinCode);
    } else if (peerMultiplayer.getRole() === 'guest') {
      this.modeTab = 'join';
      this.joinCodeBuffer = peerMultiplayer.getState().roomCode;
      this.renderLobbyState(peerMultiplayer.getState());
    } else if (peerMultiplayer.getRole() === 'host' && peerMultiplayer.getState().roomCode) {
      this.modeTab = 'host';
      this.renderLobbyState(peerMultiplayer.getState());
    } else {
      this.switchToHostTab();
    }

    this.onKeyDownBound = (e: KeyboardEvent) => this.handleKeyDown(e);
    window.addEventListener('keydown', this.onKeyDownBound);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.onKeyDownBound);
      fsControls.destroy();
      this.unsubLobby?.();
      this.unsubLobby = null;
      this.unsubMatchStart?.();
      this.unsubMatchStart = null;
      this.activeRulesModal?.close(true);
      this.activeRulesModal = null;
      if (this.copyToastTimer) {
        this.copyToastTimer.remove();
        this.copyToastTimer = null;
      }
    });
  }

  update(_time: number, delta: number): void {
    const dt = delta / 1000;
    for (const sp of this.previewSprites) {
      if (sp.active) sp.rotation += dt * 0.65;
    }
  }

  private switchToHostTab(): void {
    this.modeTab = 'host';
    this.isTypingCode = false;
    audioManager.playUiClick(false);
    if (peerMultiplayer.getRole() !== 'host' || !peerMultiplayer.getState().roomCode) {
      peerMultiplayer.hostRoom();
    } else {
      this.renderLobbyState(peerMultiplayer.getState());
    }
  }

  private switchToJoinTab(): void {
    this.modeTab = 'join';
    this.isTypingCode = true;
    audioManager.playUiClick(false);
    if (peerMultiplayer.getRole() === 'host') {
      peerMultiplayer.disconnect(true);
    }
    this.renderLobbyState(peerMultiplayer.getState());
  }

  private renderLobbyState(st: LobbySharedState): void {
    const isHostTab = this.modeTab === 'host';
    this.hostTabBtn.setFill(
      isHostTab ? UI_COLORS.inkDark : UI_COLORS.cardBg,
      isHostTab ? 0x2c3036 : 0xf4f6f8,
      isHostTab ? '#FFFFFF' : UI_COLORS.inkDarkHex,
    );
    this.joinTabBtn.setFill(
      !isHostTab ? UI_COLORS.inkDark : UI_COLORS.cardBg,
      !isHostTab ? 0x2c3036 : 0xf4f6f8,
      !isHostTab ? '#FFFFFF' : UI_COLORS.inkDarkHex,
    );

    this.statusText.setText(st.statusMessage);
    this.statusText.setColor(
      st.status === 'error' ? '#C62828' : st.connected ? '#1B5E20' : '#0D47A1',
    );

    if (st.connected) {
      const pipeLbl = st.transport === 'webrtc' ? 'P2P STUN' : 'LAN/TAB';
      this.pingBadgeText.setText(`🟢 ${pipeLbl} • PING: ${st.pingMs} ms`);
    } else {
      this.pingBadgeText.setText('⚪ CHƯA KẾT NỐI');
    }

    this.roomPanelContainer.removeAll(true);
    this.previewSprites = [];

    // Left Control Card (`x = 340, y = 392`) — Room Code / Invite or Join Code Input
    this.buildRoomControlCard(340, 392, st);

    // Right Arena & Versus Card (`x = 875, y = 392`) — XE 1 (Chủ Phòng) vs XE 2 (Khách) + Rules + Start/Ready
    this.buildVersusAndRulesCard(860, 392, st);
  }

  private buildRoomControlCard(cx: number, cy: number, st: LobbySharedState): void {
    const w = 470;
    const h = 446;
    const card = this.add.graphics();
    card.fillStyle(0x1d1f22, 0.12);
    card.fillRoundedRect(cx - w / 2 + 4, cy - h / 2 + 6, w, h, 14);
    card.fillStyle(UI_COLORS.cardBg, 1);
    card.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    card.lineStyle(2.8, UI_COLORS.inkDark, 1);
    card.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    this.roomPanelContainer.add(card);

    if (this.modeTab === 'host') {
      const title = this.add
        .text(cx, cy - h / 2 + 34, 'MÃ PHÒNG CỦA BẠN (1 VS 1)', {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '17px',
          fontStyle: '900',
          color: UI_COLORS.inkMutedHex,
        })
        .setOrigin(0.5, 0.5);

      const codeBox = this.add.graphics();
      codeBox.fillStyle(0xfff8e1, 1);
      codeBox.fillRoundedRect(cx - 186, cy - 148, 372, 86, 12);
      codeBox.lineStyle(3, 0xf9a825, 1);
      codeBox.strokeRoundedRect(cx - 186, cy - 148, 372, 86, 12);

      const codeTxt = this.add
        .text(cx, cy - 105, st.formattedCode, {
          fontFamily: "'Consolas', 'Segoe UI', monospace",
          fontSize: '44px',
          fontStyle: '900',
          color: UI_COLORS.inkDarkHex,
          letterSpacing: 3,
        })
        .setOrigin(0.5, 0.5);

      const copyCodeBtn = createArcadeButton(this, {
        x: cx - 96,
        y: cy - 22,
        width: 180,
        height: 44,
        label: '📋 CHÉP MÃ PHÒNG',
        fontSize: 13.5,
        fillColor: 0xe3f2fd,
        hoverColor: 0xbbdefb,
        textColor: '#0D47A1',
        onClick: () => {
          this.copyToClipboard(st.formattedCode, `Đã chép mã phòng ${st.formattedCode}!`);
        },
      });

      const copyLinkBtn = createArcadeButton(this, {
        x: cx + 96,
        y: cy - 22,
        width: 180,
        height: 44,
        label: '🔗 CHÉP LINK MỜI',
        fontSize: 13.5,
        fillColor: 0xe8f5e9,
        hoverColor: 0xc8e6c9,
        textColor: '#1B5E20',
        onClick: () => {
          const link = peerMultiplayer.getInviteLink();
          this.copyToClipboard(link, 'Đã chép Link Mời vào bộ nhớ tạm! Gửi ngay cho bạn bè.');
        },
      });

      const regenBtn = createArcadeButton(this, {
        x: cx,
        y: cy + 38,
        width: 240,
        height: 38,
        label: '↻ ĐỔI MÃ PHÒNG KHÁC',
        fontSize: 13,
        fillColor: UI_COLORS.cardAltBg,
        onClick: () => {
          peerMultiplayer.hostRoom();
          this.showToast('Đã tạo mã phòng 6 ký tự mới!');
        },
      });

      const guideTxt = this.add
        .text(
          cx,
          cy + 134,
          'Cách mời bạn bè đấu 1vs1 miễn phí:\n' +
            '1. Bấm "CHÉP MÃ PHÒNG" hoặc "CHÉP LINK MỜI" gửi qua Zalo / Discord / Messenger.\n' +
            '2. Bạn bè mở Link (hoặc nhập mã WT-XXXX) → bấm SẴN SÀNG.\n' +
            '3. Chủ Phòng tuỳ chỉnh Bản Đồ / Luật Chơi và bấm BẮT ĐẦU ĐẤU!',
          {
            fontFamily: "'Segoe UI', 'Inter', sans-serif",
            fontSize: '12.5px',
            fontStyle: '600',
            color: UI_COLORS.inkMutedHex,
            align: 'center',
            lineSpacing: 5,
            wordWrap: { width: 416 },
          },
        )
        .setOrigin(0.5, 0.5);

      this.roomPanelContainer.add([
        title,
        codeBox,
        codeTxt,
        copyCodeBtn.container,
        copyLinkBtn.container,
        regenBtn.container,
        guideTxt,
      ]);
    } else {
      const title = this.add
        .text(cx, cy - h / 2 + 34, 'NHẬP MÃ PHÒNG TỪ BẠN BÈ', {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '17px',
          fontStyle: '900',
          color: UI_COLORS.inkMutedHex,
        })
        .setOrigin(0.5, 0.5);

      const inputBg = this.add
        .rectangle(cx, cy - 110, 368, 76, this.isTypingCode ? 0xfffde7 : 0xf4f6f8, 1)
        .setStrokeStyle(3, this.isTypingCode ? 0x1e88e5 : UI_COLORS.inkDark, 1)
        .setInteractive({ useHandCursor: true });

      inputBg.on('pointerdown', () => {
        // On mobile devices, prompt native virtual keyboard cleanly if tapped!
        this.isTypingCode = true;
        if (settingsManager.isTouchControlsActive() && typeof window.prompt === 'function') {
          const entered = window.prompt('Nhập mã phòng (ví dụ WT-4829 hoặc 4829):', this.joinCodeBuffer);
          if (entered !== null) {
            this.joinCodeBuffer = normalizeRoomCode(entered);
          }
        }
        this.renderLobbyState(peerMultiplayer.getState());
      });

      const shownCode = this.joinCodeBuffer
        ? `WT-${this.joinCodeBuffer.padEnd(4, '_')}`
        : 'WT-____';
      const inputTxt = this.add
        .text(cx, cy - 110, shownCode, {
          fontFamily: "'Consolas', 'Segoe UI', monospace",
          fontSize: '38px',
          fontStyle: '900',
          color: this.joinCodeBuffer ? UI_COLORS.inkDarkHex : '#90A4AE',
          letterSpacing: 3,
        })
        .setOrigin(0.5, 0.5);

      const pasteBtn = createArcadeButton(this, {
        x: cx - 102,
        y: cy - 34,
        width: 168,
        height: 40,
        label: '📋 DÁN MÃ TỪ BỘ NHỚ',
        fontSize: 12.5,
        fillColor: UI_COLORS.cardAltBg,
        onClick: async () => {
          try {
            const clip = await navigator.clipboard.readText();
            if (clip) {
              const extracted = normalizeRoomCode(clip);
              if (extracted) {
                this.joinCodeBuffer = extracted;
                this.renderLobbyState(peerMultiplayer.getState());
              }
            }
          } catch {
            this.showToast('Hãy gõ trực tiếp 4 ký tự cuối của mã phòng trên bàn phím!');
          }
        },
      });

      const clearBtn = createArcadeButton(this, {
        x: cx + 102,
        y: cy - 34,
        width: 168,
        height: 40,
        label: '⌫ XÓA MÃ NHẬP',
        fontSize: 12.5,
        fillColor: UI_COLORS.cardAltBg,
        onClick: () => {
          this.joinCodeBuffer = '';
          this.isTypingCode = true;
          this.renderLobbyState(peerMultiplayer.getState());
        },
      });

      const connectBtn = createArcadeButton(this, {
        x: cx,
        y: cy + 28,
        width: 344,
        height: 48,
        lipHeight: 4,
        label: st.connected ? `✓ ĐÃ KẾT NỐI ${st.formattedCode}` : '🔌 KẾT NỐI VÀO PHÒNG NGAY',
        fontSize: 16,
        fillColor: st.connected ? 0x2e7d32 : 0x1e88e5,
        hoverColor: st.connected ? 0x388e3c : 0x2196f3,
        textColor: '#FFFFFF',
        onClick: () => {
          if (this.joinCodeBuffer.length < 4) {
            this.showToast('Vui lòng nhập đủ 4 ký tự mã phòng (ví dụ: 4829)!');
            return;
          }
          this.isTypingCode = false;
          peerMultiplayer.joinRoom(this.joinCodeBuffer);
        },
      });

      // Compact on-screen keypad hint + mobile tap prompt button
      const mobilePromptBtn = createArcadeButton(this, {
        x: cx,
        y: cy + 88,
        width: 280,
        height: 36,
        label: '⌨ MỞ BÀN PHÍM NHẬP MÃ (MOBILE)',
        fontSize: 12,
        fillColor: 0xe3f2fd,
        hoverColor: 0xbbdefb,
        textColor: '#0D47A1',
        onClick: () => {
          const entered = window.prompt('Nhập mã phòng (ví dụ WT-4829):', this.joinCodeBuffer);
          if (entered !== null) {
            const norm = normalizeRoomCode(entered);
            this.joinCodeBuffer = norm;
            if (norm.length >= 4) {
              peerMultiplayer.joinRoom(norm);
            } else {
              this.renderLobbyState(peerMultiplayer.getState());
            }
          }
        },
      });

      const tipTxt = this.add
        .text(
          cx,
          cy + 156,
          'Gõ trực tiếp 4 ký tự sau dấu gạch ngang (ví dụ: 4829 cho phòng WT-4829)\nhoặc bấm thẳng vào Link Mời của bạn bè để tự động điền mã!',
          {
            fontFamily: "'Segoe UI', 'Inter', sans-serif",
            fontSize: '12.5px',
            fontStyle: '600',
            color: UI_COLORS.inkMutedHex,
            align: 'center',
            lineSpacing: 5,
          },
        )
        .setOrigin(0.5, 0.5);

      this.roomPanelContainer.add([
        title,
        inputBg,
        inputTxt,
        pasteBtn.container,
        clearBtn.container,
        connectBtn.container,
        mobilePromptBtn.container,
        tipTxt,
      ]);
    }
  }

  private buildVersusAndRulesCard(cx: number, cy: number, st: LobbySharedState): void {
    const w = 520;
    const h = 446;
    const card = this.add.graphics();
    card.fillStyle(0x1d1f22, 0.12);
    card.fillRoundedRect(cx - w / 2 + 4, cy - h / 2 + 6, w, h, 14);
    card.fillStyle(UI_COLORS.cardBg, 1);
    card.fillRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    card.lineStyle(2.8, UI_COLORS.inkDark, 1);
    card.strokeRoundedRect(cx - w / 2, cy - h / 2, w, h, 14);
    this.roomPanelContainer.add(card);

    // Host Slot (`XE 1`) vs Guest Slot (`XE 2`)
    this.buildPlayerSlotBox(cx - 134, cy - 86, 'host', st);
    this.buildPlayerSlotBox(cx + 134, cy - 86, 'guest', st);

    const vsTxt = this.add
      .text(cx, cy - 92, 'VS', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '26px',
        fontStyle: '900',
        color: UI_COLORS.dangerRedHex,
      })
      .setOrigin(0.5, 0.5);
    this.roomPanelContainer.add(vsTxt);

    // Match Rules Summary Banner
    const mapDesc = MAP_MODES.find((m) => m.id === st.mapMode) ?? MAP_MODES[0];
    const rulesSummaryBox = this.add.graphics();
    rulesSummaryBox.fillStyle(0xf4f6f8, 1);
    rulesSummaryBox.fillRoundedRect(cx - 232, cy + 44, 464, 68, 10);
    rulesSummaryBox.lineStyle(1.8, 0xd0d4dc, 1);
    rulesSummaryBox.strokeRoundedRect(cx - 232, cy + 44, 464, 68, 10);

    const rulesSummaryTxt = this.add
      .text(
        cx,
        cy + 78,
        `BẢN ĐỒ: ${mapDesc.label.toUpperCase()}\n` +
          `${formatWinningScoreLabel(st.winningScore, true)}  •  ${formatCrateSpawnIntervalLabel(
            st.powerUpSpawnIntervalSec,
            true,
          )}  •  KỸ NĂNG: ${st.enabledSkills.length}/10`,
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '13px',
          fontStyle: '800',
          color: UI_COLORS.inkDarkHex,
          align: 'center',
          lineSpacing: 5,
        },
      )
      .setOrigin(0.5, 0.5);

    this.roomPanelContainer.add([rulesSummaryBox, rulesSummaryTxt]);

    if (this.modeTab === 'host') {
      const editRulesBtn = createArcadeButton(this, {
        x: cx - 128,
        y: cy + 162,
        width: 196,
        height: 52,
        label: '⚙ CHỈNH LUẬT & MAP',
        fontSize: 14,
        fillColor: 0xe3f2fd,
        hoverColor: 0xbbdefb,
        textColor: '#0D47A1',
        onClick: () => {
          if (this.activeRulesModal) return;
          this.activeRulesModal = new MatchRulesModal(this, {
            inMatch: false,
            onRulesChanged: () => peerMultiplayer.syncHostSettingsFromManager(),
            onClose: () => {
              this.activeRulesModal = null;
              peerMultiplayer.syncHostSettingsFromManager();
            },
          });
        },
      });

      const canStart = st.connected && st.guestReady;
      const startMatchBtn = createArcadeButton(this, {
        x: cx + 108,
        y: cy + 162,
        width: 248,
        height: 52,
        lipHeight: 4.5,
        label: canStart ? 'BẮT ĐẦU ĐẤU 1VS1 →' : st.connected ? 'CHỜ KHÁCH SẴN SÀNG…' : 'ĐANG CHỜ ĐỐI THỦ…',
        fontSize: 15.5,
        fillColor: canStart ? 0x43a047 : 0xb0bec5,
        hoverColor: canStart ? 0x4caf50 : 0xb0bec5,
        textColor: '#FFFFFF',
        onClick: () => {
          if (!st.connected) {
            this.showToast('Chưa có đối thủ kết nối vào phòng!');
            return;
          }
          if (!st.guestReady) {
            this.showToast('Hãy chờ Khách bấm nút SẴN SÀNG trước khi bắt đầu!');
            return;
          }
          peerMultiplayer.hostStartMatch();
        },
      });

      this.roomPanelContainer.add([editRulesBtn.container, startMatchBtn.container]);
    } else {
      const readyBtn = createArcadeButton(this, {
        x: cx,
        y: cy + 162,
        width: 360,
        height: 54,
        lipHeight: 4.5,
        label: !st.connected
          ? 'KẾT NỐI PHÒNG ĐỂ SẴN SÀNG'
          : st.guestReady
            ? '✓ ĐÃ SẴN SÀNG (CHỜ CHỦ PHÒNG BẮT ĐẦU)'
            : '⚡ BẤM SẴN SÀNG CHIẾN ĐẤU!',
        fontSize: 15,
        fillColor: !st.connected ? 0xb0bec5 : st.guestReady ? 0x2e7d32 : 0xf9a825,
        hoverColor: !st.connected ? 0xb0bec5 : st.guestReady ? 0x388e3c : 0xfbc02d,
        textColor: !st.connected || st.guestReady ? '#FFFFFF' : UI_COLORS.inkDarkHex,
        onClick: () => {
          if (!st.connected) {
            this.showToast('Vui lòng kết nối vào mã phòng trước!');
            return;
          }
          peerMultiplayer.toggleGuestReady();
        },
      });
      this.roomPanelContainer.add(readyBtn.container);
    }
  }

  private buildPlayerSlotBox(
    sx: number,
    sy: number,
    slot: 'host' | 'guest',
    st: LobbySharedState,
  ): void {
    const bw = 204;
    const bh = 228;
    const isHostSlot = slot === 'host';
    const joined = isHostSlot ? st.role === 'host' || st.connected : st.connected;
    const colorId = isHostSlot ? st.hostColorId : st.guestColorId;
    const pal = getPaletteById(colorId);

    const g = this.add.graphics();
    g.fillStyle(joined ? 0xffffff : 0xedeff2, 1);
    g.fillRoundedRect(sx - bw / 2, sy - bh / 2, bw, bh, 12);
    g.fillStyle(joined ? pal.primary : 0x90a4ae, 1);
    g.fillRoundedRect(sx - bw / 2, sy - bh / 2, bw, 40, { tl: 12, tr: 12, bl: 0, br: 0 });
    g.lineStyle(2.4, UI_COLORS.inkDark, 1);
    g.strokeRoundedRect(sx - bw / 2, sy - bh / 2, bw, bh, 12);

    const hdr = this.add
      .text(sx, sy - bh / 2 + 20, isHostSlot ? 'XE 1 • CHỦ PHÒNG' : 'XE 2 • KHÁCH', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '13.5px',
        fontStyle: '900',
        color: '#FFFFFF',
      })
      .setOrigin(0.5, 0.5);

    this.roomPanelContainer.add([g, hdr]);

    if (joined) {
      const ring = this.add
        .circle(sx, sy - 16, 36, 0xf3f4f6, 1)
        .setStrokeStyle(2, pal.primary, 0.7);
      const sp = this.add
        .image(sx, sy - 16, `tank_${pal.id}_0`)
        .setScale(1.08)
        .setRotation(isHostSlot ? -Math.PI / 4 : (Math.PI * 3) / 4);
      this.previewSprites.push(sp);

      const canChangeMyColor =
        (isHostSlot && this.modeTab === 'host') ||
        (!isHostSlot && this.modeTab === 'join' && st.connected);

      if (canChangeMyColor) {
        const colBtn = createArcadeButton(this, {
          x: sx,
          y: sy + 46,
          width: 172,
          height: 32,
          lipHeight: 2.5,
          label: `◀ ${pal.name.toUpperCase()} ▶`,
          fontSize: 12,
          fillColor: UI_COLORS.cardAltBg,
          onClick: () => peerMultiplayer.cycleLobbyTankColor(slot),
        });
        this.roomPanelContainer.add(colBtn.container);
      } else {
        const colLbl = this.add
          .text(sx, sy + 46, `MÀU: ${pal.name.toUpperCase()}`, {
            fontFamily: "'Segoe UI', 'Inter', sans-serif",
            fontSize: '12.5px',
            fontStyle: '800',
            color: pal.primaryHex,
          })
          .setOrigin(0.5, 0.5);
        this.roomPanelContainer.add(colLbl);
      }

      const badgeCopy = isHostSlot
        ? '👑 CHỦ PHÒNG'
        : st.guestReady
          ? '✓ SẴN SÀNG'
          : '⏳ ĐANG CHUẨN BỊ';
      const badgeColor = isHostSlot ? '#0D47A1' : st.guestReady ? '#1B5E20' : '#E65100';
      const badge = this.add
        .text(sx, sy + 86, badgeCopy, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '12.5px',
          fontStyle: '900',
          color: badgeColor,
        })
        .setOrigin(0.5, 0.5);

      this.roomPanelContainer.add([ring, sp, badge]);
    } else {
      const waitLbl = this.add
        .text(sx, sy + 12, 'ĐANG CHỜ\nBẠN BÈ VÀO…', {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '14.5px',
          fontStyle: '800',
          color: '#78909C',
          align: 'center',
        })
        .setOrigin(0.5, 0.5);
      this.roomPanelContainer.add(waitLbl);
    }
  }

  private launchOnlineMatch(cfg: OnlineMatchConfig): void {
    this.clearUrlRoomParam();
    this.scene.start('GameScene', {
      freshMatch: true,
      seed: cfg.matchSeed,
      onlineMatch: cfg,
    });
  }

  private clearUrlRoomParam(): void {
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.has('room')) {
        url.searchParams.delete('room');
        window.history.replaceState({}, '', url.toString());
      }
    } catch {
      // Ignore history API restrictions
    }
  }

  private copyToClipboard(text: string, successToast: string): void {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(() => this.showToast(successToast))
        .catch(() => this.showToast(`Mã mời: ${text}`));
    } else {
      this.showToast(`Mã mời: ${text}`);
    }
  }

  private showToast(msg: string): void {
    this.toastText.setText(msg);
    if (this.copyToastTimer) {
      this.copyToastTimer.remove();
    }
    this.copyToastTimer = this.time.delayedCall(3400, () => {
      if (this.toastText?.active) this.toastText.setText('');
    });
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (this.activeRulesModal) return;

    if (e.code === 'Escape' && !e.repeat) {
      this.clearUrlRoomParam();
      peerMultiplayer.disconnect();
      this.scene.start('MenuScene');
      return;
    }

    if (this.modeTab === 'join') {
      if (e.key === 'Backspace') {
        e.preventDefault();
        this.joinCodeBuffer = this.joinCodeBuffer.slice(0, -1);
        this.renderLobbyState(peerMultiplayer.getState());
        return;
      }
      if (e.code === 'Enter' && !e.repeat) {
        if (peerMultiplayer.isActive()) {
          peerMultiplayer.toggleGuestReady();
        } else if (this.joinCodeBuffer.length >= 4) {
          peerMultiplayer.joinRoom(this.joinCodeBuffer);
        }
        return;
      }
      if (/^[a-zA-Z0-9]$/.test(e.key) && !e.ctrlKey && !e.metaKey) {
        const nextRaw = normalizeRoomCode(this.joinCodeBuffer + e.key);
        this.joinCodeBuffer = nextRaw.slice(0, 4);
        this.renderLobbyState(peerMultiplayer.getState());
      }
    } else if (this.modeTab === 'host' && e.code === 'Enter' && !e.repeat) {
      const st = peerMultiplayer.getState();
      if (st.connected && st.guestReady) {
        peerMultiplayer.hostStartMatch();
      }
    }
  }

  private registerLobbyDiagnostics(): void {
    (
      window as unknown as {
        __PHASER_ONLINE_LOBBY__?: {
          getState: () => Readonly<LobbySharedState>;
          hostRoom: (code?: string) => void;
          joinRoom: (code: string) => void;
          toggleGuestReady: () => void;
          hostStartMatch: (seed?: number) => OnlineMatchConfig | null;
        };
      }
    ).__PHASER_ONLINE_LOBBY__ = {
      getState: () => peerMultiplayer.getState(),
      hostRoom: (code?: string) => {
        this.modeTab = 'host';
        peerMultiplayer.hostRoom(code);
      },
      joinRoom: (code: string) => {
        this.modeTab = 'join';
        this.joinCodeBuffer = normalizeRoomCode(code);
        peerMultiplayer.joinRoom(code);
      },
      toggleGuestReady: () => peerMultiplayer.toggleGuestReady(),
      hostStartMatch: (seed?: number) => peerMultiplayer.hostStartMatch(seed),
    };
  }
}
