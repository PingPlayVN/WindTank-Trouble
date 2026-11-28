import Phaser from 'phaser';
import {
  ARENA_VIEWPORT,
  BASE_GAMEPLAY,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  formatCrateSpawnIntervalLabel,
  getAIDifficultyDescriptor,
  getBattleModeDescriptor,
  getPaletteById,
  getSkillDescriptor,
  MOBILE_ARENA_VIEWPORT,
  POWERUP_CONFIG,
  UI_COLORS,
} from '../config/constants';
import { mobileOrientationManager } from '../managers/MobileOrientationManager';
import { settingsManager } from '../managers/SettingsManager';
import { peerMultiplayer, type LobbySharedState } from '../network/PeerMultiplayerManager';
import type { PlayerIndex, RoundResultSummary } from '../types/gameTypes';
import type { GameScene, HudSnapshot } from './GameScene';
import {
  animateModalOpen,
  createArcadeButton,
  createModalScrim,
  type ArcadeButtonHandle,
} from '../../ui/components/ArcadeWidgets';
import {
  createMobileFullscreenControls,
  type MobileFullscreenControlsHandle,
} from '../../ui/components/FullscreenPromptWidget';
import { MatchRulesModal } from '../../ui/components/MatchRulesModal';
import { SettingsModal } from '../../ui/components/SettingsModal';
import { SkillGuideModal } from '../../ui/components/SkillGuideModal';
import { TouchControlsOverlay } from '../../ui/components/TouchControlsOverlay';

interface PlayerPlaqueRefs {
  container: Phaser.GameObjects.Container;
  tankIcon: Phaser.GameObjects.Image;
  eliminatedCross: Phaser.GameObjects.Graphics;
  nameLbl: Phaser.GameObjects.Text;
  scoreText: Phaser.GameObjects.Text;
  hpGraphics: Phaser.GameObjects.Graphics;
  ammoGraphics: Phaser.GameObjects.Graphics;
  skillBadgeBg: Phaser.GameObjects.Graphics;
  skillBadgeText: Phaser.GameObjects.Text;
  lastScore: number;
  lastSkill: string | null;
  compact: boolean;
}

export class UIScene extends Phaser.Scene {
  private roundTitleText!: Phaser.GameObjects.Text;
  private goalBadgeText!: Phaser.GameObjects.Text;
  private netPingText!: Phaser.GameObjects.Text;
  private portraitHintText!: Phaser.GameObjects.Text;
  private muteBtn!: ArcadeButtonHandle;
  private rulesTopBtn!: ArcadeButtonHandle;
  private guideTopBtn!: ArcadeButtonHandle;
  private pauseTopBtn!: ArcadeButtonHandle;

  private scoreboardContainer!: Phaser.GameObjects.Container;
  private plaques: Map<PlayerIndex, PlayerPlaqueRefs> = new Map();
  private lastBuiltCompactMode = false;
  private lastSnapshot: HudSnapshot | null = null;

  private touchOverlay: TouchControlsOverlay | null = null;
  private fsControls: MobileFullscreenControlsHandle | null = null;

  private centerBannerContainer!: Phaser.GameObjects.Container;
  private centerBannerBg!: Phaser.GameObjects.Graphics;
  private centerBannerText!: Phaser.GameObjects.Text;

  private pauseModalContainer: Phaser.GameObjects.Container | null = null;
  private settingsModal: SettingsModal | null = null;
  private skillGuideModal: SkillGuideModal | null = null;
  private matchRulesModal: MatchRulesModal | null = null;
  private unsubNet: (() => void) | null = null;
  private onResizeBound!: () => void;

  constructor() {
    super('UIScene');
  }

  private hasActiveSubModal(): boolean {
    return Boolean(this.settingsModal || this.skillGuideModal || this.matchRulesModal);
  }

  getTouchOverlay(): TouchControlsOverlay | null {
    return this.touchOverlay;
  }

  create(): void {
    this.plaques.clear();
    this.lastSnapshot = null;
    this.pauseModalContainer = null;
    this.settingsModal = null;
    this.skillGuideModal = null;
    this.matchRulesModal = null;

    this.buildTopBar();
    this.scoreboardContainer = this.add.container(0, 0).setDepth(30);
    this.buildCenterBanner();

    this.touchOverlay = new TouchControlsOverlay(
      this,
      () => this.hasActiveSubModal() || Boolean(this.pauseModalContainer),
    );
    this.touchOverlay.setVisible(settingsManager.isTouchControlsActive());

    this.portraitHintText = this.add
      .text(
        DESIGN_WIDTH / 2,
        DESIGN_HEIGHT - 14,
        '📱 Xoay ngang điện thoại (Landscape) để có tầm nhìn mê cung rộng nhất!',
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '11.5px',
          fontStyle: '800',
          color: '#FFF8E1',
          backgroundColor: '#263238',
          padding: { x: 10, y: 3 },
        },
      )
      .setOrigin(0.5, 0.5)
      .setDepth(45)
      .setVisible(false);
    this.updatePortraitHint();

    this.onResizeBound = () => {
      this.syncTopBarLayout();
      this.touchOverlay?.redraw();
      this.updatePortraitHint();
    };
    window.addEventListener('resize', this.onResizeBound);

    this.unsubNet = peerMultiplayer.subscribeLobby((st: LobbySharedState) => {
      this.syncNetworkBadge(st);
    });

    const gameScene = this.scene.get('GameScene') as GameScene;

    const onHudSync = (snap: HudSnapshot) => this.renderHudSnapshot(snap);
    const onCountdown = (label: string) => this.showCountdownStep(label);
    const onFight = () => this.showFightFlash();
    const onResolved = (summary: RoundResultSummary) => this.showRoundOutcomeBanner(summary);
    const onPauseChanged = (paused: boolean) => this.syncPauseModal(paused);

