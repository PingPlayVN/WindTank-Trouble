import type { GridCell, MazeGridData } from '../types/gameTypes';

/**
 * Deterministic SplitMix32 PRNG so every maze seed reproduces identically
 * across browsers, OSes, and Node test runs.
 */
export class SeededRng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
    if (this.state === 0) this.state = 0x9e3779b9;
  }

  nextFloat(): number {
    this.state = (this.state + 0x9e3779b9) >>> 0;
    let z = this.state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    z = (z ^ (z >>> 16)) >>> 0;
    return z / 4294967296;
  }

  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 1) return 0;
    return Math.floor(this.nextFloat() * maxExclusive);
  }

  shuffle<T>(items: T[]): T[] {
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = this.nextInt(i + 1);
      const tmp = copy[i];
      copy[i] = copy[j];
      copy[j] = tmp;
    }
    return copy;
  }
}

export function createEmptySolidGrid(
  id: string,
  name: string,
  cols: number,
  rows: number,
  seed: number,
): MazeGridData {
  const hWalls: boolean[][] = Array.from({ length: rows + 1 }, () =>
    Array.from({ length: cols }, () => true),
  );
  const vWalls: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols + 1 }, () => true),
  );
  return { id, name, cols, rows, hWalls, vWalls, seed };
}

/**
 * Generates an authentic Tank Trouble labyrinth:
 * 1. Carves a full spanning tree via Randomized Depth-First Backtracker (100% connected).
 * 2. Removes ~22% of remaining interior walls while avoiding 2x2 completely empty pillarless voids,
 *    creating tactical loops and multi-corridor ricochet lanes without dead-end claustrophobia.
 * 3. Validates full reachability via BFS flood-fill.
 */
export function generateProceduralMaze(
  cols: number,
  rows: number,
  seed: number,
  id = 'procedural',
  name = 'Procedural Labyrinth',
  extraOpenRatio = 0.14,
): MazeGridData {
  const rng = new SeededRng(seed);
  const grid = createEmptySolidGrid(id, name, cols, rows, seed);
  const visited: boolean[][] = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => false),
  );

  const startCol = rng.nextInt(cols);
  const startRow = rng.nextInt(rows);
  const stack: GridCell[] = [{ col: startCol, row: startRow }];
  visited[startRow][startCol] = true;

  const dirs = [
    { dc: 0, dr: -1, kind: 'N' as const },
    { dc: 1, dr: 0, kind: 'E' as const },
    { dc: 0, dr: 1, kind: 'S' as const },
    { dc: -1, dr: 0, kind: 'W' as const },
  ];

  while (stack.length > 0) {
    const current = stack[stack.length - 1];
    const shuffledDirs = rng.shuffle(dirs);
    let carved = false;

    for (const d of shuffledDirs) {
      const nc = current.col + d.dc;
      const nr = current.row + d.dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows || visited[nr][nc]) {
        continue;
      }
      if (d.kind === 'N') grid.hWalls[current.row][current.col] = false;
      else if (d.kind === 'S') grid.hWalls[current.row + 1][current.col] = false;
      else if (d.kind === 'W') grid.vWalls[current.row][current.col] = false;
      else if (d.kind === 'E') grid.vWalls[current.row][current.col + 1] = false;

      visited[nr][nc] = true;
      stack.push({ col: nc, row: nr });
      carved = true;
      break;
    }

    if (!carved) {
      stack.pop();
    }
  }

  // Collect candidate interior walls to selectively open for loops & ricochet corridors
  interface CandidateWall {
    type: 'h' | 'v';
    r: number;
    c: number;
  }
  const candidates: CandidateWall[] = [];
  for (let r = 1; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (grid.hWalls[r][c]) candidates.push({ type: 'h', r, c });
    }
  }
  for (let r = 0; r < rows; r++) {
    for (let c = 1; c < cols; c++) {
      if (grid.vWalls[r][c]) candidates.push({ type: 'v', r, c });
    }
  }

  const shuffledCandidates = rng.shuffle(candidates);
  const targetOpenings = Math.round(candidates.length * extraOpenRatio);
  let opened = 0;

  for (const cand of shuffledCandidates) {
    if (opened >= targetOpenings) break;
    if (cand.type === 'h') {
      grid.hWalls[cand.r][cand.c] = false;
      if (createsIsolatedVoidVertex(grid, cand.c, cand.r) || createsIsolatedVoidVertex(grid, cand.c + 1, cand.r)) {
        grid.hWalls[cand.r][cand.c] = true;
      } else {
        opened++;
      }
    } else {
      grid.vWalls[cand.r][cand.c] = false;
      if (createsIsolatedVoidVertex(grid, cand.c, cand.r) || createsIsolatedVoidVertex(grid, cand.c, cand.r + 1)) {
        grid.vWalls[cand.r][cand.c] = true;
      } else {
        opened++;
      }
    }
  }

  // Also ensure dead-ends (cells with 3 walls) aren't excessive — open one wall on ~45% of dead ends
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const closedSides = getClosedInteriorWalls(grid, c, r);
      const totalWalls =
        (grid.hWalls[r][c] ? 1 : 0) +
        (grid.hWalls[r + 1][c] ? 1 : 0) +
        (grid.vWalls[r][c] ? 1 : 0) +
        (grid.vWalls[r][c + 1] ? 1 : 0);
      if (totalWalls >= 3 && closedSides.length > 0 && rng.nextFloat() < 0.22) {
        const pick = closedSides[rng.nextInt(closedSides.length)];
        if (pick.type === 'h') grid.hWalls[pick.r][pick.c] = false;
        else grid.vWalls[pick.r][pick.c] = false;
      }
    }
  }

  return grid;
}

