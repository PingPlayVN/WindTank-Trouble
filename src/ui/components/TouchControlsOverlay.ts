import Phaser from 'phaser';
import {
  BASE_GAMEPLAY,
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  getPaletteById,
  getSkillDescriptor,
  POWERUP_CONFIG,
  UI_COLORS,
} from '../../game/config/constants';
import { audioManager } from '../../game/managers/AudioManager';
import { settingsManager } from '../../game/managers/SettingsManager';
import { computeVectorStickInput } from '../../game/systems/TouchSim';
import type { PlayerInputState, SkillId, TouchScheme } from '../../game/types/gameTypes';

export interface LocalTouchHudStatus {
  colorId?: string;
  ammo: number;
  alive: boolean;
  skill: SkillId | null;
  skillAmmo: number;
  laserChargeProgress: number | null;
  shieldRemaining: number;
  reaperActive: boolean;
}

// --- 1-Player Ergonomic Landscape Geometry ---
const SOLO_STICK_X = 110;
const SOLO_STICK_Y = 578;
const SOLO_STICK_R = 62;

const SOLO_FIRE_X = 1188;
const SOLO_FIRE_Y = 574;
const SOLO_FIRE_R = 52;

const SOLO_REV_X = 1098;
const SOLO_REV_Y = 668;
const SOLO_REV_R = 32;

const SOLO_DPAD_LEFT_X = 64;
const SOLO_DPAD_LEFT_Y = 594;
const SOLO_DPAD_RIGHT_X = 154;
const SOLO_DPAD_RIGHT_Y = 594;
const SOLO_DPAD_STEER_R = 37;
const SOLO_DPAD_FWD_X = 1100;
const SOLO_DPAD_FWD_Y = 500;
const SOLO_DPAD_FWD_R = 34;

// --- 2-Player Face-to-Face Tabletop Opposite Geometry ---
// Player 1 sits at the LEFT short edge (`x <= 222`, looking right `+X`):
//   Left thumb (Top-Left) = Stick | Right thumb (Bottom-Left) = Fire + Reverse
const P1_OPP_STICK_X = 106;
const P1_OPP_STICK_Y = 214;
const P1_OPP_STICK_R = 54;
const P1_OPP_FIRE_X = 102;
const P1_OPP_FIRE_Y = 562;
const P1_OPP_FIRE_R = 46;
const P1_OPP_REV_X = 174;
const P1_OPP_REV_Y = 668;
const P1_OPP_REV_R = 28;
const P1_OPP_FWD_X = 174;
const P1_OPP_FWD_Y = 466;
const P1_OPP_DPAD_L = { x: 106, y: 152 };
const P1_OPP_DPAD_R = { x: 106, y: 244 };

// Player 2 sits OPPOSITE Player 1 at the RIGHT short edge (`x >= 1058`, looking left `-X`):
//   Left thumb (Bottom-Right) = Stick | Right thumb (Top-Right) = Fire + Reverse (180° symmetric!)
const P2_OPP_STICK_X = 1174;
const P2_OPP_STICK_Y = 562;
const P2_OPP_STICK_R = 54;
const P2_OPP_FIRE_X = 1178;
const P2_OPP_FIRE_Y = 214;
const P2_OPP_FIRE_R = 46;
const P2_OPP_REV_X = 1106;
const P2_OPP_REV_Y = 112;
const P2_OPP_REV_R = 28;
const P2_OPP_FWD_X = 1106;
const P2_OPP_FWD_Y = 310;
const P2_OPP_DPAD_L = { x: 1174, y: 624 };
const P2_OPP_DPAD_R = { x: 1174, y: 532 };
const OPP_DPAD_R = 32;

interface TouchSlotRuntime {
  stickPointerId: number | null;
  stickBaseX: number;
  stickBaseY: number;
  stickKnobX: number;
  stickKnobY: number;
  firePointerIds: Set<number>;
  revPointerIds: Set<number>;
  steerLeftPointerIds: Set<number>;
  steerRightPointerIds: Set<number>;
  driveFwdPointerIds: Set<number>;
  fireBufferedUntil: number;
  firePressCounter: number;
  lastAimPrecision: boolean;
  lastReverseAuto: boolean;
  hud: LocalTouchHudStatus;
}

function createSlotRuntime(restX: number, restY: number, defaultColor: string): TouchSlotRuntime {
  return {
    stickPointerId: null,
    stickBaseX: restX,
    stickBaseY: restY,
    stickKnobX: restX,
    stickKnobY: restY,
    firePointerIds: new Set(),
    revPointerIds: new Set(),
    steerLeftPointerIds: new Set(),
    steerRightPointerIds: new Set(),
    driveFwdPointerIds: new Set(),
    fireBufferedUntil: -1,
    firePressCounter: 0,
    lastAimPrecision: false,
    lastReverseAuto: false,
    hud: {
      colorId: defaultColor,
      ammo: BASE_GAMEPLAY.maxProjectilesPerTank,
      alive: true,
      skill: null,
      skillAmmo: 0,
      laserChargeProgress: null,
      shieldRemaining: 0,
      reaperActive: false,
    },
  };
}

