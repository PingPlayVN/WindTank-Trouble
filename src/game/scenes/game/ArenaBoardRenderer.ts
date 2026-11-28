import type Phaser from 'phaser';
import { UI_COLORS } from '../../config/paletteConfig';
import type { BuiltArenaLayout } from '../../types/gameTypes';

export function drawArenaFloorAndGrid(
  scene: Phaser.Scene,
  arena: BuiltArenaLayout,
): {
  arenaGraphics: Phaser.GameObjects.Graphics;
  wallLayerGraphics: Phaser.GameObjects.Graphics;
} {
  scene.cameras.main.setBackgroundColor(UI_COLORS.menuBg);

  const g = scene.add.graphics().setDepth(2);
  const { originX, originY, width, height, cellSize } = arena;

  g.fillStyle(0x000000, 0.12);
  g.fillRoundedRect(originX - 6 + 4, originY - 6 + 6, width + 12, height + 12, 6);

  g.fillStyle(UI_COLORS.arenaFloor, 1);
  g.fillRect(originX, originY, width, height);

  g.lineStyle(1, UI_COLORS.arenaGridLine, 0.85);
  for (let c = 1; c < arena.grid.cols; c++) {
    const gx = originX + c * cellSize;
    g.lineBetween(gx, originY, gx, originY + height);
  }
  for (let r = 1; r < arena.grid.rows; r++) {
    const gy = originY + r * cellSize;
    g.lineBetween(originX, gy, originX + width, gy);
  }

  const wallLayerGraphics = scene.add.graphics().setDepth(10);
  redrawArenaWalls(wallLayerGraphics, arena);
  return { arenaGraphics: g, wallLayerGraphics };
}

export function redrawArenaWalls(
  wallLayer: Phaser.GameObjects.Graphics | undefined,
  arena: BuiltArenaLayout,
): void {
  if (!wallLayer) return;
  wallLayer.clear();

  const { walls } = arena;

  wallLayer.fillStyle(0x000000, 0.14);
  for (const w of walls) {
    wallLayer.fillRect(w.minX + 2.5, w.minY + 3.5, w.width, w.height);
  }

  wallLayer.fillStyle(UI_COLORS.wallStroke, 1);
  for (const w of walls) {
    wallLayer.fillRect(w.minX, w.minY, w.width, w.height);
  }

  const borderInset = Math.max(1.2, 1.8 * arena.scaleRatio);
  wallLayer.fillStyle(UI_COLORS.wallFill, 1);
  for (const w of walls) {
    wallLayer.fillRect(
      w.minX + borderInset,
      w.minY + borderInset,
      Math.max(1, w.width - borderInset * 2),
      Math.max(1, w.height - borderInset * 2),
    );
  }

  wallLayer.fillStyle(UI_COLORS.wallHighlight, 0.65);
  for (const w of walls) {
    if (w.width > w.height) {
      wallLayer.fillRect(
        w.minX + borderInset,
        w.minY + borderInset,
        Math.max(1, w.width - borderInset * 2),
        1.4,
      );
    }
  }
}
