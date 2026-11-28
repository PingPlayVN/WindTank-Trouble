import { POWERUP_CONFIG } from '../../config/gameplayConfig';
import { rebuildArenaWalls } from '../../maps/MazeBuilder';
import type { BuiltArenaLayout, TankKinematics } from '../../types/gameTypes';
import { pointToSegmentDistSq } from '../geometry';
import { ejectTankFromInteriorWalls } from './phantomSkill';
import type { EnergyBarrierState, SkillDescriptor, SkillFireContext } from '../types';

export const BARRIER_SKILL_DESCRIPTOR: SkillDescriptor = {
  id: 'barrier',
  name: 'TƯỜNG NĂNG LƯỢNG',
  hudShort: 'XÂY TƯỜNG',
  suitTitle: 'Giáp Kiến Trúc Chiến Trường',
  weight: 8,
  dropPercent: 8,
  ammo: POWERUP_CONFIG.barrierAmmo,
  ammoLabel: '3 VÁCH CHẮN',
  accentColor: 0x2e7d32,
  accentHex: '#2E7D32',
  summary: 'Dựng vách ngăn năng lượng ngay trước mặt để bịt kín cửa ngõ, nhốt địch hoặc nảy đạn.',
  traits: [
    '3 vách chắn năng lượng • Tồn tại 8.0s khóa chặt ô cửa mê cung ngay trước mũi xe',
    'Chặn đứng xe tăng, khóa đường Tên Lửa Định Vị & bật nảy đạn vật lý y như tường thật!',
    'Có thể bị phá hủy sớm bởi Mũi Khoan, Laser, Thùng nổ TNT hoặc xung điện EMP',
  ],
};

export function previewEnergyBarrierEdge(
  tank: TankKinematics,
  arena: BuiltArenaLayout,
): {
  kind: 'h' | 'v';
  r: number;
  c: number;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
} | null {
  const { grid, originX, originY, cellSize } = arena;
  const { cols, rows } = grid;
  const fx = Math.cos(tank.angle);
  const fy = Math.sin(tank.angle);
  const probeX = tank.x + fx * (cellSize * 0.56);
  const probeY = tank.y + fy * (cellSize * 0.56);
  const maxSearchDist = cellSize * 1.45;

  let best: {
    kind: 'h' | 'v';
    r: number;
    c: number;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    score: number;
  } | null = null;

  for (let r = 1; r < rows; r++) {
    const wy = originY + r * cellSize;
    if (Math.abs(wy - probeY) > maxSearchDist) continue;
    for (let c = 0; c < cols; c++) {
      if (grid.hWalls[r][c]) continue;
      const x0 = originX + c * cellSize;
      const x1 = x0 + cellSize;
      const mx = (x0 + x1) * 0.5;
      const my = wy;
      const toEdgeX = mx - tank.x;
      const toEdgeY = my - tank.y;
      const distFromTank = Math.hypot(toEdgeX, toEdgeY);
      if (distFromTank < tank.radius * 0.35 || distFromTank > maxSearchDist * 1.25) continue;

      const forwardDot = (toEdgeX * fx + toEdgeY * fy) / (distFromTank || 1);
      if (forwardDot < 0.12) continue;

      const perpAlign = Math.abs(fy);
      const probeDist = Math.hypot(mx - probeX, my - probeY);
      const score = probeDist - perpAlign * (cellSize * 0.38) - forwardDot * (cellSize * 0.22);
      if (!best || score < best.score) {
        best = { kind: 'h', r, c, x0, y0: wy, x1, y1: wy, score };
      }
    }
  }

  for (let c = 1; c < cols; c++) {
    const wx = originX + c * cellSize;
    if (Math.abs(wx - probeX) > maxSearchDist) continue;
    for (let r = 0; r < rows; r++) {
      if (grid.vWalls[r][c]) continue;
      const y0 = originY + r * cellSize;
      const y1 = y0 + cellSize;
      const mx = wx;
      const my = (y0 + y1) * 0.5;
      const toEdgeX = mx - tank.x;
      const toEdgeY = my - tank.y;
      const distFromTank = Math.hypot(toEdgeX, toEdgeY);
      if (distFromTank < tank.radius * 0.35 || distFromTank > maxSearchDist * 1.25) continue;

      const forwardDot = (toEdgeX * fx + toEdgeY * fy) / (distFromTank || 1);
      if (forwardDot < 0.12) continue;

      const perpAlign = Math.abs(fx);
      const probeDist = Math.hypot(mx - probeX, my - probeY);
      const score = probeDist - perpAlign * (cellSize * 0.38) - forwardDot * (cellSize * 0.22);
      if (!best || score < best.score) {
        best = { kind: 'v', r, c, x0: wx, y0, x1: wx, y1, score };
      }
    }
  }

  if (!best) return null;
  return {
    kind: best.kind,
    r: best.r,
    c: best.c,
    x0: best.x0,
    y0: best.y0,
    x1: best.x1,
    y1: best.y1,
  };
}