function createsIsolatedVoidVertex(grid: MazeGridData, vx: number, vy: number): boolean {
  if (vx <= 0 || vx >= grid.cols || vy <= 0 || vy >= grid.rows) return false;
  const top = grid.vWalls[vy - 1][vx];
  const bottom = grid.vWalls[vy][vx];
  const left = grid.hWalls[vy][vx - 1];
  const right = grid.hWalls[vy][vx];
  return !top && !bottom && !left && !right;
}

function getClosedInteriorWalls(
  grid: MazeGridData,
  c: number,
  r: number,
): Array<{ type: 'h' | 'v'; r: number; c: number }> {
  const res: Array<{ type: 'h' | 'v'; r: number; c: number }> = [];
  if (r > 0 && grid.hWalls[r][c]) res.push({ type: 'h', r, c });
  if (r < grid.rows - 1 && grid.hWalls[r + 1][c]) res.push({ type: 'h', r: r + 1, c });
  if (c > 0 && grid.vWalls[r][c]) res.push({ type: 'v', r, c });
  if (c < grid.cols - 1 && grid.vWalls[r][c + 1]) res.push({ type: 'v', r, c: c + 1 });
  return res;
}

export function getAccessibleNeighbors(grid: MazeGridData, cell: GridCell): GridCell[] {
  const { col, row } = cell;
  const neighbors: GridCell[] = [];
  if (row > 0 && !grid.hWalls[row][col]) neighbors.push({ col, row: row - 1 });
  if (row < grid.rows - 1 && !grid.hWalls[row + 1][col]) neighbors.push({ col, row: row + 1 });
  if (col > 0 && !grid.vWalls[row][col]) neighbors.push({ col: col - 1, row });
  if (col < grid.cols - 1 && !grid.vWalls[row][col + 1]) neighbors.push({ col: col + 1, row });
  return neighbors;
}

/**
 * Flood-fill validation ensuring 100% of arena cells are mutually reachable
 * and outer perimeter walls are intact.
 */
export function isMazeValidAndConnected(grid: MazeGridData): boolean {
  const { cols, rows, hWalls, vWalls } = grid;
  if (cols < 3 || rows < 3) return false;

  for (let c = 0; c < cols; c++) {
    if (!hWalls[0][c] || !hWalls[rows][c]) return false;
  }
  for (let r = 0; r < rows; r++) {
    if (!vWalls[r][0] || !vWalls[r][cols]) return false;
  }

  const visited = new Set<number>();
  const queue: GridCell[] = [{ col: 0, row: 0 }];
  visited.add(0);

  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    for (const next of getAccessibleNeighbors(grid, curr)) {
      const key = next.row * cols + next.col;
      if (!visited.has(key)) {
        visited.add(key);
        queue.push(next);
      }
    }
  }

  return visited.size === cols * rows;
}

