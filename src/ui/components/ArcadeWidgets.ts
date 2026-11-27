import Phaser from 'phaser';
import {
  DESIGN_HEIGHT,
  DESIGN_WIDTH,
  formatWinningScoreLabel,
  normalizeWinningScore,
  parseCustomScoreInput,
  stepWinningScore,
  UI_COLORS,
} from '../../game/config/constants';
import { audioManager } from '../../game/managers/AudioManager';

export interface ArcadeButtonOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  fontSize?: number;
  fillColor?: number;
  hoverColor?: number;
  textColor?: string;
  strokeColor?: number;
  lipHeight?: number;
  onClick: () => void;
}

export interface ArcadeButtonHandle {
  container: Phaser.GameObjects.Container;
  labelText: Phaser.GameObjects.Text;
  setLabel: (text: string) => void;
  setFill: (fillColor: number, hoverColor?: number, textColor?: string) => void;
  setEnabled: (enabled: boolean) => void;
}

/**
 * Tactile flat-vector button faithful to classic Flash/HTML5 Tank Trouble aesthetics:
 * crisp dark ink border, solid lower bevel lip, zero glassmorphism, and physical 2px press travel.
 */
export function createArcadeButton(
  scene: Phaser.Scene,
  opts: ArcadeButtonOptions,
): ArcadeButtonHandle {
  const {
    x,
    y,
    width,
    height,
    label,
    fontSize = 18,
    lipHeight = 4,
    strokeColor = UI_COLORS.inkDark,
    onClick,
  } = opts;

  let baseFill = opts.fillColor ?? UI_COLORS.cardBg;
  let hoverFill = opts.hoverColor ?? 0xf7f9fb;
  let txtColor = opts.textColor ?? UI_COLORS.inkDarkHex;
  let enabled = true;
  let hovered = false;
  let pressed = false;

  const container = scene.add.container(x, y);
  // Separate inner visual container for hover/press scale tweens so `killTweensOf(visual)`
  // NEVER cancels scene entrance (`alpha` / `y`) tweens on `container` and `hitZone` never jitters!
  const visual = scene.add.container(0, 0);
  const lip = scene.add.graphics();
  const face = scene.add.graphics();

  const labelText = scene.add
    .text(0, 0, label, {
      fontFamily: "'Segoe UI', 'Inter', system-ui, sans-serif",
      fontSize: `${fontSize}px`,
      fontStyle: '800',
      color: txtColor,
      align: 'center',
    })
    .setOrigin(0.5, 0.5);

  const radius = Math.min(8, Math.floor(height * 0.22));

  const redraw = () => {
    lip.clear();
    face.clear();

    lip.fillStyle(strokeColor, enabled ? 1 : 0.45);
    lip.fillRoundedRect(-width / 2, -height / 2 + lipHeight, width, height, radius);

    const dy = pressed ? lipHeight - 1 : 0;
    const fill = !enabled ? 0xd5d8dc : hovered ? hoverFill : baseFill;
    face.fillStyle(fill, 1);
    face.fillRoundedRect(-width / 2, -height / 2 + dy, width, height, radius);
    face.lineStyle(2.4, strokeColor, enabled ? 1 : 0.45);
    face.strokeRoundedRect(-width / 2, -height / 2 + dy, width, height, radius);

    labelText.setY(dy);
    labelText.setAlpha(enabled ? 1 : 0.55);
  };

  redraw();
  visual.add([lip, face, labelText]);
  container.add(visual);

  const hitZone = scene.add
    .zone(0, 0, width, height + lipHeight)
    .setOrigin(0.5, 0.5)
    .setInteractive({ useHandCursor: true });

  hitZone.on('pointerover', () => {
    if (!enabled) return;
    hovered = true;
    redraw();
    scene.tweens.killTweensOf(visual);
    scene.tweens.add({
      targets: visual,
      scaleX: 1.035,
      scaleY: 1.035,
      duration: 110,
      ease: 'Quad.easeOut',
    });
  });

  hitZone.on('pointerout', () => {
    hovered = false;
    pressed = false;
    redraw();
    scene.tweens.killTweensOf(visual);
    scene.tweens.add({
      targets: visual,
      scaleX: 1,
      scaleY: 1,
      duration: 120,
      ease: 'Quad.easeOut',
    });
  });

  hitZone.on('pointerdown', () => {
    if (!enabled) return;
    pressed = true;
    audioManager.unlock();
    redraw();
    scene.tweens.killTweensOf(visual);
    scene.tweens.add({
      targets: visual,
      scaleX: 0.965,
      scaleY: 0.965,
      duration: 60,
      ease: 'Quad.easeOut',
    });
  });

  hitZone.on('pointerup', () => {
    if (!enabled) return;
    const wasPressed = pressed;
    pressed = false;
    redraw();
    scene.tweens.killTweensOf(visual);
    scene.tweens.add({
      targets: visual,
      scaleX: hovered ? 1.035 : 1,
      scaleY: hovered ? 1.035 : 1,
      duration: 95,
      ease: 'Back.easeOut',
    });
    if (wasPressed) {
      audioManager.playUiClick(false);
      onClick();
    }
  });

  container.add(hitZone);

  return {
    container,
    labelText,
    setLabel(text: string) {
      labelText.setText(text);
    },
    setFill(newFill: number, newHover?: number, newTextColor?: string) {
      baseFill = newFill;
      hoverFill = newHover ?? newFill;
      if (newTextColor) {
        txtColor = newTextColor;
        labelText.setColor(txtColor);
      }
      redraw();
    },
    setEnabled(val: boolean) {
      enabled = val;
      if (!val) {
        hovered = false;
        pressed = false;
        scene.tweens.killTweensOf(visual);
        visual.setScale(1);
      }
      if (hitZone.input) {
        hitZone.input.cursor = val ? 'pointer' : 'default';
      }
      redraw();
    },
  };
}