    gameScene.events.on('hud-sync', onHudSync);
    gameScene.events.on('countdown-step', onCountdown);
    gameScene.events.on('fight-start', onFight);
    gameScene.events.on('round-resolved', onResolved);
    gameScene.events.on('pause-changed', onPauseChanged);

    if (gameScene.scene.isActive()) {
      const snap = gameScene.getHudSnapshot();
      if (snap.players.length > 0) {
        this.renderHudSnapshot(snap);
      }
    }

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('resize', this.onResizeBound);
      this.unsubNet?.();
      this.unsubNet = null;
      gameScene.events.off('hud-sync', onHudSync);
      gameScene.events.off('countdown-step', onCountdown);
      gameScene.events.off('fight-start', onFight);
      gameScene.events.off('round-resolved', onResolved);
      gameScene.events.off('pause-changed', onPauseChanged);
      this.touchOverlay?.destroy();
      this.touchOverlay = null;
      this.fsControls?.destroy();
      this.fsControls = null;
      this.settingsModal?.close(true);
      this.settingsModal = null;
      this.skillGuideModal?.close();
      this.skillGuideModal = null;
      this.matchRulesModal?.close(true);
      this.matchRulesModal = null;
      this.pauseModalContainer?.destroy(true);
      this.pauseModalContainer = null;
    });
  }

  refreshTouchLayout(): void {
    mobileOrientationManager.syncLayout();
    const active = settingsManager.isTouchControlsActive();
    this.syncTopBarLayout();
    this.touchOverlay?.setVisible(active);
    this.touchOverlay?.redraw();
    this.updatePortraitHint();
    const cy = active ? MOBILE_ARENA_VIEWPORT.centerY : ARENA_VIEWPORT.centerY;
    this.centerBannerContainer?.setY(cy);
    if (this.lastSnapshot) {
      this.rebuildScoreboardPlaques(this.lastSnapshot);
      this.renderHudSnapshot(this.lastSnapshot);
    }
  }

  private updatePortraitHint(): void {
    // CSS auto-landscape lock keeps the game rotated horizontally on portrait phones automatically!
    this.portraitHintText?.setVisible(false);
  }

  private syncNetworkBadge(st: LobbySharedState): void {
    if (!this.netPingText) return;
    if (st.role === 'offline') {
      this.netPingText.setVisible(false);
      return;
    }
    this.netPingText.setVisible(true);
    if (st.connected) {
      const roleTag = st.role === 'host' ? 'XE 1 • CHỦ' : 'XE 2 • KHÁCH';
      this.netPingText
        .setText(`🟢 ${st.formattedCode} • ${st.pingMs}ms (${roleTag})`)
        .setColor('#1B5E20');
    } else {
      this.netPingText.setText('🔴 MẤT KẾT NỐI ĐỐI THỦ!').setColor('#C62828');
    }
  }

  private openLiveMatchRules(): void {
    if (this.hasActiveSubModal()) return;
    if (peerMultiplayer.getRole() === 'guest') return;
    const gameScene = this.scene.get('GameScene') as GameScene;
    if (!gameScene.getIsPaused() && !peerMultiplayer.isOnlineSession()) {
      gameScene.setPaused(true);
    }
    this.matchRulesModal = new MatchRulesModal(this, {
      inMatch: true,
      onRulesChanged: () => {
        gameScene.refreshMatchRulesFromSettings();
      },
      onDropCrateNow: () => gameScene.dropMysteryCrateNow(),
      onClose: () => {
        this.matchRulesModal = null;
        gameScene.refreshMatchRulesFromSettings();
      },
    });
  }

  private buildTopBar(): void {
    const isMobile = settingsManager.isTouchControlsActive();
    const y = isMobile ? 19 : 22;
    const btnH = isMobile ? 32 : 30;

    this.roundTitleText = this.add
      .text(24, y, 'HIỆP 1', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: isMobile ? '14px' : '14.5px',
        fontStyle: '900',
        color: UI_COLORS.inkDarkHex,
      })
      .setOrigin(0, 0.5)
      .setDepth(30);

    this.goalBadgeText = this.add
      .text(DESIGN_WIDTH / 2, y, 'ĐẠT TRƯỚC 5 ĐIỂM', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: isMobile ? '12px' : '13px',
        fontStyle: '800',
        color: UI_COLORS.inkMutedHex,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(30);

    this.fsControls = createMobileFullscreenControls(this, {
      buttonX: DESIGN_WIDTH - 548,
      buttonY: y,
      buttonWidth: 108,
      buttonHeight: btnH,
      compactButton: true,
      showRecommendationBanner: false,
      depth: 30,
    });

    this.netPingText = this.add
      .text(318, y, '', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '11.5px',
        fontStyle: '900',
        color: '#1B5E20',
        backgroundColor: '#E8F5E9',
        padding: { x: 7, y: 3 },
      })
      .setOrigin(0, 0.5)
      .setDepth(30)
      .setVisible(false);

    const isGuestOnline = peerMultiplayer.getRole() === 'guest';
    this.rulesTopBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH - 422,
      y,
      width: 98,
      height: btnH,
      lipHeight: 2,
      label: '⚙ LUẬT',
      fontSize: 12,
      fillColor: 0xe3f2fd,
      hoverColor: 0xbbdefb,
      textColor: '#0D47A1',
      onClick: () => this.openLiveMatchRules(),
    });
    this.rulesTopBtn.container.setDepth(30).setVisible(!isGuestOnline);

    this.guideTopBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH - 310,
      y,
      width: 108,
      height: btnH,
      lipHeight: 2,
      label: '★ KỸ NĂNG',
      fontSize: 11.5,
      fillColor: 0xfff8e1,
      hoverColor: 0xffecb3,
      textColor: '#E65100',
      onClick: () => {
        if (this.hasActiveSubModal()) return;
        const gameScene = this.scene.get('GameScene') as GameScene;
        if (!gameScene.getIsPaused() && !peerMultiplayer.isOnlineSession()) {
          gameScene.setPaused(true);
        }
        this.skillGuideModal = new SkillGuideModal(this, {
          onClose: () => {
            this.skillGuideModal = null;
          },
        });
      },
    });
    this.guideTopBtn.container.setDepth(30);

    const s = settingsManager.getSettings();
    this.muteBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH - 190,
      y,
      width: 112,
      height: btnH,
      lipHeight: 2,
      label: s.soundEnabled ? 'ÂM: BẬT' : 'ÂM: TẮT',
      fontSize: 12,
      fillColor: UI_COLORS.cardBg,
      onClick: () => {
        const next = !settingsManager.getSettings().soundEnabled;
        settingsManager.setSoundEnabled(next);
        this.muteBtn.setLabel(next ? 'ÂM: BẬT' : 'ÂM: TẮT');
      },
    });
    this.muteBtn.container.setDepth(30);

    this.pauseTopBtn = createArcadeButton(this, {
      x: DESIGN_WIDTH - 68,
      y,
      width: 110,
      height: btnH,
      lipHeight: 2,
      label: peerMultiplayer.isOnlineSession() ? 'MENU' : 'TẠM DỪNG',
      fontSize: 12,
      fillColor: UI_COLORS.cardBg,
      onClick: () => {
        if (this.hasActiveSubModal()) return;
        const gameScene = this.scene.get('GameScene') as GameScene;
        gameScene.setPaused(!gameScene.getIsPaused());
      },
    });
    this.pauseTopBtn.container.setDepth(30);

    this.syncTopBarLayout();
  }

  private syncTopBarLayout(): void {
    const isMobile = settingsManager.isTouchControlsActive();
    const viewLeft = mobileOrientationManager.getViewLeft();
    const viewRight = mobileOrientationManager.getViewRight();
    const y = isMobile ? 19 : 22;

    const hasWindHubBridge =
      typeof window !== 'undefined' &&
      typeof document !== 'undefined' &&
      (Boolean(document.getElementById('windhub-exit-bridge')) || window.parent !== window);

    // Leave clean room on the top-left when embedded inside WindHub so `← Hub` never overlaps `HIỆP 1`!
    const titleLeftX = viewLeft + (hasWindHubBridge ? 108 : 20);
    this.roundTitleText?.setPosition(titleLeftX, y);
    this.netPingText?.setPosition(titleLeftX + 278, y);

    const isGuestOnline = peerMultiplayer.getRole() === 'guest';
    this.pauseTopBtn?.container.setPosition(viewRight - 68, y);
    this.muteBtn?.container.setPosition(viewRight - 188, y);
    this.guideTopBtn?.container.setPosition(viewRight - 306, y);
    this.rulesTopBtn?.container.setPosition(viewRight - 418, y).setVisible(!isGuestOnline);
    this.fsControls?.button?.container.setPosition(
      isGuestOnline ? viewRight - 422 : viewRight - 530,
      y,
    );

    const rightControlsLeftEdge = isMobile
      ? (isGuestOnline ? viewRight - 476 : viewRight - 584)
      : (isGuestOnline ? viewRight - 360 : viewRight - 468);
    const centerGoalX = Math.min(DESIGN_WIDTH / 2, rightControlsLeftEdge - 142);
    this.goalBadgeText?.setPosition(Math.max(titleLeftX + 240, centerGoalX), y);
  }

  private buildCenterBanner(): void {
    const cy = settingsManager.isTouchControlsActive()
      ? MOBILE_ARENA_VIEWPORT.centerY
      : ARENA_VIEWPORT.centerY;
    this.centerBannerContainer = this.add
      .container(DESIGN_WIDTH / 2, cy)
      .setDepth(50)
      .setVisible(false);

    this.centerBannerBg = this.add.graphics();
    this.centerBannerText = this.add
      .text(0, 0, '', {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '34px',
        fontStyle: '900',
        color: '#FFFFFF',
        stroke: '#18191B',
        strokeThickness: 6,
        align: 'center',
      })
      .setOrigin(0.5, 0.5);

    this.centerBannerContainer.add([this.centerBannerBg, this.centerBannerText]);
  }

  private formatSkillBadgeCopy(p: HudSnapshot['players'][number]): string {
    const activeSuit =
      p.skill ??
      (p.shieldRemaining > 0
        ? 'shield'
        : (p.phantomRemaining ?? 0) > 0
          ? 'phantom'
          : p.empOrbActive
            ? 'emp'
            : null);
    if (!activeSuit) return '';
    const desc = getSkillDescriptor(activeSuit);
    if (p.empOrbActive) {
      return 'EMP: BẤM KÍCH NỔ!';
    }
    if (p.shieldRemaining > 0 && !p.skill) {
      return `KHIÊN ${p.shieldRemaining.toFixed(1)}s`;
    }
    if ((p.phantomRemaining ?? 0) > 0 && !p.skill) {
      return `BÓNG MA ${(p.phantomRemaining ?? 0).toFixed(1)}s`;
    }
    if (p.skill === 'laser') {
      return p.laserChargeProgress !== null
        ? `TỤ LỰC ${Math.round(p.laserChargeProgress * 100)}%`
        : 'LASER: SẴN SÀNG';
    }
    if (p.skill === 'reaper') {
      return p.reaperActive ? 'QUÉT 180° ĐỎ-ĐEN!' : 'LƯỠI HÁI ĐỎ: SẴN';
    }
    if (p.skill === 'gatling') return `LIÊN THANH ${p.skillAmmo}/${POWERUP_CONFIG.gatlingAmmo}`;
    if (p.skill === 'flame') return `LỬA ${p.skillAmmo}/${POWERUP_CONFIG.flameAmmo}`;
    if (p.skill === 'scatter') return `PHÁO CHÙM ${p.skillAmmo}/${POWERUP_CONFIG.scatterAmmo}`;
    if (p.skill === 'mine') return `MÌN BÓNG MA ${p.skillAmmo}/${POWERUP_CONFIG.mineAmmo}`;
    if (p.skill === 'drill') return `MŨI KHOAN ${p.skillAmmo}/${POWERUP_CONFIG.drillAmmo}`;
    if (p.skill === 'cryo') return `HÀN BĂNG ${p.skillAmmo}/${POWERUP_CONFIG.cryoAmmo}`;
    if (p.skill === 'barrier') return `XÂY TƯỜNG ${p.skillAmmo}/${POWERUP_CONFIG.barrierAmmo}`;
    if (p.skill === 'warp') return p.warpBeaconPlaced ? 'BẤM: BIẾN VỀ + NỔ!' : 'MỎ NEO: ĐẶT CỔNG';
    if (p.skill === 'emp') return `XUNG ĐIỆN ${p.skillAmmo}/${POWERUP_CONFIG.empAmmo}`;
    if (p.skill === 'phantom') return 'BÓNG MA: SẴN SÀNG';
    if (p.skill === 'shield') return 'KHIÊN: SẴN SÀNG';
    if (p.skill === 'spike') return 'ĐẠN GAI: 1 VIÊN';
    if (p.skill === 'homing') return 'ĐỊNH VỊ: 1 QUẢ';
    return `${desc.hudShort}: ${p.skillAmmo}`;
  }

  private renderHudSnapshot(snap: HudSnapshot): void {
    this.lastSnapshot = snap;
    const isOnline = peerMultiplayer.isOnlineSession();
    const compactMode = settingsManager.isTouchControlsActive();

    const modeDesc = getBattleModeDescriptor(snap.battleMode ?? 'classic');
    this.roundTitleText.setText(`HIỆP ${snap.roundNumber} • ${snap.mapName.toUpperCase()}`);
    const goalBase =
      snap.winningScore <= 0 ? '∞ VÔ TẬN' : `THẮNG: ${snap.winningScore}Đ`;
    const crateLabel = formatCrateSpawnIntervalLabel(snap.crateIntervalSec, true);
    const goalCopy =
      snap.ties > 0
        ? `${modeDesc.shortBadge} • ${goalBase} • ${crateLabel} • HÒA: ${snap.ties}`
        : `${modeDesc.shortBadge} • ${goalBase} • ${crateLabel}`;
    this.goalBadgeText.setText(isOnline ? modeDesc.shortBadge : goalCopy);

    if (this.plaques.size !== snap.players.length || this.lastBuiltCompactMode !== compactMode) {
      this.rebuildScoreboardPlaques(snap);
    }

    // Sync weapon status & 2-player opposite tabletop mode to TouchControlsOverlay!
    if (this.touchOverlay && compactMode) {
      const dualOpposite =
        !isOnline &&
        snap.players.length === 2 &&
        !snap.players[0]?.isAI &&
        !snap.players[1]?.isAI;
      this.touchOverlay.setDualOppositeMode(dualOpposite);

      if (dualOpposite) {
        for (const slotIdx of [0, 1] as const) {
          const pl = snap.players[slotIdx];
          if (pl) {
            this.touchOverlay.syncPlayerHudStatus(slotIdx, {
              colorId: pl.colorId,
              ammo: pl.ammo,
              alive: pl.alive,
              skill: pl.skill,
              skillAmmo: pl.skillAmmo,
              laserChargeProgress: pl.laserChargeProgress,
              shieldRemaining: pl.shieldRemaining,
              phantomRemaining: pl.phantomRemaining,
              reaperActive: pl.reaperActive,
              warpBeaconPlaced: pl.warpBeaconPlaced,
              empOrbActive: pl.empOrbActive,
            });
          }
        }
      } else {
        const localIdx: PlayerIndex = peerMultiplayer.getRole() === 'guest' ? 1 : 0;
        const localP = snap.players.find((pl) => pl.index === localIdx) ?? snap.players[0];
        if (localP) {
          this.touchOverlay.syncPlayerHudStatus(0, {
            colorId: localP.colorId,
            ammo: localP.ammo,
            alive: localP.alive,
            skill: localP.skill,
            skillAmmo: localP.skillAmmo,
            laserChargeProgress: localP.laserChargeProgress,
            shieldRemaining: localP.shieldRemaining,
            phantomRemaining: localP.phantomRemaining,
            reaperActive: localP.reaperActive,
            warpBeaconPlaced: localP.warpBeaconPlaced,
            empOrbActive: localP.empOrbActive,
          });
        }
      }
    }

    for (const p of snap.players) {
      const ref = this.plaques.get(p.index);
      if (!ref) continue;

      let tag = '';
      if (isOnline) {
        tag = p.index === 0 ? (compactMode ? ' (CHỦ)' : ' • CHỦ PHÒNG') : compactMode ? ' (KHÁCH)' : ' • KHÁCH';
      } else if (p.isAI) {
        tag = compactMode
          ? ' (AI)'
          : ` • ${getAIDifficultyDescriptor(p.aiDifficulty).shortBadge}`;
      }
      ref.nameLbl.setText(`XE ${p.index + 1}${tag}`);

      const iconKey = p.visualSuit
        ? `tank_icon_${p.colorId}_${p.visualSuit}`
        : `tank_icon_${p.colorId}`;
      ref.tankIcon.setTexture(iconKey);
      ref.tankIcon.setAlpha(p.alive ? 1 : 0.32);
      ref.eliminatedCross.setVisible(!p.alive);

      if (p.score !== ref.lastScore) {
        ref.scoreText.setText(String(p.score));
        if (p.score > ref.lastScore) {
          this.tweens.killTweensOf(ref.scoreText);
          ref.scoreText.setScale(1.42);
          this.tweens.add({
            targets: ref.scoreText,
            scale: 1,
            duration: 260,
            ease: 'Back.easeOut',
          });
        }
        ref.lastScore = p.score;
      }

      ref.hpGraphics.clear();
      if (snap.hasArmorHp) {
        const ratio = p.maxHp > 0 ? Math.max(0, Math.min(1, p.hp / p.maxHp)) : 0;
        const barW = ref.compact ? 74 : 114;
        const barH = ref.compact ? 4.5 : 6;
        const fillCol = ratio > 0.6 ? 0x00c853 : ratio > 0.3 ? 0xffb300 : 0xff1744;
        ref.hpGraphics.fillStyle(0xd8dde6, 1);
        ref.hpGraphics.fillRoundedRect(0, -barH / 2, barW, barH, 2.5);
        if (ratio > 0 && p.alive) {
          ref.hpGraphics.fillStyle(fillCol, 1);
          ref.hpGraphics.fillRoundedRect(0, -barH / 2, Math.max(3, barW * ratio), barH, 2.5);
        }
        ref.hpGraphics.lineStyle(1, UI_COLORS.inkDark, 0.55);
        ref.hpGraphics.strokeRoundedRect(0, -barH / 2, barW, barH, 2.5);
      }

      ref.ammoGraphics.clear();
      ref.skillBadgeBg.clear();

      const activeSuit =
        p.skill ??
        (p.shieldRemaining > 0
          ? 'shield'
          : (p.phantomRemaining ?? 0) > 0
            ? 'phantom'
            : p.empOrbActive
              ? 'emp'
              : null);
      if (activeSuit !== ref.lastSkill) {
        ref.lastSkill = activeSuit;
        if (activeSuit) {
          this.tweens.killTweensOf(ref.tankIcon);
          const targetScale = ref.compact ? 0.5 : 0.92;
          ref.tankIcon.setScale(targetScale * 1.24);
          this.tweens.add({
            targets: ref.tankIcon,
            scale: targetScale,
            duration: 210,
            ease: 'Back.easeOut',
          });
        }
      }

      if (activeSuit) {
        const desc = getSkillDescriptor(activeSuit);
        const bw = ref.compact ? 94 : 116;
        const bh = ref.compact ? 14 : 20;
        ref.skillBadgeBg.fillStyle(desc.accentColor, 0.95);
        ref.skillBadgeBg.fillRoundedRect(-bw / 2, -bh / 2, bw, bh, 4);
        ref.skillBadgeBg.lineStyle(1.3, UI_COLORS.inkDark, 0.9);
        ref.skillBadgeBg.strokeRoundedRect(-bw / 2, -bh / 2, bw, bh, 4);

        const fullCopy = this.formatSkillBadgeCopy(p);
        ref.skillBadgeText
          .setText(ref.compact ? `${desc.hudShort} ${p.skillAmmo || ''}`.trim() : fullCopy)
          .setVisible(true);
      } else {
        ref.skillBadgeText.setVisible(false);

        const maxAmmo = BASE_GAMEPLAY.maxProjectilesPerTank;
        if (ref.compact) {
          // Single ultra-crisp row of 10 micro-dots inside the Mobile Top Pill
          for (let sIdx = 0; sIdx < maxAmmo; sIdx++) {
            const px = -31 + sIdx * 6.9;
            const filled = sIdx < p.ammo;
            ref.ammoGraphics.fillStyle(filled ? 0x22252a : 0xd0d4dc, 1);
            ref.ammoGraphics.fillCircle(px, 0, 2.3);
          }
        } else {
          const cols = 5;
          for (let sIdx = 0; sIdx < maxAmmo; sIdx++) {
            const col = sIdx % cols;
            const row = Math.floor(sIdx / cols);
            const px = -22 + col * 11;
            const py = row === 0 ? -5.5 : 5.5;
            const filled = sIdx < p.ammo;
            ref.ammoGraphics.fillStyle(filled ? 0x22252a : 0xd0d4dc, 1);
            ref.ammoGraphics.fillCircle(px, py, 3.3);
            if (filled) {
              ref.ammoGraphics.lineStyle(1, 0x111215, 0.9);
              ref.ammoGraphics.strokeCircle(px, py, 3.3);
            }
          }
        }
      }
    }
  }

  private rebuildScoreboardPlaques(snap: HudSnapshot): void {
    this.scoreboardContainer.removeAll(true);
    this.plaques.clear();

    const compact = settingsManager.isTouchControlsActive();
    this.lastBuiltCompactMode = compact;

    if (compact) {
      this.buildCompactMobileScorePills(snap);
      return;
    }

    const count = snap.players.length;
    const plaqueW = count === 4 ? 256 : count === 3 ? 280 : 304;
    const plaqueH = 80;
    const gap = 18;
    const totalW = count * plaqueW + (count - 1) * gap;
    const startX = DESIGN_WIDTH / 2 - totalW / 2 + plaqueW / 2;
    const barY = DESIGN_HEIGHT - ARENA_VIEWPORT.bottomBarHeight / 2 + 2;

    snap.players.forEach((p, idx) => {
      const cx = startX + idx * (plaqueW + gap);
      const palette = getPaletteById(p.colorId);

      const pCont = this.add.container(cx, barY + 20).setAlpha(0);
      this.tweens.add({
        targets: pCont,
        y: barY,
        alpha: 1,
        delay: idx * 45,
        duration: 240,
        ease: 'Back.easeOut',
      });

      const card = this.add.graphics();
      card.fillStyle(0x1d1f22, 0.12);
      card.fillRoundedRect(-plaqueW / 2 + 3, -plaqueH / 2 + 4, plaqueW, plaqueH, 10);
      card.fillStyle(UI_COLORS.cardBg, 1);
      card.fillRoundedRect(-plaqueW / 2, -plaqueH / 2, plaqueW, plaqueH, 10);
      card.fillStyle(palette.primary, 1);
      card.fillRoundedRect(-plaqueW / 2, -plaqueH / 2, 10, plaqueH, {
        tl: 10,
        bl: 10,
        tr: 0,
        br: 0,
      });
      card.lineStyle(2.4, UI_COLORS.inkDark, 1);
      card.strokeRoundedRect(-plaqueW / 2, -plaqueH / 2, plaqueW, plaqueH, 10);

      const iconX = -plaqueW / 2 + 44;
      const tankIcon = this.add
        .image(iconX, 0, `tank_icon_${palette.id}`)
        .setScale(0.92)
        .setRotation(-Math.PI / 2);

      const eliminatedCross = this.add.graphics().setVisible(false);
      eliminatedCross.lineStyle(3, UI_COLORS.dangerRed, 0.85);
      eliminatedCross.lineBetween(iconX - 15, -15, iconX + 15, 15);
      eliminatedCross.lineBetween(iconX + 15, -15, iconX - 15, 15);

      const nameLbl = this.add
        .text(-plaqueW / 2 + 82, -21, `XE ${p.index + 1}`, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '13px',
          fontStyle: '900',
          color: palette.primaryHex,
        })
        .setOrigin(0, 0.5);

      const hpGraphics = this.add.graphics().setPosition(-plaqueW / 2 + 82, -5);
      const ammoGraphics = this.add.graphics().setPosition(-plaqueW / 2 + 108, 15);
      const skillBadgeBg = this.add.graphics().setPosition(-plaqueW / 2 + 142, 15);
      const skillBadgeText = this.add
        .text(-plaqueW / 2 + 142, 15, '', {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '10.5px',
          fontStyle: '900',
          color: '#FFFFFF',
        })
        .setOrigin(0.5, 0.5)
        .setVisible(false);

      const scoreText = this.add
        .text(plaqueW / 2 - 25, 0, String(p.score), {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '32px',
          fontStyle: '900',
          color: UI_COLORS.inkDarkHex,
        })
        .setOrigin(0.5, 0.5);

      pCont.add([
        card,
        tankIcon,
        eliminatedCross,
        nameLbl,
        hpGraphics,
        ammoGraphics,
        skillBadgeBg,
        skillBadgeText,
        scoreText,
      ]);
      this.scoreboardContainer.add(pCont);

      this.plaques.set(p.index, {
        container: pCont,
        tankIcon,
        eliminatedCross,
        nameLbl,
        scoreText,
        hpGraphics,
        ammoGraphics,
        skillBadgeBg,
        skillBadgeText,
        lastScore: p.score,
        lastSkill: p.skill,
        compact: false,
      });
    });
  }

  /**
   * Compact Top-Header Score Pills (`y = 58`) for Mobile Touch Mode so the 112px bottom bar is
   * completely eliminated and left/right thumb controls have maximum vertical freedom!
   */
  private buildCompactMobileScorePills(snap: HudSnapshot): void {
    const count = snap.players.length;
    const pillW = count === 4 ? 204 : count === 3 ? 236 : 276;
    const pillH = 35;
    const gap = 12;
    const totalW = count * pillW + (count - 1) * gap;
    const startX = DESIGN_WIDTH / 2 - totalW / 2 + pillW / 2;
    const pillY = 53;

    snap.players.forEach((p, idx) => {
      const cx = startX + idx * (pillW + gap);
      const palette = getPaletteById(p.colorId);

      const pCont = this.add.container(cx, pillY);
      const card = this.add.graphics();
      card.fillStyle(UI_COLORS.cardBg, 0.96);
      card.fillRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, 8);
      card.fillStyle(palette.primary, 1);
      card.fillRoundedRect(-pillW / 2, -pillH / 2, 7, pillH, {
        tl: 8,
        bl: 8,
        tr: 0,
        br: 0,
      });
      card.lineStyle(2, UI_COLORS.inkDark, 0.95);
      card.strokeRoundedRect(-pillW / 2, -pillH / 2, pillW, pillH, 8);

      const iconX = -pillW / 2 + 24;
      const tankIcon = this.add
        .image(iconX, 0, `tank_icon_${palette.id}`)
        .setScale(0.5)
        .setRotation(-Math.PI / 2);

      const eliminatedCross = this.add.graphics().setVisible(false);
      eliminatedCross.lineStyle(2.4, UI_COLORS.dangerRed, 0.9);
      eliminatedCross.lineBetween(iconX - 9, -9, iconX + 9, 9);
      eliminatedCross.lineBetween(iconX + 9, -9, iconX - 9, 9);

      const nameLbl = this.add
        .text(-pillW / 2 + 48, -8.5, `XE ${p.index + 1}`, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '10.5px',
          fontStyle: '900',
          color: palette.primaryHex,
        })
        .setOrigin(0, 0.5);

      const hpGraphics = this.add.graphics().setPosition(-pillW / 2 + 48, 0.5);
      const ammoGraphics = this.add.graphics().setPosition(-pillW / 2 + 82, 8.5);
      const skillBadgeBg = this.add.graphics().setPosition(-pillW / 2 + 96, 8);
      const skillBadgeText = this.add
        .text(-pillW / 2 + 96, 8, '', {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '9px',
          fontStyle: '900',
          color: '#FFFFFF',
        })
        .setOrigin(0.5, 0.5)
        .setVisible(false);

      const scoreText = this.add
        .text(pillW / 2 - 16, 0, String(p.score), {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '20px',
          fontStyle: '900',
          color: UI_COLORS.inkDarkHex,
        })
        .setOrigin(0.5, 0.5);

      pCont.add([
        card,
        tankIcon,
        eliminatedCross,
        nameLbl,
        hpGraphics,
        ammoGraphics,
        skillBadgeBg,
        skillBadgeText,
        scoreText,
      ]);
      this.scoreboardContainer.add(pCont);

      this.plaques.set(p.index, {
        container: pCont,
        tankIcon,
        eliminatedCross,
        nameLbl,
        scoreText,
        hpGraphics,
        ammoGraphics,
        skillBadgeBg,
        skillBadgeText,
        lastScore: p.score,
        lastSkill: p.skill,
        compact: true,
      });
    });
  }

  private showCountdownStep(label: string): void {
    this.tweens.killTweensOf(this.centerBannerContainer);
    this.centerBannerBg.clear();
    this.centerBannerBg.fillStyle(0x1d1f22, 0.72);
    this.centerBannerBg.fillRoundedRect(-44, -32, 88, 64, 12);
    this.centerBannerBg.lineStyle(2.5, 0xffffff, 0.85);
    this.centerBannerBg.strokeRoundedRect(-44, -32, 88, 64, 12);

    this.centerBannerText.setText(label).setFontSize(38).setColor('#FFFFFF');
    this.centerBannerContainer.setVisible(true).setAlpha(1).setScale(1.28);
    this.tweens.add({
      targets: this.centerBannerContainer,
      scale: 1,
      duration: 220,
      ease: 'Back.easeOut',
    });
  }

  private showFightFlash(): void {
    this.tweens.killTweensOf(this.centerBannerContainer);
    this.centerBannerBg.clear();
    this.centerBannerBg.fillStyle(0x43a047, 0.92);
    this.centerBannerBg.fillRoundedRect(-124, -34, 248, 68, 12);
    this.centerBannerBg.lineStyle(3, UI_COLORS.inkDark, 1);
    this.centerBannerBg.strokeRoundedRect(-124, -34, 248, 68, 12);

    this.centerBannerText.setText('KHAI HỎA!').setFontSize(33).setColor('#FFFFFF');
    this.centerBannerContainer.setVisible(true).setAlpha(1).setScale(0.88);
    this.tweens.add({
      targets: this.centerBannerContainer,
      scale: 1.1,
      alpha: 0,
      duration: 440,
      ease: 'Cubic.easeOut',
      onComplete: () => this.centerBannerContainer.setVisible(false),
    });
  }

  private showRoundOutcomeBanner(summary: RoundResultSummary): void {
    this.tweens.killTweensOf(this.centerBannerContainer);
    this.centerBannerBg.clear();

    const s = settingsManager.getSettings();
    const isOnline = peerMultiplayer.isOnlineSession();
    let fill = 0x37474f;
    let message = 'HÒA HIỆP ĐẤU — KHÔNG CỘNG ĐIỂM!';

    if (summary.winnerIndex !== null) {
      const snapPlayer = this.lastSnapshot?.players.find((pl) => pl.index === summary.winnerIndex);
      const colorId = snapPlayer?.colorId ?? s.playerColors[summary.winnerIndex];
      const palette = getPaletteById(colorId);
      fill = palette.primary;
      const suffix = isOnline
        ? summary.winnerIndex === 0
          ? ' (CHỦ PHÒNG)'
          : ' (KHÁCH)'
        : s.playerIsAI[summary.winnerIndex]
          ? ' (AI)'
          : '';
      message =
        summary.matchWinnerIndex !== null
          ? `XE ${summary.winnerIndex + 1}${suffix} THẮNG CHUNG CUỘC!`
          : `XE ${summary.winnerIndex + 1}${suffix} GHI ĐIỂM!`;
    }

    const boxW = Math.max(340, message.length * 17 + 60);
    this.centerBannerBg.fillStyle(fill, 0.95);
    this.centerBannerBg.fillRoundedRect(-boxW / 2, -38, boxW, 76, 14);
    this.centerBannerBg.lineStyle(3.2, UI_COLORS.inkDark, 1);
    this.centerBannerBg.strokeRoundedRect(-boxW / 2, -38, boxW, 76, 14);

    this.centerBannerText.setText(message).setFontSize(27).setColor('#FFFFFF');
    this.centerBannerContainer.setVisible(true).setAlpha(1).setScale(0.82);
    this.tweens.add({
      targets: this.centerBannerContainer,
      scale: 1,
      duration: 260,
      ease: 'Back.easeOut',
    });
  }

  private syncPauseModal(paused: boolean): void {
    if (!paused) {
      this.settingsModal?.close();
      this.settingsModal = null;
      this.skillGuideModal?.close();
      this.skillGuideModal = null;
      this.matchRulesModal?.close();
      this.matchRulesModal = null;
      this.pauseModalContainer?.destroy(true);
      this.pauseModalContainer = null;
      return;
    }

    if (this.pauseModalContainer) return;
    const gameScene = this.scene.get('GameScene') as GameScene;
    const isOnline = peerMultiplayer.isOnlineSession();
    const isGuest = peerMultiplayer.getRole() === 'guest';

    const modal = this.add.container(0, 0).setDepth(120);
    const contentRoot = this.add.container(0, 0);
    this.pauseModalContainer = modal;

    const scrim = createModalScrim(this, 0x101215, 0.56);

    // Spacious 2-Column Pause Panel (`560×412`): Full-width Resume -> 2×2 Action Grid -> Full-width Exit!
    const pw = 560;
    const ph = 412;
    const px = DESIGN_WIDTH / 2;
    const py = DESIGN_HEIGHT / 2;

    const card = this.add.graphics();
    card.fillStyle(0x1d1f22, 0.24);
    card.fillRoundedRect(px - pw / 2 + 5, py - ph / 2 + 7, pw, ph, 16);
    card.fillStyle(UI_COLORS.cardBg, 1);
    card.fillRoundedRect(px - pw / 2, py - ph / 2, pw, ph, 16);
    card.fillStyle(UI_COLORS.inkDark, 1);
    card.fillRoundedRect(px - pw / 2, py - ph / 2, pw, 56, {
      tl: 16,
      tr: 16,
      bl: 0,
      br: 0,
    });
    card.lineStyle(3, UI_COLORS.inkDark, 1);
    card.strokeRoundedRect(px - pw / 2, py - ph / 2, pw, ph, 16);

    const hdr = this.add
      .text(
        px,
        py - ph / 2 + 28,
        isOnline ? `MENU PHÒNG ${peerMultiplayer.getState().formattedCode}` : 'TẠM DỪNG TRẬN ĐẤU',
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '22px',
          fontStyle: '900',
          color: '#FFFFFF',
        },
      )
      .setOrigin(0.5, 0.5);

    const fullBtnW = 496;
    const gridBtnW = 240;

    const resumeBtn = createArcadeButton(this, {
      x: px,
      y: py - 98,
      width: fullBtnW,
      height: 50,
      lipHeight: 4,
      label: '▶ TIẾP TỤC CHƠI (ESC)',
      fontSize: 17,
      fillColor: 0x43a047,
      hoverColor: 0x4caf50,
      textColor: '#FFFFFF',
      onClick: () => {
        if (this.hasActiveSubModal()) return;
        gameScene.setPaused(false);
      },
    });

    const rulesBtn = createArcadeButton(this, {
      x: px - 128,
      y: py - 28,
      width: gridBtnW,
      height: 48,
      label: isGuest ? '⚙ LUẬT CHỦ PHÒNG' : '⚙ LUẬT & ĐỘ KHÓ AI',
      fontSize: 14,
      fillColor: isGuest ? UI_COLORS.cardAltBg : 0xe3f2fd,
      hoverColor: isGuest ? UI_COLORS.cardAltBg : 0xbbdefb,
      textColor: isGuest ? UI_COLORS.inkMutedHex : '#0D47A1',
      onClick: () => {
        if (!isGuest) this.openLiveMatchRules();
      },
    });

    const restartBtn = createArcadeButton(this, {
      x: px + 128,
      y: py - 28,
      width: gridBtnW,
      height: 48,
      label: isGuest ? '⏳ CHỜ ĐẤU LẠI' : '↻ CHƠI LẠI TỪ ĐẦU',
      fontSize: 14,
      fillColor: isGuest ? UI_COLORS.cardAltBg : UI_COLORS.cardBg,
      onClick: () => {
        if (this.hasActiveSubModal() || isGuest) return;
        gameScene.restartWholeMatch();
      },
    });

    const skillsBtn = createArcadeButton(this, {
      x: px - 128,
      y: py + 34,
      width: gridBtnW,
      height: 48,
      label: '★ CẨM NANG KỸ NĂNG',
      fontSize: 14,
      fillColor: 0xfff8e1,
      hoverColor: 0xffecb3,
      textColor: '#E65100',
      onClick: () => {
        if (this.hasActiveSubModal()) return;
        this.skillGuideModal = new SkillGuideModal(this, {
          onClose: () => {
            this.skillGuideModal = null;
          },
        });
      },
    });

    const settingsBtn = createArcadeButton(this, {
      x: px + 128,
      y: py + 34,
      width: gridBtnW,
      height: 48,
      label: settingsManager.isTouchControlsActive()
        ? '⚙ CÀI ĐẶT & ĐỘ NHẠY'
        : '⚙ CÀI ĐẶT & ĐỔI PHÍM',
      fontSize: 14,
      fillColor: UI_COLORS.cardBg,
      onClick: () => {
        if (this.hasActiveSubModal()) return;
        this.settingsModal = new SettingsModal(this, {
          mode: 'settings',
          onClose: () => {
            this.settingsModal = null;
            this.muteBtn.setLabel(
              settingsManager.getSettings().soundEnabled ? 'ÂM: BẬT' : 'ÂM: TẮT',
            );
            this.refreshTouchLayout();
          },
          onBindingsUpdated: () => {
            gameScene.refreshBindingsFromSettings();
            this.refreshTouchLayout();
          },
        });
      },
    });

    const menuBtn = createArcadeButton(this, {
      x: px,
      y: py + 100,
      width: fullBtnW,
      height: 48,
      label: isOnline ? '← RỜI PHÒNG ONLINE & VỀ TRANG CHỦ' : '← VỀ TRANG CHỦ',
      fontSize: 15,
      fillColor: 0xffebee,
      hoverColor: 0xffcdd2,
      textColor: UI_COLORS.dangerRedHex,
      onClick: () => {
        if (this.hasActiveSubModal()) return;
        if (isOnline) {
          peerMultiplayer.disconnect();
        }
        gameScene.exitToMainMenu();
      },
    });

    contentRoot.add([
      card,
      hdr,
      resumeBtn.container,
      rulesBtn.container,
      restartBtn.container,
      skillsBtn.container,
      settingsBtn.container,
      menuBtn.container,
    ]);
    modal.add([scrim, contentRoot]);
    animateModalOpen(this, scrim, contentRoot);
  }
}