export class TouchControlsOverlay {
  private readonly scene: Phaser.Scene;
  private readonly root: Phaser.GameObjects.Container;
  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly labelsContainer: Phaser.GameObjects.Container;

  // Dynamic text nodes rebuilt cleanly when mode/scheme changes or updated on redraw
  private p1FireTitle!: Phaser.GameObjects.Text;
  private p1FireSub!: Phaser.GameObjects.Text;
  private p1RevLbl!: Phaser.GameObjects.Text;
  private p1SideTag!: Phaser.GameObjects.Text;
  private p1DpadL!: Phaser.GameObjects.Text;
  private p1DpadR!: Phaser.GameObjects.Text;
  private p1DpadFwd!: Phaser.GameObjects.Text;

  private p2FireTitle!: Phaser.GameObjects.Text;
  private p2FireSub!: Phaser.GameObjects.Text;
  private p2RevLbl!: Phaser.GameObjects.Text;
  private p2SideTag!: Phaser.GameObjects.Text;
  private p2DpadL!: Phaser.GameObjects.Text;
  private p2DpadR!: Phaser.GameObjects.Text;
  private p2DpadFwd!: Phaser.GameObjects.Text;

  private dualOppositeMode = false;
  private clockSec = 0;

  private readonly slots: [TouchSlotRuntime, TouchSlotRuntime] = [
    createSlotRuntime(SOLO_STICK_X, SOLO_STICK_Y, 'red'),
    createSlotRuntime(P2_OPP_STICK_X, P2_OPP_STICK_Y, 'green'),
  ];

  private readonly onDownBound: (p: Phaser.Input.Pointer) => void;
  private readonly onMoveBound: (p: Phaser.Input.Pointer) => void;
  private readonly onUpBound: (p: Phaser.Input.Pointer) => void;

  constructor(scene: Phaser.Scene, private readonly isBlocked: () => boolean) {
    this.scene = scene;
    // Support up to 8 simultaneous fingers so 2 players sitting opposite can each use Stick + Fire + Reverse!
    scene.input.addPointer(6);

    this.root = scene.add.container(0, 0).setDepth(42);
    this.graphics = scene.add.graphics();
    this.labelsContainer = scene.add.container(0, 0);
    this.root.add([this.graphics, this.labelsContainer]);

    this.createLabelObjects();

    this.onDownBound = (p) => this.handlePointerDown(p);
    this.onMoveBound = (p) => this.handlePointerMove(p);
    this.onUpBound = (p) => this.handlePointerUp(p);

    scene.input.on('pointerdown', this.onDownBound);
    scene.input.on('pointermove', this.onMoveBound);
    scene.input.on('pointerup', this.onUpBound);
    scene.input.on('pointerupoutside', this.onUpBound);

    this.registerTestHook();
    this.redraw();
  }

  private createLabelObjects(): void {
    const mk = (txt: string, size: number, color = '#FFFFFF', stroke = false) => {
      const t = this.scene.add
        .text(0, 0, txt, {
          fontFamily: "'Segoe UI', 'Inter', sans-serif",
          fontSize: `${size}px`,
          fontStyle: '900',
          color,
          stroke: stroke ? '#18191B' : undefined,
          strokeThickness: stroke ? 3.2 : 0,
        })
        .setOrigin(0.5, 0.5);
      this.labelsContainer.add(t);
      return t;
    };

    this.p1FireTitle = mk('BẮN!', 17, '#FFFFFF', true);
    this.p1FireSub = mk('ĐẠN 10/10', 10, '#FFF8E1', true);
    this.p1RevLbl = mk('LÙI', 11.5, UI_COLORS.inkDarkHex);
    this.p1SideTag = mk('KÉO NHẸ: NGẮM • KÉO HẾT: LÁI', 9.5, UI_COLORS.inkMutedHex);
    this.p1DpadL = mk('◀', 18, UI_COLORS.inkDarkHex);
    this.p1DpadR = mk('▶', 18, UI_COLORS.inkDarkHex);
    this.p1DpadFwd = mk('TIẾN ▲', 11, UI_COLORS.inkDarkHex);

    this.p2FireTitle = mk('BẮN!', 16, '#FFFFFF', true);
    this.p2FireSub = mk('ĐẠN 10/10', 9.5, '#FFF8E1', true);
    this.p2RevLbl = mk('LÙI', 11, UI_COLORS.inkDarkHex);
    this.p2SideTag = mk('👤 XE 2 (NGỒI ĐỐI DIỆN)', 10, '#1B5E20');
    this.p2DpadL = mk('◀', 18, UI_COLORS.inkDarkHex);
    this.p2DpadR = mk('▶', 18, UI_COLORS.inkDarkHex);
    this.p2DpadFwd = mk('TIẾN ▲', 10.5, UI_COLORS.inkDarkHex);
  }

  private getScheme(): TouchScheme {
    return settingsManager.getSettings().touchScheme;
  }

