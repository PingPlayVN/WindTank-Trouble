import { ARENA_VIEWPORT, BASE_GAMEPLAY } from '../config/constants';
import { selectBalancedSpawns } from '../systems/MazeSystem';
import type { BuiltArenaLayout, MazeGridData, SpawnPoint, WallRect } from '../types/gameTypes';

export function computeMergedWallsFromGrid(
  grid: MazeGridData,
  originX: number,
  originY: number,
  cellSize: number,
  wallThickness: number,
): WallRect[] {
  const { cols, rows } = grid;
  const halfWall = wallThickness / 2;
  const walls: WallRect[] = [];

  for (let r = 0; r <= rows; r++) {
    let c = 0;
    while (c < cols) {
      if (!grid.hWalls[r][c]) {
        c++;
        continue;
      }
      const startCol = c;
      while (c < cols && grid.hWalls[r][c]) {
        c++;
      }
      const endCol = c;
      const minX = originX + startCol * cellSize - halfWall;
      const maxX = originX + endCol * cellSize + halfWall;
      const minY = originY + r * cellSize - halfWall;
      const maxY = originY + r * cellSize + halfWall;
      walls.push({
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        width: maxX - minX,
        height: maxY - minY,
        minX,
        minY,
        maxX,
        maxY,
      });
    }
  }

  for (let c = 0; c <= cols; c++) {
    let r = 0;
    while (r < rows) {
      if (!grid.vWalls[r][c]) {
        r++;
        continue;
      }
      const startRow = r;
      while (r < rows && grid.vWalls[r][c]) {
        r++;
      }
      const endRow = r;
      const minX = originX + c * cellSize - halfWall;
      const maxX = originX + c * cellSize + halfWall;
      const minY = originY + startRow * cellSize - halfWall;
      const maxY = originY + endRow * cellSize + halfWall;
      walls.push({
        x: (minX + maxX) / 2,
        y: (minY + maxY) / 2,
        width: maxX - minX,
        height: maxY - minY,
        minX,
        minY,
        maxX,
        maxY,
      });
    }
  }

  return walls;
}

export function rebuildArenaWalls(arena: BuiltArenaLayout): void {
  const updated = computeMergedWallsFromGrid(
    arena.grid,
    arena.originX,
    arena.originY,
    arena.cellSize,
    arena.wallThickness,
  );
  arena.walls.length = 0;
  arena.walls.push(...updated);
}

/**
 * Converts a logical `MazeGridData` into world-space geometry (`BuiltArenaLayout`),
 * merging collinear wall segments into minimal AABB `WallRect`s with flush square corners.
 */
export interface ArenaViewportSpec {
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly centerX: number;
  readonly centerY: number;
}

export function buildArenaLayout(
  grid: MazeGridData,
  playerCount: number,
  seed: number,
  viewport: ArenaViewportSpec = ARENA_VIEWPORT,
): BuiltArenaLayout {
  const { cols, rows } = grid;

  const rawCellW = Math.floor((viewport.maxWidth - 14) / cols);
  const rawCellH = Math.floor((viewport.maxHeight - 12) / rows);
  const cellSize = Math.max(24, Math.min(96, rawCellW, rawCellH));
  const scaleRatio = cellSize / BASE_GAMEPLAY.referenceCellSize;
  const wallThickness = Math.max(3, Math.round(BASE_GAMEPLAY.wallThickness * scaleRatio));

  const width = cols * cellSize;
  const height = rows * cellSize;
  const originX = Math.round(viewport.centerX - width / 2);
  const originY = Math.round(viewport.centerY - height / 2);

  const walls = computeMergedWallsFromGrid(grid, originX, originY, cellSize, wallThickness);

  const rawSpawns = selectBalancedSpawns(grid, playerCount, seed);
  const spawns: SpawnPoint[] = rawSpawns.map((sp) => ({
    col: sp.col,
    row: sp.row,
    x: originX + (sp.col + 0.5) * cellSize,
    y: originY + (sp.row + 0.5) * cellSize,
    angle: sp.angle,
  }));

  return {
    grid,
    cellSize,
    wallThickness,
    originX,
    originY,
    width,
    height,
    scaleRatio,
    walls,
    spawns,
  };
}