/**
 * Draws a subtle architectural maze-blueprint background pattern so menu/setup/result
 * screens share Tank Trouble's crisp labyrinth identity without visual noise.
 */
export function drawMazeBackdrop(scene: Phaser.Scene, width: number, height: number): void {
  scene.add.rectangle(width / 2, height / 2, width, height, UI_COLORS.menuBg);

  const g = scene.add.graphics();
  const step = 64;
  g.lineStyle(1, 0xe1e3e0, 0.9);
  for (let x = 0; x <= width; x += step) {
    g.lineBetween(x, 0, x, height);
  }
  for (let y = 0; y <= height; y += step) {
    g.lineBetween(0, y, width, y);
  }

  // Faint architectural maze wall accents around outer frame edges
  g.fillStyle(0xd8dad7, 0.65);
  const segments: Array<[number, number, number, number]> = [
    [40, 48, 128, 8],
    [40, 48, 8, 96],
    [104, 136, 8, 80],
    [width - 176, 56, 136, 8],
    [width - 48, 56, 8, 112],
    [width - 136, 160, 96, 8],
    [48, height - 144, 8, 96],
    [48, height - 56, 144, 8],
    [width - 192, height - 56, 144, 8],
    [width - 56, height - 152, 8, 104],
  ];
  for (const [sx, sy, sw, sh] of segments) {
    g.fillRoundedRect(sx, sy, sw, sh, 2);
  }
}

/**
 * Renders the bold stacked "TANK TROUBLE" arcade logo + emblem tank.
 */
export function createLogoHeader(
  scene: Phaser.Scene,
  x: number,
  y: number,
  scale = 1,
): Phaser.GameObjects.Container {
  const root = scene.add.container(x, y).setScale(scale);

  // Decorative emblem card behind tank
  const badge = scene.add.graphics();
  badge.fillStyle(0xffffff, 1);
  badge.fillRoundedRect(-195, -52, 390, 108, 12);
  badge.lineStyle(3.5, UI_COLORS.inkDark, 1);
  badge.strokeRoundedRect(-195, -52, 390, 108, 12);

  // Decorative tank silhouette perched on top-right of logo badge
  const heroTankShadow = scene.add
    .image(146, -50, 'tank_shadow')
    .setScale(1.22)
    .setRotation(-0.32);
  const heroTank = scene.add
    .image(143, -54, 'tank_gold_0')
    .setScale(1.22)
    .setRotation(-0.32);

  const leftTankShadow = scene.add
    .image(-146, -48, 'tank_shadow')
    .setScale(1.12)
    .setRotation(0.28);
  const leftTank = scene.add
    .image(-149, -52, 'tank_red_0')
    .setScale(1.12)
    .setRotation(0.28);

  const titleTop = scene.add
    .text(0, -18, 'TANK', {
      fontFamily: "'Impact', 'Arial Black', 'Segoe UI Black', sans-serif",
      fontSize: '52px',
      fontStyle: '900',
      color: '#E53935',
      stroke: '#18191B',
      strokeThickness: 7,
    })
    .setOrigin(0.5, 0.5);

  const titleBottom = scene.add
    .text(0, 26, 'TROUBLE', {
      fontFamily: "'Impact', 'Arial Black', 'Segoe UI Black', sans-serif",
      fontSize: '46px',
      fontStyle: '900',
      color: '#2B2E33',
      stroke: '#FFFFFF',
      strokeThickness: 4,
    })
    .setOrigin(0.5, 0.5);

  // Gentle idle breathing animation on the perched emblem tanks
  scene.tweens.add({
    targets: heroTank,
    rotation: -0.18,
    duration: 1800,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });
  scene.tweens.add({
    targets: leftTank,
    rotation: 0.14,
    duration: 2100,
    yoyo: true,
    repeat: -1,
    ease: 'Sine.easeInOut',
  });

  root.add([badge, leftTankShadow, leftTank, heroTankShadow, heroTank, titleTop, titleBottom]);
  return root;
}

