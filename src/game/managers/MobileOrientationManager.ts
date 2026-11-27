import Phaser from 'phaser';
import {
  computeMobileLogicalWidth,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  isTouchDeviceDetected,
  resolveLocalMobileArenaViewport,
} from '../config/constants';
import { settingsManager } from '../managers/SettingsManager';

export { computeMobileLogicalWidth };

export interface MobileViewportState {
  isMobileUi: boolean;
  isCssPortraitRotated: boolean;
  isFullscreen: boolean;
  viewportWidth: number;
  viewportHeight: number;
  logicalWidth: number;
  viewLeft: number;
  viewRight: number;
}

type FullscreenListener = (isFullscreen: boolean) => void;

/**
 * Automatically detects Mobile vs PC, locks the page against mobile scroll/bounce/zoom,
 * expands widescreen mobile canvases up to `1680×760` (centered around `DESIGN_WIDTH / 2 = 640`
 * so zero gray letterbox sidebars appear on modern 19.5:9 / 20:9 phones), manages Cross-Browser
 * Fullscreen + Native Landscape Orientation Lock, and — whenever a mobile player holds their phone
 * vertically (`innerHeight > innerWidth`) — applies an instant, centered `90deg` CSS landscape
 * rotation to `#game-root` WITH exact live pointer-coordinate remapping!
 */
class MobileOrientationManager {
  private game: Phaser.Game | null = null;
  private cssRotated = false;
  private logicalWidth = DESIGN_WIDTH;
  private expectedCssW = '';
  private expectedCssH = '';
  private attached = false;
  private pointerHooked = false;
  private fullscreenPromptDismissed = false;
  private readonly fullscreenListeners = new Set<FullscreenListener>();

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
        // Prevent Phaser ScaleManager's internal getBoundingClientRect() refresh from clobbering
        // canvas CSS dimensions when #game-root is rotated +90deg on portrait phones!
        game.scale?.on(Phaser.Scale.Events.RESIZE, () => this.enforceCanvasStyle());
        game.events.on(Phaser.Core.Events.PRE_RENDER, () => {
          this.enforceCanvasStyle();
          this.ensureSceneCameraSizes();
        });
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

      const onFsChange = () => {
        const full = this.isFullscreen();
        if (full) {
          this.fullscreenPromptDismissed = true;
          this.tryLockNativeLandscape();
        }
        this.syncLayout();
        window.requestAnimationFrame(() => this.syncLayout());
        // Delayed sync after browser finishes animating status/address bar hide
        window.setTimeout(() => this.syncLayout(), 120);
        for (const fn of this.fullscreenListeners) {
          fn(full);
        }
      };
      document.addEventListener('fullscreenchange', onFsChange);
      document.addEventListener('webkitfullscreenchange', onFsChange);