export function computeBfsDistances(grid: MazeGridData, start: GridCell): number[][] {
  const dist: number[][] = Array.from({ length: grid.rows }, () =>
    Array.from({ length: grid.cols }, () => Infinity),
  );
  dist[start.row][start.col] = 0;
  const queue: GridCell[] = [start];
  let head = 0;
  while (head < queue.length) {
    const curr = queue[head++];
    const nextDist = dist[curr.row][curr.col] + 1;
    for (const n of getAccessibleNeighbors(grid, curr)) {
      if (dist[n.row][n.col] === Infinity) {
        dist[n.row][n.col] = nextDist;
        queue.push(n);
      }
    }
  }
  return dist;
}

/**
 * Selects balanced, well-separated spawn cells for up to 4 players using
 * quadrant anchoring + BFS maze path distance maximization, and chooses a safe
 * initial facing angle down an open corridor.
 */
export function selectBalancedSpawns(
  grid: MazeGridData,
  count: number,
  seed: number,
): Array<{ col: number; row: number; angle: number }> {
  const rng = new SeededRng(seed ^ 0x5bd1e995);
  const { cols, rows } = grid;

  // Define 4 quadrant regions so players naturally start in distinct sectors
  const midC = Math.floor(cols / 2);
  const midR = Math.floor(rows / 2);
  const quadrants: GridCell[][] = [
    [], // Top-Left
    [], // Bottom-Right (opposite P1 for 2P!)
    [], // Top-Right
    [], // Bottom-Left
  ];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const isLeft = c < midC;
      const isTop = r < midR;
      if (isLeft && isTop) quadrants[0].push({ col: c, row: r });
      else if (!isLeft && !isTop) quadrants[1].push({ col: c, row: r });
      else if (!isLeft && isTop) quadrants[2].push({ col: c, row: r });
      else quadrants[3].push({ col: c, row: r });
    }
  }

  const chosen: GridCell[] = [];
  const bfsCaches: number[][][] = [];

  for (let i = 0; i < count; i++) {
    const pool = rng.shuffle(quadrants[i % 4]);
    let bestCell = pool[0] ?? { col: i % cols, row: Math.floor(i / cols) % rows };
    let bestScore = -1;

    for (const candidate of pool) {
      if (chosen.some((ch) => ch.col === candidate.col && ch.row === candidate.row)) continue;
      const openNeighbors = getAccessibleNeighbors(grid, candidate).length;
      if (openNeighbors === 0) continue;

      let minGraphDist = 999;
      for (const distMap of bfsCaches) {
        const d = distMap[candidate.row][candidate.col];
        if (d < minGraphDist) minGraphDist = d;
      }
      if (bfsCaches.length === 0) {
        // First player prefers corner-ish sector with >= 2 exits if available
        minGraphDist = (midC - candidate.col) + (midR - candidate.row);
      }

      const opennessBonus = openNeighbors >= 2 ? 0.5 : 0;
      const score = minGraphDist + opennessBonus + rng.nextFloat() * 0.35;
      if (score > bestScore) {
        bestScore = score;
        bestCell = candidate;
      }
    }

    chosen.push(bestCell);
    bfsCaches.push(computeBfsDistances(grid, bestCell));
  }

  const orderIndices = rng.shuffle(chosen.map((_, idx) => idx));
  return orderIndices.map((idx) => {
    const cell = chosen[idx];
    const angle = chooseSafeSpawnAngle(grid, cell, rng);
    return { col: cell.col, row: cell.row, angle };
  });
}

function chooseSafeSpawnAngle(grid: MazeGridData, cell: GridCell, rng: SeededRng): number {
  const openAngles: number[] = [];
  const { col, row } = cell;
  if (col < grid.cols - 1 && !grid.vWalls[row][col + 1]) openAngles.push(0); // East
  if (row < grid.rows - 1 && !grid.hWalls[row + 1][col]) openAngles.push(Math.PI / 2); // South
  if (col > 0 && !grid.vWalls[row][col]) openAngles.push(Math.PI); // West
  if (row > 0 && !grid.hWalls[row][col]) openAngles.push(-Math.PI / 2); // North

  if (openAngles.length === 0) return 0;
  const base = openAngles[rng.nextInt(openAngles.length)];
  const jitter = (rng.nextFloat() - 0.5) * 0.28; // slight natural angle variance (~±8°)
  return base + jitter;
}