  private getSlotGeometry(slotIdx: 0 | 1) {
    const s = settingsManager.getSettings();
    const scale = Phaser.Math.Clamp(s.touchButtonScale ?? 1.0, 0.85, 1.25);

    if (!this.dualOppositeMode) {
      const swap = Boolean(s.touchSwapHands);
      const mx = (x: number) => (swap ? DESIGN_WIDTH - x : x);
      const dpadLeftBaseX = swap ? DESIGN_WIDTH - SOLO_DPAD_RIGHT_X : SOLO_DPAD_LEFT_X;
      const dpadRightBaseX = swap ? DESIGN_WIDTH - SOLO_DPAD_LEFT_X : SOLO_DPAD_RIGHT_X;

      return {
        stickRestX: mx(SOLO_STICK_X),
        stickRestY: SOLO_STICK_Y,
        stickMaxR: Math.round(SOLO_STICK_R * scale),
        fireX: mx(SOLO_FIRE_X),
        fireY: SOLO_FIRE_Y,
        fireR: Math.round(SOLO_FIRE_R * scale),
        revX: mx(SOLO_REV_X),
        revY: SOLO_REV_Y,
        revR: Math.round(SOLO_REV_R * scale),
        fwdX: mx(SOLO_DPAD_FWD_X),
        fwdY: SOLO_DPAD_FWD_Y,
        fwdR: Math.round(SOLO_DPAD_FWD_R * scale),
        dpadL: { x: dpadLeftBaseX, y: SOLO_DPAD_LEFT_Y },
        dpadR: { x: dpadRightBaseX, y: SOLO_DPAD_RIGHT_Y },
        dpadSteerR: Math.round(SOLO_DPAD_STEER_R * scale),
        labelRot: 0,
      };
    }

    if (slotIdx === 0) {
      return {
        stickRestX: P1_OPP_STICK_X,
        stickRestY: P1_OPP_STICK_Y,
        stickMaxR: Math.round(P1_OPP_STICK_R * scale),
        fireX: P1_OPP_FIRE_X,
        fireY: P1_OPP_FIRE_Y,
        fireR: Math.round(P1_OPP_FIRE_R * scale),
        revX: P1_OPP_REV_X,
        revY: P1_OPP_REV_Y,
        revR: Math.round(P1_OPP_REV_R * scale),
        fwdX: P1_OPP_FWD_X,
        fwdY: P1_OPP_FWD_Y,
        fwdR: Math.round(28 * scale),
        dpadL: P1_OPP_DPAD_L,
        dpadR: P1_OPP_DPAD_R,
        dpadSteerR: Math.round(OPP_DPAD_R * scale),
        labelRot: Math.PI / 2,
      };
    }

    return {
      stickRestX: P2_OPP_STICK_X,
      stickRestY: P2_OPP_STICK_Y,
      stickMaxR: Math.round(P2_OPP_STICK_R * scale),
      fireX: P2_OPP_FIRE_X,
      fireY: P2_OPP_FIRE_Y,
      fireR: Math.round(P2_OPP_FIRE_R * scale),
      revX: P2_OPP_REV_X,
      revY: P2_OPP_REV_Y,
      revR: Math.round(P2_OPP_REV_R * scale),
      fwdX: P2_OPP_FWD_X,
      fwdY: P2_OPP_FWD_Y,
      fwdR: Math.round(28 * scale),
      dpadL: P2_OPP_DPAD_L,
      dpadR: P2_OPP_DPAD_R,
      dpadSteerR: Math.round(OPP_DPAD_R * scale),
      labelRot: -Math.PI / 2,
    };
  }

  setDualOppositeMode(enabled: boolean): void {
    if (this.dualOppositeMode === enabled) return;
    this.dualOppositeMode = enabled;
    this.clearAllTouches();
    this.redraw();
  }

  isDualOppositeMode(): boolean {
    return this.dualOppositeMode;
  }

  setVisible(visible: boolean): void {
    this.root.setVisible(visible);
    if (!visible) {
      this.clearAllTouches();
    } else {
      this.redraw();
    }
  }

  isVisible(): boolean {
    return this.root.visible;
  }

  advanceClock(dt: number): void {
    this.clockSec += dt;
  }

  syncHudStatus(status: LocalTouchHudStatus): void {
    this.syncPlayerHudStatus(0, status);
  }

  syncPlayerHudStatus(slotIdx: 0 | 1, status: LocalTouchHudStatus): void {
    this.slots[slotIdx].hud = status;
    this.redraw();
  }

  getFirePressCount(slotIdx: 0 | 1 = 0): number {
    return this.slots[slotIdx].firePressCounter;
  }

  consumeBufferedFire(): boolean {
    return this.consumePlayerBufferedFire(0);
  }

  consumePlayerBufferedFire(slotIdx: 0 | 1): boolean {
    const slot = this.slots[slotIdx];
    if (slot.fireBufferedUntil >= this.clockSec) {
      slot.fireBufferedUntil = -1;
      return true;
    }
    return false;
  }