      window.addEventListener('touchstart', () => this.tryLockNativeLandscape(), { passive: true });
      window.addEventListener('pointerdown', () => this.tryLockNativeLandscape(), { passive: true });
    }

    this.syncLayout();
    this.registerDiagnostics();
  }

  private tryLockNativeLandscape(): void {
    if (!this.shouldUseMobileMode() || typeof window === 'undefined') return;
    const scr = window.screen as Screen & {
      orientation?: { lock?: (mode: string) => Promise<void> };
    };
    if (scr?.orientation?.lock) {
      scr.orientation.lock('landscape').catch(() => {
        // Outside fullscreen, mobile browsers reject lock(); CSS 90deg landscape lock handles it!
      });
    }
  }

  shouldUseMobileMode(): boolean {
    return isTouchDeviceDetected();
  }

  isCssLandscapeRotated(): boolean {
    return this.cssRotated;
  }

  isFullscreen(): boolean {
    if (typeof document === 'undefined') return false;
    const doc = document as Document & { webkitFullscreenElement?: Element | null };
    return Boolean(doc.fullscreenElement || doc.webkitFullscreenElement);
  }

  isFullscreenSupported(): boolean {
    if (typeof document === 'undefined') return false;
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };
    return Boolean(el && (typeof el.requestFullscreen === 'function' || typeof el.webkitRequestFullscreen === 'function'));
  }

  async toggleFullscreen(): Promise<{ ok: boolean; isFullscreen: boolean; unsupportedReason?: string }> {
    if (typeof document === 'undefined') {
      return { ok: false, isFullscreen: false };
    }

    const doc = document as Document & {
      webkitFullscreenElement?: Element | null;
      webkitExitFullscreen?: () => Promise<void> | void;
    };
    const el = document.documentElement as HTMLElement & {
      webkitRequestFullscreen?: () => Promise<void> | void;
    };

    try {
      if (this.isFullscreen()) {
        if (typeof doc.exitFullscreen === 'function') {
          await doc.exitFullscreen();
        } else if (typeof doc.webkitExitFullscreen === 'function') {
          await doc.webkitExitFullscreen();
        }
        this.syncLayout();
        return { ok: true, isFullscreen: false };
      }

      if (typeof el.requestFullscreen === 'function') {
        await el.requestFullscreen({ navigationUI: 'hide' });
      } else if (typeof el.webkitRequestFullscreen === 'function') {
        await el.webkitRequestFullscreen();
      } else {
        this.fullscreenPromptDismissed = true;
        return {
          ok: false,
          isFullscreen: false,
          unsupportedReason:
            'Trên iPhone Safari: bấm nút Chia Sẻ → "Thêm vào MH chính" để mở Toàn Màn Hình!',
        };
      }

      this.fullscreenPromptDismissed = true;
      this.tryLockNativeLandscape();
      this.syncLayout();
      return { ok: true, isFullscreen: true };
    } catch {
      return {
        ok: false,
        isFullscreen: this.isFullscreen(),
        unsupportedReason:
          'Trình duyệt chặn tự động Toàn Màn Hình — hãy mở bằng Chrome hoặc Thêm vào Màn Hình Chính!',
      };
    }
  }

  hasDismissedFullscreenPrompt(): boolean {
    return this.fullscreenPromptDismissed || this.isFullscreen();
  }

  dismissFullscreenPrompt(): void {
    this.fullscreenPromptDismissed = true;
  }

  subscribeFullscreen(fn: FullscreenListener): () => void {
    this.fullscreenListeners.add(fn);
    return () => {
      this.fullscreenListeners.delete(fn);
    };
  }

  getLogicalWidth(): number {
    return this.logicalWidth;
  }

  getViewLeft(): number {
    return -Math.round((this.logicalWidth - DESIGN_WIDTH) / 2);
  }

  getViewRight(): number {
    return DESIGN_WIDTH + Math.round((this.logicalWidth - DESIGN_WIDTH) / 2);
  }

  getLocalMobileArenaViewport() {
    return resolveLocalMobileArenaViewport(this.logicalWidth);
  }

  getState(): MobileViewportState {
    const w = typeof window !== 'undefined' ? window.innerWidth : DESIGN_WIDTH;
    const h = typeof window !== 'undefined' ? window.innerHeight : DESIGN_HEIGHT;
    return {
      isMobileUi: this.shouldUseMobileMode(),
      isCssPortraitRotated: this.cssRotated,
      isFullscreen: this.isFullscreen(),
      viewportWidth: w,
      viewportHeight: h,
      logicalWidth: this.logicalWidth,
      viewLeft: this.getViewLeft(),
      viewRight: this.getViewRight(),
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

    const nextLogicalW = computeMobileLogicalWidth(availW, availH, isMobile);
    const logicalWidthChanged = nextLogicalW !== this.logicalWidth;
    this.logicalWidth = nextLogicalW;

    const fitScale = Math.min(availW / this.logicalWidth, availH / DESIGN_HEIGHT);
    const cssW = Math.max(1, Math.floor(this.logicalWidth * fitScale));
    const cssH = Math.max(1, Math.floor(DESIGN_HEIGHT * fitScale));
    this.expectedCssW = `${cssW}px`;
    this.expectedCssH = `${cssH}px`;

    if (this.game?.scale && this.game.isBooted) {
      if (this.game.scale.width !== this.logicalWidth || this.game.scale.height !== DESIGN_HEIGHT) {
        this.game.scale.resize(this.logicalWidth, DESIGN_HEIGHT);
      }
      this.game.scale.setParentSize(availW, availH);
      this.ensureSceneCameraSizes(logicalWidthChanged);
    }

    this.enforceCanvasStyle();
  }

  private ensureSceneCameraSizes(forceScrollSync = false): void {
    if (!this.game?.scene) return;
    const targetW = this.logicalWidth;
    const baseScrollX = this.getViewLeft();
    for (const sc of this.game.scene.scenes) {
      const cam = sc.cameras?.main as
        | (Phaser.Cameras.Scene2D.Camera & { __wtAppliedBaseScrollX?: number })
        | undefined;
      if (!cam) continue;

      if (cam.width !== targetW || cam.height !== DESIGN_HEIGHT) {
        cam.setSize(targetW, DESIGN_HEIGHT);
      }

      const needsInitialOrResizeSync =
        forceScrollSync || cam.__wtAppliedBaseScrollX !== baseScrollX;
      const isGameScene = sc.scene?.key === 'GameScene';

      if (needsInitialOrResizeSync) {
        cam.__wtAppliedBaseScrollX = baseScrollX;
        cam.scrollX = baseScrollX;
      } else if (!isGameScene && cam.scrollX !== baseScrollX) {
        cam.scrollX = baseScrollX;
      } else if (isGameScene && Math.abs(cam.scrollX - baseScrollX) > 12) {
        // Allow up to +-8px trauma camera shake in GameScene, but snap immediately if reset to 0!
        cam.scrollX = baseScrollX;
      }
    }
  }

  private enforceCanvasStyle(): void {
    const canvas = this.game?.canvas;
    if (!canvas || !this.expectedCssW || !this.expectedCssH) return;
    if (canvas.style.width !== this.expectedCssW) {
      canvas.style.width = this.expectedCssW;
    }
    if (canvas.style.height !== this.expectedCssH) {
      canvas.style.height = this.expectedCssH;
    }
    if (canvas.style.margin !== '0px') {
      canvas.style.margin = '0px';
    }
  }

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
      x = ((clientX - rect.left) / w) * this.logicalWidth;
      y = ((clientY - rect.top) / h) * DESIGN_HEIGHT;
    } else {
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const unrotCssW = Math.max(1, rect.height);
      const unrotCssH = Math.max(1, rect.width);

      const u = clientY - cy;
      const v = -(clientX - cx);
      x = ((u + unrotCssW * 0.5) / unrotCssW) * this.logicalWidth;
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
          toggleFullscreen: () => Promise<{ ok: boolean; isFullscreen: boolean }>;
          hasDismissedFullscreenPrompt: () => boolean;
        };
      }
    ).__WINDTANK_ORIENTATION__ = {
      getState: () => this.getState(),
      syncLayout: () => this.syncLayout(),
      toggleFullscreen: () => this.toggleFullscreen(),
      hasDismissedFullscreenPrompt: () => this.hasDismissedFullscreenPrompt(),
    };
  }
}

export const mobileOrientationManager = new MobileOrientationManager();
