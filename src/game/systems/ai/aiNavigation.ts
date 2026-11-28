import {
  doorwayWorldPoint,
  hasWallOcclusion,
  worldToGridCell,
  wrapAngleRad,
} from '../../skills/geometry';
import type { GroundSpikeZone, ProximityMineState } from '../../skills/types';
import type { BuiltArenaLayout, GridCell, TankKinematics } from '../../types/gameTypes';
import type { TntBarrelState } from '../BattleModeSim';
import { getAccessibleNeighbors } from '../MazeSystem';
import { wallClearanceInDirection } from './aiBallistics';
import type { MazeDistanceField } from './aiTypes';

/**
 * Fast flat-array BFS from `startCell` across the entire maze (including 24×14 = 336 cells).
 * Computes exact corridor step distance & shortest path tree to ALL enemies and ALL crates in one pass!
 */
export function computeMazeDistanceField(
  startCell: GridCell,
  spikeZones: readonly GroundSpikeZone[],
  mines: readonly ProximityMineState[],
  arena: BuiltArenaLayout,
  barrels: readonly TntBarrelState[] = [],
  avoidHazards = true,
): MazeDistanceField {
  const { cols, rows } = arena.grid;
  const total = cols * rows;
  const startIdx = startCell.row * cols + startCell.col;

  const blocked = new Uint8Array(total);
  if (avoidHazards) {
    for (const z of spikeZones) {
      if (z.age < z.duration) {
        const hc = worldToGridCell(z.x, z.y, arena);
        const idx = hc.row * cols + hc.col;
        if (idx !== startIdx) blocked[idx] = 1;
      }
    }
    for (const m of mines) {
      if (m.age < m.duration) {
        const hc = worldToGridCell(m.x, m.y, arena);
        const idx = hc.row * cols + hc.col;
        if (idx !== startIdx) blocked[idx] = 1;
      }
    }
    for (const br of barrels) {
      if (br.active && br.fuseRemainingSec !== null) {
        const hc = worldToGridCell(br.x, br.y, arena);
        const idx = hc.row * cols + hc.col;
        if (idx !== startIdx) blocked[idx] = 1;
      }
    }
  }

  const dist = new Int16Array(total).fill(-1);
  const parent = new Int16Array(total).fill(-1);
  const queue = new Int16Array(total);
  let head = 0;
  let tail = 0;

  dist[startIdx] = 0;
  queue[tail++] = startIdx;

  while (head < tail) {
    const curIdx = queue[head++];
    const r = Math.floor(curIdx / cols);
    const c = curIdx - r * cols;
    const nextD = dist[curIdx] + 1;

    for (const nb of getAccessibleNeighbors(arena.grid, { col: c, row: r })) {
      const nbIdx = nb.row * cols + nb.col;
      if (dist[nbIdx] !== -1) continue;
      if (avoidHazards && blocked[nbIdx] === 1) continue;
      dist[nbIdx] = nextD;
      parent[nbIdx] = curIdx;
      queue[tail++] = nbIdx;
    }
  }

  return { cols, rows, startIdx, dist, parent };
}

export function resolveWaypointFromField(
  self: TankKinematics,
  goalX: number,
  goalY: number,
  field: MazeDistanceField,
  fallbackField: MazeDistanceField | null,
  arena: BuiltArenaLayout,
): { x: number; y: number; cellSteps: number; firstDoorway: { x: number; y: number } | null } {
  const startCell = worldToGridCell(self.x, self.y, arena);
  const goalCell = worldToGridCell(goalX, goalY, arena);
  const safeHullClearance = self.radius * 1.18;

  if (
    (startCell.col === goalCell.col && startCell.row === goalCell.row) ||
    !hasWallOcclusion(self.x, self.y, goalX, goalY, self.radius * 1.24, arena.walls)
  ) {
    return { x: goalX, y: goalY, cellSteps: 0, firstDoorway: null };
  }

  const goalIdx = goalCell.row * field.cols + goalCell.col;
  let activeField = field;
  if (activeField.dist[goalIdx] < 0 && fallbackField && fallbackField.dist[goalIdx] >= 0) {
    activeField = fallbackField;
  }
  if (activeField.dist[goalIdx] < 0) {
    return { x: goalX, y: goalY, cellSteps: 99, firstDoorway: null };
  }

  const pathIndices: number[] = [];
  let cursor = goalIdx;
  let guard = field.cols * field.rows + 2;
  while (cursor >= 0 && guard-- > 0) {
    pathIndices.push(cursor);
    if (cursor === activeField.startIdx) break;
    cursor = activeField.parent[cursor];
  }
  pathIndices.reverse();

  const cells: GridCell[] = pathIndices.map((idx) => {
    const row = Math.floor(idx / activeField.cols);
    return { col: idx - row * activeField.cols, row };
  });

  const waypoints: Array<{ x: number; y: number }> = [];
  for (let i = 1; i < cells.length; i++) {
    waypoints.push(doorwayWorldPoint(cells[i - 1], cells[i], arena));
    waypoints.push({
      x: arena.originX + (cells[i].col + 0.5) * arena.cellSize,
      y: arena.originY + (cells[i].row + 0.5) * arena.cellSize,
    });
  }
  waypoints.push({ x: goalX, y: goalY });

  const firstDoorway = waypoints[0] ?? null;
  let aim = waypoints[0];
  for (let i = Math.min(waypoints.length - 1, 2); i >= 0; i--) {
    if (
      !hasWallOcclusion(
        self.x,
        self.y,
        waypoints[i].x,
        waypoints[i].y,
        safeHullClearance,
        arena.walls,
      )
    ) {
      aim = waypoints[i];
      break;
    }
  }

  return { x: aim.x, y: aim.y, cellSteps: Math.max(0, cells.length - 1), firstDoorway };
}