  readInput(localTankAngleRad: number): PlayerInputState {
    return this.readPlayerInput(0, localTankAngleRad);
  }

  readPlayerInput(slotIdx: 0 | 1, tankAngleRad: number): PlayerInputState {
    if (!this.root.visible || this.isBlocked() || (slotIdx === 1 && !this.dualOppositeMode)) {
      return {
        forward: false,
        backward: false,
        left: false,
        right: false,
        firePressed: false,
        fireHeld: false,
        fireBufferedUntil: -1,
      };
    }

    const slot = this.slots[slotIdx];
    const geo = this.getSlotGeometry(slotIdx);
    const fireHeld = slot.firePointerIds.size > 0;
    const revHeld = slot.revPointerIds.size > 0;

    if (this.getScheme() === 'dual_pad') {
      return {
        forward: slot.driveFwdPointerIds.size > 0,
        backward: revHeld,
        left: slot.steerLeftPointerIds.size > 0,
        right: slot.steerRightPointerIds.size > 0,
        firePressed: slot.fireBufferedUntil >= this.clockSec,
        fireHeld,
        fireBufferedUntil: slot.fireBufferedUntil,
      };
    }

    const s = settingsManager.getSettings();
    const dx = slot.stickPointerId !== null ? slot.stickKnobX - slot.stickBaseX : 0;
    const dy = slot.stickPointerId !== null ? slot.stickKnobY - slot.stickBaseY : 0;
    const vec = computeVectorStickInput(dx, dy, geo.stickMaxR, tankAngleRad, revHeld, {
      sensitivity: s.touchSensitivity,
      aimZoneThreshold: s.touchAimZone,
    });

    if (
      vec.inPrecisionAimZone !== slot.lastAimPrecision ||
      (vec.backward && !revHeld) !== slot.lastReverseAuto
    ) {
      slot.lastAimPrecision = vec.inPrecisionAimZone;
      slot.lastReverseAuto = vec.backward && !revHeld;
      this.redraw();
    }

    return {
      forward: vec.forward,
      backward: vec.backward,
      left: vec.left,
      right: vec.right,
      firePressed: slot.fireBufferedUntil >= this.clockSec,
      fireHeld,
      fireBufferedUntil: slot.fireBufferedUntil,
    };
  }

  clearAllTouches(): void {
    for (const idx of [0, 1] as const) {
      const slot = this.slots[idx];
      const geo = this.getSlotGeometry(idx);
      slot.stickPointerId = null;
      slot.stickBaseX = geo.stickRestX;
      slot.stickBaseY = geo.stickRestY;
      slot.stickKnobX = geo.stickRestX;
      slot.stickKnobY = geo.stickRestY;
      slot.firePointerIds.clear();
      slot.revPointerIds.clear();
      slot.steerLeftPointerIds.clear();
      slot.steerRightPointerIds.clear();
      slot.driveFwdPointerIds.clear();
      slot.fireBufferedUntil = -1;
      slot.lastAimPrecision = false;
      slot.lastReverseAuto = false;
    }
    this.redraw();
  }

  private triggerSlotFire(slotIdx: 0 | 1): void {
    audioManager.unlock();
    const slot = this.slots[slotIdx];
    slot.fireBufferedUntil = this.clockSec + BASE_GAMEPLAY.fireBufferWindowSec;
    slot.firePressCounter++;
  }

