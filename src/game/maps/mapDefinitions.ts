import type { MapModeId, MazeGridData } from '../types/gameTypes';
import { createEmptySolidGrid, generateProceduralMaze } from '../systems/MazeSystem';

export interface MapModeDescriptor {
  id: MapModeId;
  label: string;
  subtitle: string;
}

export const MAP_MODES: readonly MapModeDescriptor[] = [
  { id: 'mix', label: 'Xoay Tua Tổng Hợp', subtitle: 'Đổi ngẫu nhiên từ mê cung nhỏ đến đại chiến trường' },
  { id: 'procedural_classic', label: 'Ngẫu Nhiên Cổ Điển (9×6)', subtitle: 'Mê cung ngẫu nhiên mới mỗi hiệp đấu' },
  { id: 'procedural_large', label: 'Ngẫu Nhiên Rộng (11×7)', subtitle: 'Mê cung 4 người chơi kích thước lớn' },
  { id: 'procedural_mega', label: 'Ngẫu Nhiên Đại Lộ (14×9)', subtitle: 'Chiến trường đa hành lang rộng lớn' },
  { id: 'procedural_colossal', label: 'Ngẫu Nhiên Khổng Lồ (17×10)', subtitle: 'Mê cung 170 ô quy mô hoành tráng' },
  { id: 'procedural_titan', label: 'Ngẫu Nhiên Đại Titan (20×12)', subtitle: 'Đại mê cung tối đa 240 ô cực kỳ kịch tính' },
  { id: 'classic_duel', label: 'Đấu Tay Đôi (8×5)', subtitle: 'Bản đồ nhỏ gọn giao tranh chớp nhoáng' },
  { id: 'crossfire_chambers', label: 'Giao Lộ Tử Thần (9×6)', subtitle: 'Tâm điểm đọ súng với 4 hành lang bọc sườn' },
  { id: 'four_corners', label: 'Tứ Giác Pháo Đài (9×6)', subtitle: '4 lô cốt góc đối xứng cân bằng' },
  { id: 'ricochet_alley', label: 'Hẻm Đạn Nảy (10×6)', subtitle: 'Hành lang dài chuyên trị bắn nảy tường' },
  { id: 'twin_courtyards', label: 'Song Sân Quyết Đấu (10×6)', subtitle: 'Hai quảng trường ngăn cách bởi hàng cột' },
  { id: 'grand_labyrinth', label: 'Đại Mê Cung (11×7)', subtitle: 'Mê cung chiến thuật dày đặc vách ngăn' },
  { id: 'citadel_wargrounds', label: 'Thành Trì Chiến Địa (14×9)', subtitle: 'Quảng trường trung tâm & vành đai công thành' },
  { id: 'titan_stronghold', label: 'Pháo Đài Đại Titan (16×10)', subtitle: 'Chiến trường đôi quy mô siêu lớn' },
] as const;

/**
 * Parses an ASCII grid diagram into a MazeGridData structure.
 * Format for `cols` x `rows`:
 * - `(2 * rows + 1)` lines, each `(2 * cols + 1)` characters:
 *   - Even line `2*r`, odd char `2*c + 1`: `'-'` = horizontal wall, `' '` = open
 *   - Odd line `2*r + 1`, even char `2*c`: `'|'` = vertical wall, `' '` = open
 */
export function parseAsciiMaze(
  id: string,
  name: string,
  cols: number,
  rows: number,
  lines: string[],
): MazeGridData {
  const grid = createEmptySolidGrid(id, name, cols, rows, 1);
  if (lines.length !== rows * 2 + 1) {
    throw new Error(`Invalid ASCII maze height for ${id}: expected ${rows * 2 + 1}, got ${lines.length}`);
  }

  for (let r = 0; r <= rows; r++) {
    const line = lines[r * 2];
    for (let c = 0; c < cols; c++) {
      const ch = line[c * 2 + 1];
      grid.hWalls[r][c] = ch === '-';
    }
  }

  for (let r = 0; r < rows; r++) {
    const line = lines[r * 2 + 1];
    for (let c = 0; c <= cols; c++) {
      const ch = line[c * 2];
      grid.vWalls[r][c] = ch === '|';
    }
  }

  ensureFullConnectivity(grid);
  return grid;
}