export interface ScoreStepperOptions {
  x: number;
  y: number;
  width: number;
  height: number;
  value: number;
  compact?: boolean;
  onChange: (newScore: number) => void;
  onInteract?: () => void;
}

export interface ScoreStepperHandle {
  container: Phaser.GameObjects.Container;
  setValue: (score: number) => void;
  isEditing: () => boolean;
  commitAndStopEditing: () => void;
  destroy: () => void;
}

/**
 * Interactive Score Goal control (`◀ [ FIRST TO: X PTS / Click to Type ] ▶ [ ∞ ]`):
 * - Left/Right arrow buttons increment or decrement score (`1 <-> ∞ Unlimited`)
 * - Clicking the center display opens live numeric typing (`0` = Unlimited, `1..999` custom pts)
 * - Dedicated `∞` button toggles Unlimited mode in one click
 */
export function createScoreStepper(
  scene: Phaser.Scene,
  opts: ScoreStepperOptions,
): ScoreStepperHandle {
  const { x, y, width, height, compact = false, onChange } = opts;
  let currentScore = normalizeWinningScore(opts.value);
  let lastPositiveScore = currentScore > 0 ? currentScore : 5;
  let editing = false;
  let editBuffer = '';
  let freshEditOpen = false;

  const container = scene.add.container(x, y);

  const arrowW = compact ? 32 : 36;
  const infW = compact ? 36 : 42;
  const gap = 4;
  const centerW = width - arrowW * 2 - infW - gap * 3;

  const leftX = -width / 2 + arrowW / 2;
  const centerX = leftX + arrowW / 2 + gap + centerW / 2;
  const rightX = centerX + centerW / 2 + gap + arrowW / 2;
  const infX = rightX + arrowW / 2 + gap + infW / 2;

  const applyScore = (next: number) => {
    opts.onInteract?.();
    currentScore = normalizeWinningScore(next);
    if (currentScore > 0) lastPositiveScore = currentScore;
    redrawCenter();
    refreshInfinityBtn();
    onChange(currentScore);
  };

  const decBtn = createArcadeButton(scene, {
    x: leftX,
    y: 0,
    width: arrowW,
    height,
    lipHeight: 3,
    label: '◀',
    fontSize: compact ? 13 : 14,
    fillColor: UI_COLORS.cardAltBg,
    hoverColor: 0xdcdfe4,
    onClick: () => {
      if (editing) stopEditing(true);
      applyScore(stepWinningScore(currentScore, -1));
    },
  });

  const incBtn = createArcadeButton(scene, {
    x: rightX,
    y: 0,
    width: arrowW,
    height,
    lipHeight: 3,
    label: '▶',
    fontSize: compact ? 13 : 14,
    fillColor: UI_COLORS.cardAltBg,
    hoverColor: 0xdcdfe4,
    onClick: () => {
      if (editing) stopEditing(true);
      applyScore(stepWinningScore(currentScore, 1));
    },
  });

  const infBtn = createArcadeButton(scene, {
    x: infX,
    y: 0,
    width: infW,
    height,
    lipHeight: 3,
    label: '∞',
    fontSize: compact ? 17 : 19,
    fillColor: UI_COLORS.cardBg,
    onClick: () => {
      if (editing) stopEditing(false);
      applyScore(currentScore === 0 ? lastPositiveScore : 0);
    },
  });

  const centerLip = scene.add.graphics();
  const centerBox = scene.add.graphics();
  const centerLabel = scene.add
    .text(centerX, 0, '', {
      fontFamily: "'Segoe UI', 'Inter', sans-serif",
      fontSize: `${compact ? 13 : 14}px`,
      fontStyle: '900',
      color: UI_COLORS.inkDarkHex,
      align: 'center',
    })
    .setOrigin(0.5, 0.5);

  let centerHovered = false;

  const redrawCenter = () => {
    centerLip.clear();
    centerBox.clear();
    const r = Math.min(8, Math.floor(height * 0.22));
    centerLip.fillStyle(UI_COLORS.inkDark, 1);
    centerLip.fillRoundedRect(centerX - centerW / 2, -height / 2 + 3, centerW, height, r);

    const fill = editing
      ? 0xfff8e1
      : currentScore === 0
        ? 0xe3f2fd
        : centerHovered
          ? 0xf7f9fb
          : UI_COLORS.cardBg;
    const stroke = editing ? 0xfb8c00 : UI_COLORS.inkDark;

    centerBox.fillStyle(fill, 1);
    centerBox.fillRoundedRect(centerX - centerW / 2, -height / 2, centerW, height, r);
    centerBox.lineStyle(editing ? 2.6 : 2.3, stroke, 1);
    centerBox.strokeRoundedRect(centerX - centerW / 2, -height / 2, centerW, height, r);

    if (editing) {
      const shown = editBuffer.length > 0 ? editBuffer : '';
      centerLabel.setText(compact ? `ĐIỂM: ${shown}▌` : `NHẬP ĐIỂM: ${shown}▌`);
      centerLabel.setColor('#E65100');
    } else {
      centerLabel.setText(formatWinningScoreLabel(currentScore, compact));
      centerLabel.setColor(currentScore === 0 ? '#0D47A1' : UI_COLORS.inkDarkHex);
    }
  };

  const refreshInfinityBtn = () => {
    const isInf = currentScore === 0;
    infBtn.setFill(
      isInf ? 0x1e88e5 : UI_COLORS.cardBg,
      isInf ? 0x2196f3 : 0xf4f6f8,
      isInf ? '#FFFFFF' : UI_COLORS.inkDarkHex,
    );
  };

  const centerZone = scene.add
    .zone(centerX, 0, centerW, height + 3)
    .setOrigin(0.5, 0.5)
    .setInteractive({ useHandCursor: true });

  const startEditing = () => {
    opts.onInteract?.();
    editing = true;
    freshEditOpen = true;
    editBuffer = currentScore === 0 ? '0' : String(currentScore);
    audioManager.playUiClick(true);
    redrawCenter();
  };

  const stopEditing = (commit: boolean) => {
    if (!editing) return;
    editing = false;
    freshEditOpen = false;
    if (commit) {
      const next = parseCustomScoreInput(editBuffer, currentScore);
      applyScore(next);
    } else {
      redrawCenter();
    }
  };

  centerZone.on('pointerover', () => {
    centerHovered = true;
    redrawCenter();
  });
  centerZone.on('pointerout', () => {
    centerHovered = false;
    redrawCenter();
  });
  centerZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
    pointer.event?.stopPropagation?.();
    if (!editing) {
      startEditing();
    }
  });

  const onScenePointerDown = (_pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
    if (!editing) return;
    if (!currentlyOver.includes(centerZone)) {
      stopEditing(true);
    }
  };

  const onWindowKeyDown = (e: KeyboardEvent) => {
    if (!editing) return;
    e.preventDefault();
    e.stopPropagation();

    if (e.code === 'Enter' || e.code === 'NumpadEnter') {
      audioManager.playUiClick(false);
      stopEditing(true);
      return;
    }
    if (e.code === 'Escape') {
      audioManager.playUiClick(true);
      stopEditing(false);
      return;
    }
    if (e.code === 'Backspace') {
      if (freshEditOpen) {
        editBuffer = '';
        freshEditOpen = false;
      } else {
        editBuffer = editBuffer.slice(0, -1);
      }
      redrawCenter();
      return;
    }

    let digit = '';
    if (e.code.startsWith('Digit')) digit = e.code.slice(5);
    else if (e.code.startsWith('Numpad') && e.code.length === 7) digit = e.code.slice(6);

    if (/^\d$/.test(digit)) {
      if (freshEditOpen) {
        editBuffer = digit;
        freshEditOpen = false;
      } else if (editBuffer.length < 3) {
        editBuffer = editBuffer === '0' ? digit : editBuffer + digit;
      }
      redrawCenter();
    }
  };

  window.addEventListener('keydown', onWindowKeyDown, true);
  scene.input.on('pointerdown', onScenePointerDown);

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    window.removeEventListener('keydown', onWindowKeyDown, true);
    scene.input?.off('pointerdown', onScenePointerDown);
  };

  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, cleanup);

  redrawCenter();
  refreshInfinityBtn();

  container.add([
    decBtn.container,
    centerLip,
    centerBox,
    centerLabel,
    centerZone,
    incBtn.container,
    infBtn.container,
  ]);

  return {
    container,
    setValue(score: number) {
      currentScore = normalizeWinningScore(score);
      if (currentScore > 0) lastPositiveScore = currentScore;
      redrawCenter();
      refreshInfinityBtn();
    },
    isEditing() {
      return editing;
    },
    commitAndStopEditing() {
      stopEditing(true);
    },
    destroy() {
      scene.events?.off(Phaser.Scenes.Events.SHUTDOWN, cleanup);
      cleanup();
      container.destroy(true);
    },
  };
}