export function deployEnergyBarrierAhead(
  tank: TankKinematics,
  arena: BuiltArenaLayout,
  allTanks: readonly TankKinematics[],
  nextId: number,
  durationSec = POWERUP_CONFIG.barrierDurationSec,
): EnergyBarrierState | null {
  const best = previewEnergyBarrierEdge(tank, arena);
  if (!best) return null;

  if (best.kind === 'h') {
    arena.grid.hWalls[best.r][best.c] = true;
  } else {
    arena.grid.vWalls[best.r][best.c] = true;
  }
  rebuildArenaWalls(arena);

  for (const t of allTanks) {
    if (t.alive) {
      ejectTankFromInteriorWalls(t, arena);
    }
  }

  return {
    id: nextId,
    ownerIndex: tank.index,
    kind: best.kind,
    r: best.r,
    c: best.c,
    x0: best.x0,
    y0: best.y0,
    x1: best.x1,
    y1: best.y1,
    age: 0,
    duration: durationSec,
  };
}

export function removeEnergyBarrierFromArena(
  barrier: EnergyBarrierState,
  arena: BuiltArenaLayout,
): void {
  if (barrier.kind === 'h') {
    if (arena.grid.hWalls[barrier.r]?.[barrier.c] !== undefined) {
      arena.grid.hWalls[barrier.r][barrier.c] = false;
    }
  } else if (arena.grid.vWalls[barrier.r]?.[barrier.c] !== undefined) {
    arena.grid.vWalls[barrier.r][barrier.c] = false;
  }
  rebuildArenaWalls(arena);
}

export function findBarriersHitByPolyline(
  points: ReadonlyArray<{ x: number; y: number }>,
  halfWidth: number,
  barriers: readonly EnergyBarrierState[],
): number[] {
  if (points.length < 2 || barriers.length === 0) return [];
  const hitIds: number[] = [];
  const threshSq = (halfWidth + 6) * (halfWidth + 6);

  for (const b of barriers) {
    if (b.age >= b.duration) continue;
    const mx = (b.x0 + b.x1) * 0.5;
    const my = (b.y0 + b.y1) * 0.5;
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      if (
        pointToSegmentDistSq(mx, my, p0.x, p0.y, p1.x, p1.y) <= threshSq ||
        pointToSegmentDistSq(b.x0, b.y0, p0.x, p0.y, p1.x, p1.y) <= threshSq ||
        pointToSegmentDistSq(b.x1, b.y1, p0.x, p0.y, p1.x, p1.y) <= threshSq
      ) {
        hitIds.push(b.id);
        break;
      }
    }
  }
  return hitIds;
}

export function fireBarrierSkill(ctx: SkillFireContext): { fired: boolean; hudDirty: boolean } {
  const {
    tank,
    allTanks,
    arena,
    consumeBufferedPress,
    allocateEntityId,
    registerBarrier,
    effectsSystem,
    audioManager,
    emitNetEvent,
  } = ctx;
  if (!consumeBufferedPress()) return { fired: false, hudDirty: false };

  const barrier = deployEnergyBarrierAhead(
    tank.kinematics,
    arena,
    allTanks.map((t) => t.kinematics),
    allocateEntityId(),
    POWERUP_CONFIG.barrierDurationSec,
  );
  if (!barrier) {
    return { fired: false, hudDirty: false };
  }

  registerBarrier(barrier);
  tank.triggerFireVisual(POWERUP_CONFIG.barrierCooldownSec);
  audioManager.playBarrierDeploy();
  effectsSystem.emitBarrierDeploy(barrier.x0, barrier.y0, barrier.x1, barrier.y1);
  emitNetEvent({
    kind: 'hazard_fx',
    sub: 'barrier_deploy',
    x: barrier.x0,
    y: barrier.y0,
    x2: barrier.x1,
    y2: barrier.y1,
  });

  const { depleted } = tank.consumeSkillAmmo(1);
  if (depleted) {
    effectsSystem.emitSuitRevert(tank.kinematics.x, tank.kinematics.y);
  }
  return { fired: true, hudDirty: true };
}