  private tryBindTouchToSlot(slotIdx: 0 | 1, p: Phaser.Input.Pointer): boolean {
    const slot = this.slots[slotIdx];
    const geo = this.getSlotGeometry(slotIdx);
    const x = p.x;
    const y = p.y;

    // 1. Fire button
    if (Math.hypot(x - geo.fireX, y - geo.fireY) <= geo.fireR + 10) {
      slot.firePointerIds.add(p.id);
      this.triggerSlotFire(slotIdx);
      return true;
    }

    // 2. Reverse button
    if (Math.hypot(x - geo.revX, y - geo.revY) <= geo.revR + 9) {
      slot.revPointerIds.add(p.id);
      return true;
    }

    if (this.getScheme() === 'dual_pad') {
      if (Math.hypot(x - geo.fwdX, y - geo.fwdY) <= geo.fwdR + 8) {
        slot.driveFwdPointerIds.add(p.id);
        return true;
      }
      if (Math.hypot(x - geo.dpadL.x, y - geo.dpadL.y) <= geo.dpadSteerR + 8) {
        slot.steerLeftPointerIds.add(p.id);
        return true;
      }
      if (Math.hypot(x - geo.dpadR.x, y - geo.dpadR.y) <= geo.dpadSteerR + 8) {
        slot.steerRightPointerIds.add(p.id);
        return true;
      }
      return false;
    }

    // 3. Floating or Fixed Vector Stick Zone
    if (slot.stickPointerId !== null) return false;
    const s = settingsManager.getSettings();
    const floating = Boolean(s.touchFloatingStick);

    if (!this.dualOppositeMode) {
      const swap = Boolean(s.touchSwapHands);
      const inSoloZone = swap ? x >= DESIGN_WIDTH - 256 && y >= 140 : x <= 256 && y >= 140;
      if (inSoloZone) {
        slot.stickPointerId = p.id;
        if (!floating || Math.hypot(x - geo.stickRestX, y - geo.stickRestY) <= geo.stickMaxR * 1.15) {
          slot.stickBaseX = geo.stickRestX;
          slot.stickBaseY = geo.stickRestY;
        } else {
          slot.stickBaseX = swap
            ? Phaser.Math.Clamp(x, DESIGN_WIDTH - 162, DESIGN_WIDTH - 76)
            : Phaser.Math.Clamp(x, 76, 162);
          slot.stickBaseY = Phaser.Math.Clamp(y, 240, DESIGN_HEIGHT - 86);
        }
        this.updateSlotStickKnob(slotIdx, x, y);
        return true;
      }
      return false;
    }

    // 2P Opposite Stick Zones:
    if (slotIdx === 0 && x <= 224 && y >= 78 && y <= 388) {
      slot.stickPointerId = p.id;
      if (!floating || Math.hypot(x - geo.stickRestX, y - geo.stickRestY) <= geo.stickMaxR * 1.15) {
        slot.stickBaseX = geo.stickRestX;
        slot.stickBaseY = geo.stickRestY;
      } else {
        slot.stickBaseX = Phaser.Math.Clamp(x, 68, 162);
        slot.stickBaseY = Phaser.Math.Clamp(y, 140, 326);
      }
      this.updateSlotStickKnob(0, x, y);
      return true;
    }

    if (slotIdx === 1 && x >= 1056 && y >= 372 && y <= 748) {
      slot.stickPointerId = p.id;
      if (!floating || Math.hypot(x - geo.stickRestX, y - geo.stickRestY) <= geo.stickMaxR * 1.15) {
        slot.stickBaseX = geo.stickRestX;
        slot.stickBaseY = geo.stickRestY;
      } else {
        slot.stickBaseX = Phaser.Math.Clamp(x, 1118, 1212);
        slot.stickBaseY = Phaser.Math.Clamp(y, 434, 686);
      }
      this.updateSlotStickKnob(1, x, y);
      return true;
    }

    return false;
  }

  private handlePointerDown(p: Phaser.Input.Pointer): void {
    if (!this.root.visible || this.isBlocked()) return;
    // Never intercept Top Bar buttons (`y <= 64`)
    if (p.y <= 64) return;

    if (this.tryBindTouchToSlot(0, p)) {
      this.redraw();
      return;
    }
    if (this.dualOppositeMode && this.tryBindTouchToSlot(1, p)) {
      this.redraw();
    }
  }

  private handlePointerMove(p: Phaser.Input.Pointer): void {
    if (!this.root.visible || this.isBlocked()) return;

    for (const idx of [0, 1] as const) {
      if (idx === 1 && !this.dualOppositeMode) continue;
      const slot = this.slots[idx];
      if (slot.stickPointerId === p.id) {
        this.updateSlotStickKnob(idx, p.x, p.y);
        this.redraw();
        return;
      }
    }
  }

  private handlePointerUp(p: Phaser.Input.Pointer): void {
    let changed = false;
    for (const idx of [0, 1] as const) {
      const slot = this.slots[idx];
      const geo = this.getSlotGeometry(idx);
      if (slot.stickPointerId === p.id) {
        slot.stickPointerId = null;
        slot.stickBaseX = geo.stickRestX;
        slot.stickBaseY = geo.stickRestY;
        slot.stickKnobX = geo.stickRestX;
        slot.stickKnobY = geo.stickRestY;
        slot.lastAimPrecision = false;
        slot.lastReverseAuto = false;
        changed = true;
      }
      if (slot.firePointerIds.delete(p.id)) changed = true;
      if (slot.revPointerIds.delete(p.id)) changed = true;
      if (slot.steerLeftPointerIds.delete(p.id)) changed = true;
      if (slot.steerRightPointerIds.delete(p.id)) changed = true;
      if (slot.driveFwdPointerIds.delete(p.id)) changed = true;
    }
    if (changed) this.redraw();
  }

  private updateSlotStickKnob(slotIdx: 0 | 1, px: number, py: number): void {
    const slot = this.slots[slotIdx];
    const maxR = this.getSlotGeometry(slotIdx).stickMaxR;
    const dx = px - slot.stickBaseX;
    const dy = py - slot.stickBaseY;
    const dist = Math.hypot(dx, dy);
    if (dist <= maxR) {
      slot.stickKnobX = px;
      slot.stickKnobY = py;
    } else {
      const k = maxR / dist;
      slot.stickKnobX = slot.stickBaseX + dx * k;
      slot.stickKnobY = slot.stickBaseY + dy * k;
    }
  }

