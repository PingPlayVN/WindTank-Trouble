import Phaser from 'phaser';
import { DESIGN_HEIGHT, DESIGN_WIDTH, isTouchDeviceDetected } from '../config/constants';
import { settingsManager } from '../managers/SettingsManager';

export interface MobileViewportState {
  isMobileUi: boolean;
  isCssPortraitRotated: boolean;
  viewportWidth: number;
  viewportHeight: number;
}

/**
 * Automatically detects Mobile vs PC, locks the page against mobile scroll/bounce/zoom,
 * attempts native Screen Orientation Landscape lock on user gesture, and — whenever a mobile
 * player holds their phone vertically (`innerHeight > innerWidth`) — applies an instant, centered
 * `90deg` CSS landscape rotation to `#game-root` WITH exact live pointer-coordinate remapping!
 */
class MobileOrientationManager {
  private game: Phaser.Game | null = null;
  private cssRotated = false;
  private attached = false;
  private pointerHooked = false;

  attach(game: Phaser.Game): void {
    this.game = game;

    const onGameReady = () => {
      if (!this.pointerHooked && game.input) {
        this.pointerHooked = true;
        game.input.transformPointer = (
          pointer: Phaser.Input.Pointer,
          pageX: number,
          pageY: number,
          wasMove: boolean,
        ) => {
          this.transformCanvasPointer(pointer, pageX, pageY, wasMove);
        };
      }
      this.syncLayout();
    };

    if (game.isBooted) {
      onGameReady();
    } else {
      game.events.once(Phaser.Core.Events.READY, onGameReady);
    }

    if (!this.attached && typeof window !== 'undefined') {
      this.attached = true;
      const onResize = () => this.syncLayout();
      window.addEventListener('resize', onResize);
      window.addEventListener('orientationchange', onResize);
      window.visualViewport?.addEventListener('resize', onResize);

      const tryLockNativeLandscape = () => {
        if (!this.shouldUseMobileMode()) return;
        const scr = window.screen as Screen & {
          orientation?: { lock?: (mode: string) => Promise<void> };
        };
        if (scr?.orientation?.lock) {
          scr.orientation.lock('landscape').catch(() => {
            // Outside fullscreen, browsers reject lock(); CSS 90deg landscape lock handles it seamlessly!
          });
        }
      };
      window.addEventListener('touchstart', tryLockNativeLandscape, { passive: true });
      window.addEventListener('pointerdown', tryLockNativeLandscape, { passive: true });
    }

    this.syncLayout();
    this.registerDiagnostics();
  }

  shouldUseMobileMode(): boolean {
    return isTouchDeviceDetected();
  }

  isCssLandscapeRotated(): boolean {
    return this.cssRotated;
  }

  getState(): MobileViewportState {
    const w = typeof window !== 'undefined' ? window.innerWidth : DESIGN_WIDTH;
    const h = typeof window !== 'undefined' ? window.innerHeight : DESIGN_HEIGHT;
    return {
      isMobileUi: this.shouldUseMobileMode(),
      isCssPortraitRotated: this.cssRotated,
      viewportWidth: w,
      viewportHeight: h,
    };
  }

  syncLayout(): void {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    const isMobile = this.shouldUseMobileMode();
    const vw = Math.max(1, window.innerWidth);
    const vh = Math.max(1, window.innerHeight);
    const needCssRotate = isMobile && vh > vw;

    this.cssRotated = needCssRotate;
    document.body.classList.toggle('is-mobile-device', isMobile);
    document.body.classList.toggle('mobile-force-landscape', needCssRotate);

    // Enforce 2-player maximum automatically whenever Mobile mode is active
    if (isMobile && settingsManager.getSettings().playerCount > 2) {
      settingsManager.setPlayerCount(2);
    }

    const availW = needCssRotate ? vh : vw;
    const availH = needCssRotate ? vw : vh;

    const root = document.getElementById('game-root');
    if (root) {
      root.style.width = `${availW}px`;
      root.style.height = `${availH}px`;
    }

    if (this.game?.scale && this.game.isBooted) {
      this.game.scale.setParentSize(availW, availH);
    }

    const canvas = this.game?.canvas;
    if (canvas) {
      const fitScale = Math.min(availW / DESIGN_WIDTH, availH / DESIGN_HEIGHT);
      const cssW = Math.max(1, Math.floor(DESIGN_WIDTH * fitScale));
      const cssH = Math.max(1, Math.floor(DESIGN_HEIGHT * fitScale));
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.style.margin = '0px';
    }
  }

  /**
   * Live, zero-stale-cache pointer coordinate mapper from screen `(pageX, pageY)` into `1280×760`
   * design coordinates for BOTH normal landscape and `+90deg` CSS-rotated portrait viewports!
   */
  private transformCanvasPointer(
    pointer: Phaser.Input.Pointer,
    pageX: number,
    pageY: number,
    wasMove: boolean,
  ): void {
    const canvas = this.game?.canvas;
    if (!canvas) return;

    const p0 = pointer.position;
    const prev = pointer.prevPosition;
    prev.x = p0.x;
    prev.y = p0.y;

    const clientX = pageX - window.scrollX;
    const clientY = pageY - window.scrollY;
    const rect = canvas.getBoundingClientRect();

    let x = 0;
    let y = 0;

    if (!this.cssRotated) {
      const w = Math.max(1, rect.width);
      const h = Math.max(1, rect.height);
      x = ((clientX - rect.left) / w) * DESIGN_WIDTH;
      y = ((clientY - rect.top) / h) * DESIGN_HEIGHT;
    } else {
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const unrotCssW = Math.max(1, rect.height);
      const unrotCssH = Math.max(1, rect.width);

      // Inverse of +90deg clockwise rotation around (cx, cy):
      const u = clientY - cy;
      const v = -(clientX - cx);
      x = ((u + unrotCssW * 0.5) / unrotCssW) * DESIGN_WIDTH;
      y = ((v + unrotCssH * 0.5) / unrotCssH) * DESIGN_HEIGHT;
    }

    p0.x = x;
    p0.y = y;
    pointer.x = x;
    pointer.y = y;

    if (!wasMove) {
      pointer.downX = x;
      pointer.downY = y;
      prev.x = x;
      prev.y = y;
    }
  }

  private registerDiagnostics(): void {
    (
      window as unknown as {
        __WINDTANK_ORIENTATION__?: {
          getState: () => MobileViewportState;
          syncLayout: () => void;
        };
      }
    ).__WINDTANK_ORIENTATION__ = {
      getState: () => this.getState(),
      syncLayout: () => this.syncLayout(),
    };
  }
}

export const mobileOrientationManager = new MobileOrientationManager();