/**
 * Smooth centered pop-in animation for any modal `(0, 0)` content container + scrim backdrop,
 * ending at exact `(x: 0, y: 0, scale: 1, alpha: 1)` so all interactive hit-zones remain pixel-exact!
 */
export function animateModalOpen(
  scene: Phaser.Scene,
  scrim: Phaser.GameObjects.Rectangle,
  contentRoot: Phaser.GameObjects.Container,
): void {
  const targetScrimAlpha = scrim.alpha;
  scrim.setAlpha(0);
  scene.tweens.add({
    targets: scrim,
    alpha: targetScrimAlpha,
    duration: 150,
    ease: 'Quad.easeOut',
  });

  contentRoot.setScale(0.9);
  contentRoot.setPosition(0.1 * (DESIGN_WIDTH / 2), 0.1 * (DESIGN_HEIGHT / 2));
  contentRoot.setAlpha(0);

  scene.tweens.addCounter({
    from: 0,
    to: 1,
    duration: 210,
    ease: 'Back.easeOut',
    onUpdate: (tw) => {
      if (!contentRoot.scene) return;
      const v = tw.getValue() ?? 1;
      const s = 0.9 + 0.1 * v;
      contentRoot.setScale(s);
      contentRoot.setPosition((1 - s) * (DESIGN_WIDTH / 2), (1 - s) * (DESIGN_HEIGHT / 2));
      contentRoot.setAlpha(Math.min(1, Math.max(0, v * 1.45)));
    },
    onComplete: () => {
      if (!contentRoot.scene) return;
      contentRoot.setScale(1);
      contentRoot.setPosition(0, 0);
      contentRoot.setAlpha(1);
    },
  });
}