/**
 * Guarantees that any handcrafted preset grid is 100% connected by bridging
 * any isolated cell component to an adjacent reachable cell.
 */
function ensureFullConnectivity(grid: MazeGridData): void {
  const { cols, rows } = grid;
  for (let guard = 0; guard < cols * rows; guard++) {
    const visited = Array.from({ length: rows }, () => Array.from({ length: cols }, () => false));
    const queue: Array<{ c: number; r: number }> = [{ c: 0, r: 0 }];
    visited[0][0] = true;
    let count = 1;

    while (queue.length > 0) {
      const { c, r } = queue.shift()!;
      if (r > 0 && !grid.hWalls[r][c] && !visited[r - 1][c]) {
        visited[r - 1][c] = true;
        count++;
        queue.push({ c, r: r - 1 });
      }
      if (r < rows - 1 && !grid.hWalls[r + 1][c] && !visited[r + 1][c]) {
        visited[r + 1][c] = true;
        count++;
        queue.push({ c, r: r + 1 });
      }
      if (c > 0 && !grid.vWalls[r][c] && !visited[r][c - 1]) {
        visited[r][c - 1] = true;
        count++;
        queue.push({ c: c - 1, r });
      }
      if (c < cols - 1 && !grid.vWalls[r][c + 1] && !visited[r][c + 1]) {
        visited[r][c + 1] = true;
        count++;
        queue.push({ c: c + 1, r });
      }
    }

    if (count === cols * rows) return;

    // Carve one wall between a visited cell and an unvisited neighbor
    let bridged = false;
    for (let r = 0; r < rows && !bridged; r++) {
      for (let c = 0; c < cols && !bridged; c++) {
        if (!visited[r][c]) continue;
        if (c + 1 < cols && !visited[r][c + 1]) {
          grid.vWalls[r][c + 1] = false;
          bridged = true;
        } else if (r + 1 < rows && !visited[r + 1][c]) {
          grid.hWalls[r + 1][c] = false;
          bridged = true;
        } else if (c > 0 && !visited[r][c - 1]) {
          grid.vWalls[r][c] = false;
          bridged = true;
        } else if (r > 0 && !visited[r - 1][c]) {
          grid.hWalls[r][c] = false;
          bridged = true;
        }
      }
    }
    if (!bridged) return;
  }
}

const PRESET_CLASSIC_DUEL = parseAsciiMaze('classic_duel', 'Đấu Tay Đôi 8×5', 8, 5, [
  '+-+-+-+-+-+-+-+-+',
  '|   |       |   |',
  '+ + +-+ +-+ + + +',
  '| |   | |   | | |',
  '+ +-+ + + +-+ + +',
  '|     |   |     |',
  '+ + +-+ + + +-+ +',
  '| | |   | |   | |',
  '+ + + +-+ +-+ + +',
  '|   |       |   |',
  '+-+-+-+-+-+-+-+-+',
]);

const PRESET_CROSSFIRE = parseAsciiMaze('crossfire_chambers', 'Giao Lộ Tử Thần 9×6', 9, 6, [
  '+-+-+-+-+-+-+-+-+-+',
  '|     |     |     |',
  '+ +-+ + +-+ + +-+ +',
  '| |     | |     | |',
  '+ + +-+ + + +-+ + +',
  '|   |         |   |',
  '+-+ + +     + + +-+',
  '|   |         |   |',
  '+ + +-+ + + +-+ + +',
  '| |     | |     | |',
  '+ +-+ + +-+ + +-+ +',
  '|     |     |     |',
  '+-+-+-+-+-+-+-+-+-+',
]);

const PRESET_FOUR_CORNERS = parseAsciiMaze('four_corners', 'Tứ Giác Pháo Đài 9×6', 9, 6, [
  '+-+-+-+-+-+-+-+-+-+',
  '|   |         |   |',
  '+ + + +-+-+-+ + + +',
  '| |     | |     | |',
  '+ +-+ + + + + +-+ +',
  '|     |     |     |',
  '+ +-+ + +-+ + +-+ +',
  '|     |     |     |',
  '+ +-+ + + + + +-+ +',
  '| |     | |     | |',
  '+ + + +-+-+-+ + + +',
  '|   |         |   |',
  '+-+-+-+-+-+-+-+-+-+',
]);

