import { sweepCircleAgainstWall } from '../systems/CollisionSystem';
import type { BuiltArenaLayout, GridCell, WallRect } from '../types/gameTypes';

export function wrapAngleRad(angle: number): number {
  let a = (angle + Math.PI) % (Math.PI * 2);
  if (a < 0) a += Math.PI * 2;
  return a - Math.PI;
}

export function clipSegmentExitToBox(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): { x: number; y: number } {
  const dx = x1 - x0;
  const dy = y1 - y0;
  let bestT = 1;

  if (dx > 1e-6) bestT = Math.min(bestT, (maxX - x0) / dx);
  else if (dx < -1e-6) bestT = Math.min(bestT, (minX - x0) / dx);

  if (dy > 1e-6) bestT = Math.min(bestT, (maxY - y0) / dy);
  else if (dy < -1e-6) bestT = Math.min(bestT, (minY - y0) / dy);

  const clampedT = Math.max(0, Math.min(1, bestT));
  return {
    x: x0 + dx * clampedT,
    y: y0 + dy * clampedT,
  };
}

export function pointToSegmentDistSq(
  px: number,
  py: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
): number {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const lenSq = dx * dx + dy * dy;
  let t = 0;
  if (lenSq > 1e-9) {
    t = Math.max(0, Math.min(1, ((px - x0) * dx + (py - y0) * dy) / lenSq));
  }
  const cx = x0 + dx * t;
  const cy = y0 + dy * t;
  return (px - cx) * (px - cx) + (py - cy) * (py - cy);
}

export function hitsPolyline(
  px: number,
  py: number,
  pts: ReadonlyArray<{ x: number; y: number }>,
  hitRSq: number,
): boolean {
  for (let i = 1; i < pts.length; i++) {
    if (pointToSegmentDistSq(px, py, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= hitRSq) {
      return true;
    }
  }
  return false;
}

export function hasWallOcclusion(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  clearanceRadius: number,
  walls: readonly WallRect[],
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (let i = 0; i < walls.length; i++) {
    const hit = sweepCircleAgainstWall(x0, y0, dx, dy, clearanceRadius, walls[i]);
    if (hit && hit.t < 0.995) {
      return true;
    }
  }
  return false;
}

export function worldToGridCell(x: number, y: number, arena: BuiltArenaLayout): GridCell {
  const col = Math.max(
    0,
    Math.min(arena.grid.cols - 1, Math.floor((x - arena.originX) / arena.cellSize)),
  );
  const row = Math.max(
    0,
    Math.min(arena.grid.rows - 1, Math.floor((y - arena.originY) / arena.cellSize)),
  );
  return { col, row };
}

export function doorwayWorldPoint(
  a: GridCell,
  b: GridCell,
  arena: BuiltArenaLayout,
): { x: number; y: number } {
  const cx = (a.col + b.col) * 0.5 + 0.5;
  const cy = (a.row + b.row) * 0.5 + 0.5;
  return {
    x: arena.originX + cx * arena.cellSize,
    y: arena.originY + cy * arena.cellSize,
  };
}