/**
 * Staggered entrance slide + fade animation for scene UI elements, ending cleanly at their resting `(x, y, alpha: 1)`.
 * Uses `addCounter` rather than `targets: item` so any `killTweensOf(item)` triggered by pointer hover/press
 * during scene opening can NEVER leave a button half-faded or shifted downward!
 */
export function animateStaggeredEntrance(
  scene: Phaser.Scene,
  items: ReadonlyArray<Phaser.GameObjects.Container | Phaser.GameObjects.Text | Phaser.GameObjects.Image>,
  offsetY = 16,
  stepDelayMs = 34,
): void {
  items.forEach((item, idx) => {
    const restY = item.y;
    item.setY(restY + offsetY);
    item.setAlpha(0);
    scene.tweens.addCounter({
      from: 0,
      to: 1,
      delay: idx * stepDelayMs,
      duration: 230,
      ease: 'Cubic.easeOut',
      onUpdate: (tw) => {
        if (!item.scene) return;
        const v = tw.getValue() ?? 1;
        item.setY(restY + offsetY * (1 - v));
        item.setAlpha(Math.min(1, Math.max(0, v)));
      },
      onComplete: () => {
        if (!item.scene) return;
        item.setY(restY);
        item.setAlpha(1);
      },
    });
  });
}