export function computeMazeNavigationPoint(
  self: TankKinematics,
  goalX: number,
  goalY: number,
  spikeZones: readonly GroundSpikeZone[],
  mines: readonly ProximityMineState[],
  arena: BuiltArenaLayout,
  barrels: readonly TntBarrelState[] = [],
): { x: number; y: number; cellSteps: number } {
  const startCell = worldToGridCell(self.x, self.y, arena);
  const safeField = computeMazeDistanceField(startCell, spikeZones, mines, arena, barrels, true);
  const goalCell = worldToGridCell(goalX, goalY, arena);
  const goalIdx = goalCell.row * safeField.cols + goalCell.col;
  const fallbackField =
    safeField.dist[goalIdx] < 0
      ? computeMazeDistanceField(startCell, spikeZones, mines, arena, barrels, false)
      : null;

  const wp = resolveWaypointFromField(self, goalX, goalY, safeField, fallbackField, arena);
  return { x: wp.x, y: wp.y, cellSteps: wp.cellSteps };
}

/**
 * Nose-first corridor driving with front wall-whisker centering so tanks NEVER lock into
 * tail-first reverse driving during navigation! `allowEmergencyReverse` is ONLY enabled during
 * acute bullet/explosion evasion when backing up has verified rear wall clearance.
 */
export function driveTankTowardVector(
  self: TankKinematics,
  desiredX: number,
  desiredY: number,
  turnDeadbandRad: number,
  allowEmergencyReverse: boolean,
  arena?: BuiltArenaLayout,
): { forward: boolean; backward: boolean; left: boolean; right: boolean } {
  const mag = Math.hypot(desiredX, desiredY);
  if (mag < 1e-4) {
    return { forward: false, backward: false, left: false, right: false };
  }

  const targetAngle = Math.atan2(desiredY, desiredX);
  let fwdDiff = wrapAngleRad(targetAngle - self.angle);

  if (allowEmergencyReverse && Math.abs(fwdDiff) > (Math.PI * 2) / 3) {
    const rearClear = arena
      ? wallClearanceInDirection(
          self.x,
          self.y,
          -Math.cos(self.angle),
          -Math.sin(self.angle),
          self.radius * 0.9,
          self.radius * 2.4,
          arena.walls,
        )
      : 999;
    if (rearClear > self.radius * 1.35) {
      const revAngle = wrapAngleRad(targetAngle + Math.PI);
      const revDiff = wrapAngleRad(revAngle - self.angle);
      return {
        forward: false,
        backward: true,
        left: revDiff < -turnDeadbandRad,
        right: revDiff > turnDeadbandRad,
      };
    }
  }

  const wantForward = Math.abs(fwdDiff) < Math.PI * 0.42;

  if (wantForward && arena) {
    const whiskerLen = self.radius * 1.72;
    const leftWhisker = wallClearanceInDirection(
      self.x,
      self.y,
      Math.cos(self.angle - 0.62),
      Math.sin(self.angle - 0.62),
      self.radius * 0.55,
      whiskerLen,
      arena.walls,
    );
    const rightWhisker = wallClearanceInDirection(
      self.x,
      self.y,
      Math.cos(self.angle + 0.62),
      Math.sin(self.angle + 0.62),
      self.radius * 0.55,
      whiskerLen,
      arena.walls,
    );
    if (leftWhisker < whiskerLen * 0.85 || rightWhisker < whiskerLen * 0.85) {
      const nudge = ((rightWhisker - leftWhisker) / whiskerLen) * 0.28;
      fwdDiff += nudge;
    }
  }

  return {
    forward: wantForward,
    backward: false,
    left: fwdDiff < -turnDeadbandRad,
    right: fwdDiff > turnDeadbandRad,
  };
}