const PRESET_RICOCHET_ALLEY = parseAsciiMaze('ricochet_alley', 'Hẻm Đạn Nảy 10×6', 10, 6, [
  '+-+-+-+-+-+-+-+-+-+-+',
  '|       |   |       |',
  '+ +-+-+ + + + +-+-+ +',
  '| |     | | |     | |',
  '+ + +-+ + + + +-+ + +',
  '|   |     |     |   |',
  '+ + + +-+ + +-+ + + +',
  '|   |     |     |   |',
  '+ + +-+ + + + +-+ + +',
  '| |     | | |     | |',
  '+ +-+-+ + + + +-+-+ +',
  '|       |   |       |',
  '+-+-+-+-+-+-+-+-+-+-+',
]);

const PRESET_TWIN_COURTYARDS = parseAsciiMaze('twin_courtyards', 'Song Sân Quyết Đấu 10×6', 10, 6, [
  '+-+-+-+-+-+-+-+-+-+-+',
  '|     |       |     |',
  '+ +-+ + +-+-+ + +-+ +',
  '| |       |       | |',
  '+ + +   + + +   + + +',
  '|   |   |   |   |   |',
  '+-+ +   + + +   + +-+',
  '|   |   |   |   |   |',
  '+ + +   + + +   + + +',
  '| |       |       | |',
  '+ +-+ + +-+-+ + +-+ +',
  '|     |       |     |',
  '+-+-+-+-+-+-+-+-+-+-+',
]);

const PRESET_GRAND_LABYRINTH = parseAsciiMaze('grand_labyrinth', 'Đại Mê Cung 11×7', 11, 7, [
  '+-+-+-+-+-+-+-+-+-+-+-+',
  '|   |       |       | |',
  '+ + + +-+-+ + +-+-+ + +',
  '| |   |     |     |   |',
  '+ +-+ + + +-+-+ + +-+ +',
  '|     | |   |   | |   |',
  '+ +-+ + +-+ + +-+ + + +',
  '| |   |     |     | | |',
  '+ + + +-+ + + +-+ + +-+',
  '|   | |   |   | |     |',
  '+ +-+ + +-+-+ + + +-+ +',
  '|   |     |     |   | |',
  '+ + +-+-+ + +-+-+ + + +',
  '| |       |       |   |',
  '+-+-+-+-+-+-+-+-+-+-+-+',
]);

const PRESET_CITADEL_WARGROUNDS = parseAsciiMaze('citadel_wargrounds', 'Thành Trì Chiến Địa 14×9', 14, 9, [
  '+-+-+-+-+-+-+-+-+-+-+-+-+-+-+',
  '|     |       |       |     |',
  '+ +-+ + +-+-+ + +-+-+ + +-+ +',
  '| |   | |   |   |   | |   | |',
  '+ + +-+ + + +-+-+ + + +-+ + +',
  '|   |     |       |     |   |',
  '+-+ + +-+ + +- +- + +-+ + +-+',
  '|   | |   | |   | |   | |   |',
  '+ + + + + + +   + + + + + + +',
  '| |     |     |     |     | |',
  '+ + + + + + +   + + + + + + +',
  '|   | |   | |   | |   | |   |',
  '+-+ + +-+ + +- +- + +-+ + +-+',
  '|   |     |       |     |   |',
  '+ + +-+ + + +-+-+ + + +-+ + +',
  '| |   | |   |   |   | |   | |',
  '+ +-+ + +-+-+ + +-+-+ + +-+ +',
  '|     |       |       |     |',
  '+-+-+-+-+-+-+-+-+-+-+-+-+-+-+',
]);