  private drawPlayerCluster(
    slotIdx: 0 | 1,
    fireTitle: Phaser.GameObjects.Text,
    fireSub: Phaser.GameObjects.Text,
    revLbl: Phaser.GameObjects.Text,
    sideTag: Phaser.GameObjects.Text,
    dpadL: Phaser.GameObjects.Text,
    dpadR: Phaser.GameObjects.Text,
    dpadFwd: Phaser.GameObjects.Text,
  ): void {
    const g = this.graphics;
    const slot = this.slots[slotIdx];
    const geo = this.getSlotGeometry(slotIdx);
    const isVector = this.getScheme() === 'vector_stick';
    const pal = getPaletteById(slot.hud.colorId ?? (slotIdx === 0 ? 'red' : 'green'));

    // Subtle tabletop player zone divider tint in 2P Opposite Mode
    if (this.dualOppositeMode) {
      const bandX = slotIdx === 0 ? 6 : 1280 - 216;
      g.fillStyle(pal.primary, 0.045);
      g.fillRoundedRect(bandX, 82, 210, DESIGN_HEIGHT - 94, 14);
      g.lineStyle(1.5, pal.primary, 0.22);
      g.strokeRoundedRect(bandX, 82, 210, DESIGN_HEIGHT - 94, 14);
    }

    dpadL.setVisible(!isVector);
    dpadR.setVisible(!isVector);
    dpadFwd.setVisible(!isVector);

    // 1. Stick or Dual-Pad Steer
    if (isVector) {
      const bx = slot.stickPointerId !== null ? slot.stickBaseX : geo.stickRestX;
      const by = slot.stickPointerId !== null ? slot.stickBaseY : geo.stickRestY;
      const kx = slot.stickPointerId !== null ? slot.stickKnobX : geo.stickRestX;
      const ky = slot.stickPointerId !== null ? slot.stickKnobY : geo.stickRestY;
      const active = slot.stickPointerId !== null;

      g.fillStyle(0x1d1f22, active ? 0.16 : 0.09);
      g.fillCircle(bx, by, geo.stickMaxR);
      g.lineStyle(2.3, this.dualOppositeMode ? pal.primary : UI_COLORS.inkDark, active ? 0.72 : 0.38);
      g.strokeCircle(bx, by, geo.stickMaxR);

      // Dynamic Precision Aim-Only inner ring (reflects user's Sensitivity & Aim Zone settings!)
      const cfg = settingsManager.getSettings();
      const aimRingFrac = Phaser.Math.Clamp(
        cfg.touchAimZone / Math.max(0.6, cfg.touchSensitivity),
        0.18,
        0.72,
      );
      g.lineStyle(1.5, 0x00acc1, active ? 0.68 : 0.36);
      g.strokeCircle(bx, by, geo.stickMaxR * aimRingFrac);

      for (let i = 0; i < 4; i++) {
        const a = (i * Math.PI) / 2;
        g.lineStyle(1.4, UI_COLORS.inkDark, 0.24);
        g.lineBetween(
          bx + Math.cos(a) * (geo.stickMaxR - 6),
          by + Math.sin(a) * (geo.stickMaxR - 6),
          bx + Math.cos(a) * geo.stickMaxR,
          by + Math.sin(a) * geo.stickMaxR,
        );
      }

      if (active) {
        g.lineStyle(3.8, 0x263238, 0.45);
        g.lineBetween(bx, by, kx, ky);
      }

      let knobFill = 0xffffff;
      let knobStroke: number = this.dualOppositeMode ? pal.primary : UI_COLORS.inkDark;
      if (active) {
        if (slot.lastAimPrecision) {
          knobFill = 0x80deea;
          knobStroke = 0x00838f;
        } else if (slot.lastReverseAuto) {
          knobFill = 0xffcc80;
          knobStroke = 0xe65100;
        } else {
          knobFill = 0xa5d6a7;
          knobStroke = 0x1b5e20;
        }
      }

      const knobR = this.dualOppositeMode ? 21 : 24;
      g.fillStyle(0x1d1f22, 0.22);
      g.fillCircle(kx + 2, ky + 3, knobR);
      g.fillStyle(knobFill, 0.95);
      g.fillCircle(kx, ky, knobR);
      g.lineStyle(2.5, knobStroke, 0.95);
      g.strokeCircle(kx, ky, knobR);
      g.fillStyle(knobStroke, 0.25);
      g.fillCircle(kx, ky, 7);
    } else {
      const drawPad = (cx: number, cy: number, r: number, pressed: boolean, accent = 0xe3f2fd) => {
        g.fillStyle(0x1d1f22, 0.18);
        g.fillCircle(cx + 2, cy + 3, r);
        g.fillStyle(pressed ? accent : 0xffffff, 0.92);
        g.fillCircle(cx, cy + (pressed ? 1.5 : 0), r);
        g.lineStyle(2.4, UI_COLORS.inkDark, 0.85);
        g.strokeCircle(cx, cy + (pressed ? 1.5 : 0), r);
      };
      drawPad(geo.dpadL.x, geo.dpadL.y, geo.dpadSteerR, slot.steerLeftPointerIds.size > 0);
      drawPad(geo.dpadR.x, geo.dpadR.y, geo.dpadSteerR, slot.steerRightPointerIds.size > 0);
      drawPad(geo.fwdX, geo.fwdY, geo.fwdR, slot.driveFwdPointerIds.size > 0, 0xc8e6c9);

      dpadL.setPosition(geo.dpadL.x, geo.dpadL.y).setRotation(geo.labelRot);
      dpadR.setPosition(geo.dpadR.x, geo.dpadR.y).setRotation(geo.labelRot);
      dpadFwd.setPosition(geo.fwdX, geo.fwdY).setRotation(geo.labelRot);
    }

    // 2. Side Tag / Tabletop Seat Indicator
    if (this.dualOppositeMode) {
      const tagX = slotIdx === 0 ? 22 : 1258;
      sideTag
        .setText(slotIdx === 0 ? 'XE 1 • CẠNH TRÁI' : 'XE 2 • ĐỐI DIỆN')
        .setColor(pal.primaryHex)
        .setPosition(tagX, 388)
        .setRotation(geo.labelRot)
        .setVisible(true);
    } else {
      sideTag
        .setText('KÉO NHẸ: NGẮM • KÉO HẾT: LÁI')
        .setColor(UI_COLORS.inkMutedHex)
        .setPosition(geo.stickRestX, geo.stickRestY + geo.stickMaxR + 18)
        .setRotation(0)
        .setVisible(isVector);
    }

    // 3. Reverse Button (`LÙI`)
    const revPressed = slot.revPointerIds.size > 0;
    g.fillStyle(0x1d1f22, 0.2);
    g.fillCircle(geo.revX + 2, geo.revY + 3, geo.revR);
    g.fillStyle(revPressed ? 0xffe0b2 : 0xffffff, 0.93);
    g.fillCircle(geo.revX, geo.revY + (revPressed ? 1.5 : 0), geo.revR);
    g.lineStyle(2.3, revPressed ? 0xe65100 : UI_COLORS.inkDark, 0.88);
    g.strokeCircle(geo.revX, geo.revY + (revPressed ? 1.5 : 0), geo.revR);
    revLbl
      .setPosition(geo.revX, geo.revY + (revPressed ? 1.5 : 0))
      .setRotation(geo.labelRot)
      .setVisible(true);

    // 4. Giant `BẮN!` Button + 360-deg Segmented Ammo / Skill Ring
    const firePressed = slot.firePointerIds.size > 0;
    const st = slot.hud;
    const activeSuit = st.skill ?? (st.shieldRemaining > 0 ? 'shield' : null);
    const baseColor = activeSuit ? getSkillDescriptor(activeSuit).accentColor : pal.primary;

    g.fillStyle(0x1d1f22, 0.25);
    g.fillCircle(geo.fireX + 2.5, geo.fireY + 4, geo.fireR);
    g.fillStyle(firePressed ? pal.highlight : baseColor, st.alive ? 0.94 : 0.38);
    g.fillCircle(geo.fireX, geo.fireY + (firePressed ? 2 : 0), geo.fireR - 5);
    g.lineStyle(2.8, UI_COLORS.inkDark, 0.95);
    g.strokeCircle(geo.fireX, geo.fireY + (firePressed ? 2 : 0), geo.fireR - 5);

    const gaugeR = geo.fireR + 4;
    g.lineStyle(4.2, 0x1d1f22, 0.16);
    g.strokeCircle(geo.fireX, geo.fireY, gaugeR);

    let subCopy = '';
    if (activeSuit) {
      const desc = getSkillDescriptor(activeSuit);
      let ratio = 1;
      subCopy = desc.hudShort;
      if (st.shieldRemaining > 0 && !st.skill) {
        ratio = Math.min(1, st.shieldRemaining / POWERUP_CONFIG.shieldDurationSec);
        subCopy = `KHIÊN ${st.shieldRemaining.toFixed(1)}s`;
      } else if (st.skill === 'laser') {
        ratio = st.laserChargeProgress !== null ? st.laserChargeProgress : 1;
        subCopy =
          st.laserChargeProgress !== null
            ? `TỤ ${Math.round(st.laserChargeProgress * 100)}%`
            : 'LASER SẴN';
      } else if (st.skill === 'reaper') {
        subCopy = st.reaperActive ? 'QUÉT 180°!' : 'HÁI ĐỎ SẴN';
      } else if (desc.ammo > 1) {
        ratio = Math.min(1, st.skillAmmo / desc.ammo);
        subCopy = `${desc.hudShort} ${st.skillAmmo}`;
      }

      g.lineStyle(4.8, desc.accentColor, 0.96);
      g.beginPath();
      g.arc(
        geo.fireX,
        geo.fireY,
        gaugeR,
        geo.labelRot - Math.PI / 2,
        geo.labelRot - Math.PI / 2 + Math.PI * 2 * Math.max(0.05, ratio),
        false,
      );
      g.strokePath();
    } else {
      const maxAmmo = BASE_GAMEPLAY.maxProjectilesPerTank;
      const segSpan = (Math.PI * 2) / maxAmmo;
      for (let i = 0; i < maxAmmo; i++) {
        const a0 = geo.labelRot - Math.PI / 2 + i * segSpan + 0.055;
        const a1 = a0 + segSpan - 0.11;
        const filled = i < st.ammo;
        g.lineStyle(4.2, filled ? 0x1d1f22 : 0xb0b5bd, filled ? 0.92 : 0.35);
        g.beginPath();
        g.arc(geo.fireX, geo.fireY, gaugeR, a0, a1, false);
        g.strokePath();
      }
      subCopy = `ĐẠN ${st.ammo}/${maxAmmo}`;
    }

    // Offset title & sub-label along local rotated "up/down" axis so rotated text never overlaps!
    const upX = Math.sin(geo.labelRot);
    const upY = -Math.cos(geo.labelRot);
    fireTitle
      .setText('BẮN!')
      .setPosition(geo.fireX + upX * 7, geo.fireY + upY * 7)
      .setRotation(geo.labelRot)
      .setVisible(true);
    fireSub
      .setText(subCopy)
      .setPosition(geo.fireX - upX * 13, geo.fireY - upY * 13)
      .setRotation(geo.labelRot)
      .setVisible(true);
  }

