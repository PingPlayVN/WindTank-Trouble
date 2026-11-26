import { BASE_GAMEPLAY } from '../config/constants';
import { audioManager } from '../managers/AudioManager';
import type {
  PlayerConfig,
  PlayerIndex,
  PlayerInputState,
  PlayerKeyBindings,
} from '../types/gameTypes';

const NAVIGATION_PREVENT_CODES = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

/**
 * Independent 4-player simultaneous keyboard input tracker keyed on physical `KeyboardEvent.code`.
 * Eliminates key-mapping collisions between WASD, Arrows, IJKL, and Numpad clusters,
 * buffers discrete fire presses across short cooldown windows, and cleans up all DOM listeners.
 */
export class InputSystem {
  private heldCodes = new Set<string>();
  private justPressedCodes = new Set<string>();
  private fireBufferedUntil: [number, number, number, number] = [0, 0, 0, 0];
  private bindings: [PlayerKeyBindings, PlayerKeyBindings, PlayerKeyBindings, PlayerKeyBindings];
  private clockSec = 0;
  private captureCallback: ((code: string) => void) | null = null;
  private pauseCallbacks: Array<() => void> = [];
  private attached = false;

  private readonly onKeyDownBound: (e: KeyboardEvent) => void;
  private readonly onKeyUpBound: (e: KeyboardEvent) => void;
  private readonly onBlurBound: () => void;

  constructor(players: readonly PlayerConfig[]) {
    this.bindings = [
      { ...players[0].bindings },
      { ...players[1].bindings },
      { ...players[2].bindings },
      { ...players[3].bindings },
    ];

    this.onKeyDownBound = (e: KeyboardEvent) => this.handleKeyDown(e);
    this.onKeyUpBound = (e: KeyboardEvent) => this.handleKeyUp(e);
    this.onBlurBound = () => this.clearAllInputs();
  }

  attach(): void {
    if (this.attached || typeof window === 'undefined') return;
    this.attached = true;
    window.addEventListener('keydown', this.onKeyDownBound, { passive: false });
    window.addEventListener('keyup', this.onKeyUpBound);
    window.addEventListener('blur', this.onBlurBound);
    document.addEventListener('visibilitychange', this.onBlurBound);
  }

  detach(): void {
    if (!this.attached || typeof window === 'undefined') return;
    this.attached = false;
    window.removeEventListener('keydown', this.onKeyDownBound);
    window.removeEventListener('keyup', this.onKeyUpBound);
    window.removeEventListener('blur', this.onBlurBound);
    document.removeEventListener('visibilitychange', this.onBlurBound);
    this.clearAllInputs();
    this.pauseCallbacks = [];
    this.captureCallback = null;
  }

  updateBindings(bindings: [PlayerKeyBindings, PlayerKeyBindings, PlayerKeyBindings, PlayerKeyBindings]): void {
    this.bindings = [
      { ...bindings[0] },
      { ...bindings[1] },
      { ...bindings[2] },
      { ...bindings[3] },
    ];
  }

  onPauseRequested(cb: () => void): void {
    this.pauseCallbacks.push(cb);
  }

  captureNextKey(cb: ((code: string) => void) | null): void {
    this.captureCallback = cb;
  }

  advanceClock(dtSec: number): void {
    this.clockSec += dtSec;
  }

  endFrame(): void {
    this.justPressedCodes.clear();
  }

  clearAllInputs(): void {
    this.heldCodes.clear();
    this.justPressedCodes.clear();
    this.fireBufferedUntil = [0, 0, 0, 0];
  }

  readPlayerState(playerIndex: PlayerIndex): PlayerInputState {
    const bind = this.bindings[playerIndex];
    const fireEdge = this.justPressedCodes.has(bind.fire);
    if (fireEdge) {
      this.fireBufferedUntil[playerIndex] = this.clockSec + BASE_GAMEPLAY.fireBufferWindowSec;
    }
    return {
      forward: this.heldCodes.has(bind.forward),
      backward: this.heldCodes.has(bind.backward),
      left: this.heldCodes.has(bind.left),
      right: this.heldCodes.has(bind.right),
      firePressed: fireEdge,
      fireHeld: this.heldCodes.has(bind.fire),
      fireBufferedUntil: this.fireBufferedUntil[playerIndex],
    };
  }

  consumeBufferedFire(playerIndex: PlayerIndex): boolean {
    if (this.fireBufferedUntil[playerIndex] > this.clockSec) {
      this.fireBufferedUntil[playerIndex] = 0;
      return true;
    }
    return false;
  }

  private isBoundCode(code: string): boolean {
    for (let i = 0; i < 4; i++) {
      const b = this.bindings[i];
      if (
        b.forward === code ||
        b.backward === code ||
        b.left === code ||
        b.right === code ||
        b.fire === code
      ) {
        return true;
      }
    }
    return false;
  }

  private handleKeyDown(e: KeyboardEvent): void {
    audioManager.unlock();
    const code = e.code;

    if (this.captureCallback) {
      e.preventDefault();
      e.stopPropagation();
      if (!e.repeat) {
        const cb = this.captureCallback;
        this.captureCallback = null;
        cb(code);
      }
      return;
    }

    if (NAVIGATION_PREVENT_CODES.has(code) || this.isBoundCode(code)) {
      e.preventDefault();
    }

    if (!e.repeat) {
      if (code === 'Escape' || (code === 'KeyP' && !this.isBoundCode('KeyP'))) {
        for (const cb of this.pauseCallbacks) cb();
      }
      if (!this.heldCodes.has(code)) {
        this.justPressedCodes.add(code);
      }
    }
    this.heldCodes.add(code);
  }

  private handleKeyUp(e: KeyboardEvent): void {
    this.heldCodes.delete(e.code);
  }
}
