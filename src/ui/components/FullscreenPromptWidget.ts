import Phaser from 'phaser';
import { DESIGN_WIDTH, UI_COLORS } from '../../game/config/constants';
import { mobileOrientationManager } from '../../game/managers/MobileOrientationManager';
import { settingsManager } from '../../game/managers/SettingsManager';
import { createArcadeButton, type ArcadeButtonHandle } from './ArcadeWidgets';

export interface MobileFullscreenControlsOptions {
  buttonX?: number;
  buttonY?: number;
  buttonWidth?: number;
  buttonHeight?: number;
  compactButton?: boolean;
  showRecommendationBanner?: boolean;
  bannerY?: number;
  depth?: number;
}

export interface MobileFullscreenControlsHandle {
  button: ArcadeButtonHandle | null;
  destroy: () => void;
}

/**
 * Renders a Mobile-only Fullscreen toggle button (`⛶ FULL MÀN HÌNH` / `✕ THOÁT FULL`)
 * PLUS an encouraging notification banner recommending Mobile players enable Fullscreen
 * for maximum arena visibility and locked landscape ergonomics!
 */
export function createMobileFullscreenControls(
  scene: Phaser.Scene,
  opts: MobileFullscreenControlsOptions = {},
): MobileFullscreenControlsHandle {
  if (!settingsManager.isTouchControlsActive()) {
    return { button: null, destroy: () => {} };
  }

  const depth = opts.depth ?? 95;
  const compact = Boolean(opts.compactButton);
  const bx = opts.buttonX ?? mobileOrientationManager.getViewRight() - 92;
  const by = opts.buttonY ?? 38;
  const bw = opts.buttonWidth ?? (compact ? 108 : 164);
  const bh = opts.buttonHeight ?? (compact ? 31 : 40);

  let bannerContainer: Phaser.GameObjects.Container | null = null;
  let fallbackToast: Phaser.GameObjects.Text | null = null;

  const formatLabel = (isFull: boolean) => {
    if (compact) return isFull ? '✕ THOÁT' : '⛶ FULL MÀN';
    return isFull ? '✕ THOÁT FULL' : '⛶ FULL MÀN HÌNH';
  };

  const showFallbackNotice = (msg: string) => {
    fallbackToast?.destroy();
    fallbackToast = scene.add
      .text(DESIGN_WIDTH / 2, (opts.bannerY ?? 52) + 46, msg, {
        fontFamily: "'Segoe UI', 'Inter', sans-serif",
        fontSize: '12.5px',
        fontStyle: '800',
        color: '#FFF8E1',
        backgroundColor: '#263238',
        padding: { x: 12, y: 6 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(depth + 4);

    scene.time.delayedCall(3400, () => {
      if (fallbackToast?.active) {
        fallbackToast.destroy();
        fallbackToast = null;
      }
    });
  };

  const hideBanner = () => {
    if (!bannerContainer) {
      btn.container.setVisible(true);
      return;
    }
    const target = bannerContainer;
    bannerContainer = null;
    btn.container.setVisible(true);
    scene.tweens.add({
      targets: target,
      y: target.y - 24,
      alpha: 0,
      duration: 180,
      ease: 'Quad.easeIn',
      onComplete: () => target.destroy(true),
    });
  };

  const handleToggle = async () => {
    const res = await mobileOrientationManager.toggleFullscreen();
    syncBtnVisual(mobileOrientationManager.isFullscreen());
    if (res.isFullscreen) {
      hideBanner();
    } else if (!res.ok && res.unsupportedReason) {
      hideBanner();
      showFallbackNotice(res.unsupportedReason);
    }
  };

  const btn = createArcadeButton(scene, {
    x: bx,
    y: by,
    width: bw,
    height: bh,
    lipHeight: compact ? 2 : 3,
    label: formatLabel(mobileOrientationManager.isFullscreen()),
    fontSize: compact ? 11.5 : 13,
    fillColor: 0xe3f2fd,
    hoverColor: 0xbbdefb,
    textColor: '#0D47A1',
    onClick: () => {
      void handleToggle();
    },
  });
  btn.container.setDepth(depth);

  const syncBtnVisual = (isFull: boolean) => {
    btn.setLabel(formatLabel(isFull));
    btn.setFill(
      isFull ? 0xe8f5e9 : 0xe3f2fd,
      isFull ? 0xc8e6c9 : 0xbbdefb,
      isFull ? '#1B5E20' : '#0D47A1',
    );
    if (isFull) {
      hideBanner();
    }
  };
  syncBtnVisual(mobileOrientationManager.isFullscreen());

  // Show encouraging Fullscreen Recommendation Notification Banner when not yet in Fullscreen!
  if (opts.showRecommendationBanner && !mobileOrientationManager.hasDismissedFullscreenPrompt()) {
    // Hide the duplicate top-right button while the wide recommendation banner is visible!
    btn.container.setVisible(false);
    const targetY = opts.bannerY ?? 44;
    const cardW = 852;
    const cardH = 48;

    bannerContainer = scene.add
      .container(DESIGN_WIDTH / 2, targetY - 26)
      .setDepth(depth + 2)
      .setAlpha(0);

    const bg = scene.add.graphics();
    bg.fillStyle(0x1d1f22, 0.2);
    bg.fillRoundedRect(-cardW / 2 + 3, -cardH / 2 + 4, cardW, cardH, 12);
    bg.fillStyle(0xfff8e1, 0.98);
    bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);
    bg.lineStyle(2.4, 0xf9a825, 1);
    bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 12);

    const msgText = scene.add
      .text(
        -cardW / 2 + 20,
        0,
        '★ Khuyến khích bật TOÀN MÀN HÌNH để ẩn thanh trình duyệt & lái xe rộng rãi nhất!',
        {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: '13px',
          fontStyle: '800',
          color: UI_COLORS.inkDarkHex,
        },
      )
      .setOrigin(0, 0.5);

    const activateBtn = createArcadeButton(scene, {
      x: cardW / 2 - 144,
      y: 0,
      width: 162,
      height: 32,
      lipHeight: 2.5,
      label: '⛶ BẬT FULL MÀN',
      fontSize: 12,
      fillColor: 0x2e7d32,
      hoverColor: 0x388e3c,
      textColor: '#FFFFFF',
      onClick: () => {
        void handleToggle();
      },
    });

    const closeBtn = createArcadeButton(scene, {
      x: cardW / 2 - 34,
      y: 0,
      width: 40,
      height: 32,
      lipHeight: 2.5,
      label: '✕',
      fontSize: 13,
      fillColor: UI_COLORS.cardAltBg,
      onClick: () => {
        mobileOrientationManager.dismissFullscreenPrompt();
        hideBanner();
      },
    });

    bannerContainer.add([bg, msgText, activateBtn.container, closeBtn.container]);

    scene.tweens.add({
      targets: bannerContainer,
      y: targetY,
      alpha: 1,
      delay: 180,
      duration: 280,
      ease: 'Back.easeOut',
    });
  }

  const unsub = mobileOrientationManager.subscribeFullscreen((isFull) => {
    if (btn.container.scene) {
      syncBtnVisual(isFull);
    }
  });

  return {
    button: btn,
    destroy: () => {
      unsub();
      fallbackToast?.destroy();
      fallbackToast = null;
      bannerContainer?.destroy(true);
      bannerContainer = null;
      if (btn.container.scene) {
        btn.container.destroy(true);
      }
    },
  };
}