const PRESET_TITAN_STRONGHOLD = parseAsciiMaze('titan_stronghold', 'Pháo Đài Đại Titan 16×10', 16, 10, [
  '+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+',
  '|     |         |         |     |',
  '+ +-+ + +-+-+-+ + +-+-+-+ + +-+ +',
  '| |   | |     |   |     | |   | |',
  '+ + +-+ + +-+ +-+-+ +-+ + +-+ + +',
  '|   |     |   |   |   |     |   |',
  '+-+ + +-+ + + +   + + + +-+ + +-+',
  '|   | |   | |       | |   | |   |',
  '+ + + + + + +-+   +-+ + + + + + +',
  '| |     |       |       |     | |',
  '+ +-+ + + +   + + +   + + + +-+ +',
  '| |     |       |       |     | |',
  '+ + + + + + +-+   +-+ + + + + + +',
  '|   | |   | |       | |   | |   |',
  '+-+ + +-+ + + +   + + + +-+ + +-+',
  '|   |     |   |   |   |     |   |',
  '+ + +-+ + +-+ +-+-+ +-+ + +-+ + +',
  '| |   | |     |   |     | |   | |',
  '+ +-+ + +-+-+-+ + +-+-+-+ + +-+ +',
  '|     |         |         |     |',
  '+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+',
]);

export const PRESET_MAZE_MAP: Record<string, MazeGridData> = {
  classic_duel: PRESET_CLASSIC_DUEL,
  crossfire_chambers: PRESET_CROSSFIRE,
  four_corners: PRESET_FOUR_CORNERS,
  ricochet_alley: PRESET_RICOCHET_ALLEY,
  twin_courtyards: PRESET_TWIN_COURTYARDS,
  grand_labyrinth: PRESET_GRAND_LABYRINTH,
  citadel_wargrounds: PRESET_CITADEL_WARGROUNDS,
  titan_stronghold: PRESET_TITAN_STRONGHOLD,
};

export function resolveMazeForRound(
  mode: MapModeId,
  roundNumber: number,
  playerCount: number,
  seed: number,
): MazeGridData {
  if (mode === 'procedural_classic') {
    const cols = playerCount >= 4 ? 10 : 9;
    return generateProceduralMaze(cols, 6, seed, 'procedural_classic', `Mê Cung ${cols}×6`);
  }
  if (mode === 'procedural_large') {
    return generateProceduralMaze(11, 7, seed, 'procedural_large', 'Mê Cung Rộng 11×7');
  }
  if (mode === 'procedural_mega') {
    return generateProceduralMaze(14, 9, seed, 'procedural_mega', 'Đại Lộ 14×9', 0.16);
  }
  if (mode === 'procedural_colossal') {
    return generateProceduralMaze(17, 10, seed, 'procedural_colossal', 'Khổng Lồ 17×10', 0.17);
  }
  if (mode === 'procedural_titan') {
    return generateProceduralMaze(20, 12, seed, 'procedural_titan', 'Đại Titan 20×12', 0.18);
  }
  if (mode === 'mix') {
    if (roundNumber % 2 === 1) {
      const sizes: Array<[number, number]> =
        playerCount >= 4
          ? [
              [10, 6],
              [12, 8],
              [14, 9],
              [16, 10],
            ]
          : [
              [9, 6],
              [11, 7],
              [14, 9],
            ];
      const [cols, rows] = sizes[(Math.floor(roundNumber / 2) + (seed & 0x7)) % sizes.length];
      return generateProceduralMaze(cols, rows, seed, 'procedural_mix', `Mê Cung ${cols}×${rows} #${roundNumber}`);
    }
    const presetKeys = Object.keys(PRESET_MAZE_MAP);
    const key = presetKeys[(Math.floor(roundNumber / 2) + (seed & 0xff)) % presetKeys.length];
    return cloneMazeGrid(PRESET_MAZE_MAP[key], seed);
  }

  const preset = PRESET_MAZE_MAP[mode];
  if (preset) {
    return cloneMazeGrid(preset, seed);
  }
  return generateProceduralMaze(9, 6, seed);
}

function cloneMazeGrid(grid: MazeGridData, seed: number): MazeGridData {
  return {
    id: grid.id,
    name: grid.name,
    cols: grid.cols,
    rows: grid.rows,
    hWalls: grid.hWalls.map((row) => row.slice()),
    vWalls: grid.vWalls.map((row) => row.slice()),
    seed,
  };
}