  redraw(): void {
    if (!this.root.visible) return;
    this.graphics.clear();

    this.drawPlayerCluster(
      0,
      this.p1FireTitle,
      this.p1FireSub,
      this.p1RevLbl,
      this.p1SideTag,
      this.p1DpadL,
      this.p1DpadR,
      this.p1DpadFwd,
    );

    if (this.dualOppositeMode) {
      this.drawPlayerCluster(
        1,
        this.p2FireTitle,
        this.p2FireSub,
        this.p2RevLbl,
        this.p2SideTag,
        this.p2DpadL,
        this.p2DpadR,
        this.p2DpadFwd,
      );
    } else {
      this.p2FireTitle.setVisible(false);
      this.p2FireSub.setVisible(false);
      this.p2RevLbl.setVisible(false);
      this.p2SideTag.setVisible(false);
      this.p2DpadL.setVisible(false);
      this.p2DpadR.setVisible(false);
      this.p2DpadFwd.setVisible(false);
    }
  }

  private registerTestHook(): void {
    (
      window as unknown as {
        __PHASER_TOUCH_CONTROLS__?: {
          getGeometry: () => {
            visible: boolean;
            scheme: TouchScheme;
            dualOppositeMode: boolean;
            stickRest: { x: number; y: number; maxRadius: number };
            fireBtn: { x: number; y: number; radius: number };
            revBtn: { x: number; y: number; radius: number };
            p2StickRest: { x: number; y: number; maxRadius: number };
            p2FireBtn: { x: number; y: number; radius: number };
          };
          setVirtualStick: (dx: number, dy: number, slot?: 0 | 1) => void;
          releaseVirtualStick: (slot?: 0 | 1) => void;
          tapFire: (slot?: 0 | 1) => void;
        };
      }
    ).__PHASER_TOUCH_CONTROLS__ = {
      getGeometry: () => {
        const g1 = this.getSlotGeometry(0);
        const g2 = this.getSlotGeometry(1);
        return {
          visible: this.root.visible,
          scheme: this.getScheme(),
          dualOppositeMode: this.dualOppositeMode,
          stickRest: { x: g1.stickRestX, y: g1.stickRestY, maxRadius: g1.stickMaxR },
          fireBtn: { x: g1.fireX, y: g1.fireY, radius: g1.fireR },
          revBtn: { x: g1.revX, y: g1.revY, radius: g1.revR },
          p2StickRest: { x: g2.stickRestX, y: g2.stickRestY, maxRadius: g2.stickMaxR },
          p2FireBtn: { x: g2.fireX, y: g2.fireY, radius: g2.fireR },
        };
      },
      setVirtualStick: (dx: number, dy: number, slot: 0 | 1 = 0) => {
        const g = this.getSlotGeometry(slot);
        const s = this.slots[slot];
        s.stickPointerId = 900 + slot;
        s.stickBaseX = g.stickRestX;
        s.stickBaseY = g.stickRestY;
        this.updateSlotStickKnob(slot, g.stickRestX + dx, g.stickRestY + dy);
        this.redraw();
      },
      releaseVirtualStick: (slot: 0 | 1 = 0) => {
        const g = this.getSlotGeometry(slot);
        const s = this.slots[slot];
        s.stickPointerId = null;
        s.stickKnobX = g.stickRestX;
        s.stickKnobY = g.stickRestY;
        this.redraw();
      },
      tapFire: (slot: 0 | 1 = 0) => {
        this.triggerSlotFire(slot);
        this.redraw();
      },
    };
  }

  destroy(): void {
    this.scene.input.off('pointerdown', this.onDownBound);
    this.scene.input.off('pointermove', this.onMoveBound);
    this.scene.input.off('pointerup', this.onUpBound);
    this.scene.input.off('pointerupoutside', this.onUpBound);
    this.root.destroy(true);
  }
}
