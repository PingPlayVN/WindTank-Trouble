import { POWERUP_CONFIG } from '../../config/gameplayConfig';
import type { PlayerIndex, TankKinematics } from '../../types/gameTypes';
import { hitsPolyline, pointToSegmentDistSq } from '../geometry';
import type { SkillDescriptor, SkillFireContext } from '../types';

export const REAPER_SKILL_DESCRIPTOR: SkillDescriptor = {
  id: 'reaper',
  name: 'LƯỠI HÁI TỬ THẦN',
  hudShort: 'LƯỠI HÁI ĐỎ',
  suitTitle: 'Giáp Tử Thần Huyết Ảnh',
  weight: 2,
  dropPercent: 2,
  ammo: 1,
  ammoLabel: 'QUÉT 180° ĐỎ-ĐEN',
  accentColor: 0xd50000,
  accentHex: '#C62828',
  summary: 'CỰC HIẾM: Triệu hồi đại lưỡi liềm Đỏ-Đen khổng lồ xuyên tường, quét chậm 180°.',
  traits: [
    'Xoay hồi chuyển 1 vòng mượt mà dừng ở góc ngẫu nhiên rồi phóng tia trục Đỏ-Đen tới đỉnh 4.7 ô!',
    'Tia chạm đỉnh mới bung ngang 2 đầu LƯỠI LIỀM sắc lẹm rồi bắt đầu xoay quét 180° (khóa di chuyển)',
    'Chém hạ mọi đối thủ không có Khiên Từ Trường chạm vào tia trục hoặc lưỡi liềm đỏ',
  ],
};

const CRESCENT_CURVE_SAMPLES = [-0.32, -0.1, 0.12, 0.36, 0.62, 0.84, 1.05] as const;

function buildCrescentScytheCurve(
  cx: number,
  cy: number,
  ux: number,
  uy: number,
  vx: number,
  vy: number,
  bladeLength: number,
  crescentScale = 1,
): Array<{ x: number; y: number }> {
  if (crescentScale <= 0.02 || bladeLength <= 1) return [];
  const clampedScale = Math.max(0, Math.min(1.15, crescentScale));
  const crescentSpan = bladeLength * 0.44 * clampedScale;
  return CRESCENT_CURVE_SAMPLES.map((t) => {
    const radial = bladeLength * (0.985 - 0.14 * t * t * clampedScale);
    const lateral = t * crescentSpan;
    return {
      x: cx + ux * radial + vx * lateral,
      y: cy + uy * radial + vy * lateral,
    };
  });
}

/**
 * Computes the two opposing wall-piercing plasma shafts (`angle` and `angle + PI`)
 * PLUS two curved transverse Crescent Scythe heads (`crescentA`, `crescentB`)
 * scaled by `crescentScale`, returning all rival tanks sliced by the active shaft or crescent blades.
 */
export function computeReaperBlades(
  cx: number,
  cy: number,
  angle: number,
  ownerIndex: PlayerIndex,
  bladeLength: number,
  tanks: readonly TankKinematics[],
  scaleRatio: number,
  crescentScale = 1,
): {
  bladeA: { x0: number; y0: number; x1: number; y1: number };
  bladeB: { x0: number; y0: number; x1: number; y1: number };
  crescentA: Array<{ x: number; y: number }>;
  crescentB: Array<{ x: number; y: number }>;
  hitVictimIndices: PlayerIndex[];
} {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const vx = -uy;
  const vy = ux;

  const dx = ux * bladeLength;
  const dy = uy * bladeLength;

  const bladeA = { x0: cx, y0: cy, x1: cx + dx, y1: cy + dy };
  const bladeB = { x0: cx, y0: cy, x1: cx - dx, y1: cy - dy };
  const crescentA = buildCrescentScytheCurve(cx, cy, ux, uy, vx, vy, bladeLength, crescentScale);
  const crescentB = buildCrescentScytheCurve(cx, cy, -ux, -uy, -vx, -vy, bladeLength, crescentScale);

  const halfW = POWERUP_CONFIG.reaperBladeHalfWidth * scaleRatio;
  const crescentHalfW = halfW * 1.18;
  const hitVictimIndices: PlayerIndex[] = [];

  if (bladeLength > 2) {
    for (const t of tanks) {
      if (!t.alive || t.index === ownerIndex) continue;
      const shaftRSq = (t.radius + halfW) * (t.radius + halfW);
      const crescRSq = (t.radius + crescentHalfW) * (t.radius + crescentHalfW);
      if (
        pointToSegmentDistSq(t.x, t.y, bladeA.x0, bladeA.y0, bladeA.x1, bladeA.y1) <= shaftRSq ||
        pointToSegmentDistSq(t.x, t.y, bladeB.x0, bladeB.y0, bladeB.x1, bladeB.y1) <= shaftRSq ||
        (crescentA.length >= 2 && hitsPolyline(t.x, t.y, crescentA, crescRSq)) ||
        (crescentB.length >= 2 && hitsPolyline(t.x, t.y, crescentB, crescRSq))
      ) {
        hitVictimIndices.push(t.index);
      }
    }
  }

  return { bladeA, bladeB, crescentA, crescentB, hitVictimIndices };
}

export function fireReaperSkill(ctx: SkillFireContext): { fired: boolean; hudDirty: boolean } {
  const { tank, rng, consumeBufferedPress, audioManager } = ctx;
  if (!consumeBufferedPress()) return { fired: false, hudDirty: false };

  const randomExtraSpin = (0.35 + rng.nextFloat() * 1.55) * Math.PI;
  tank.startReaperSweep(randomExtraSpin);
  audioManager.playReaperActivate();
  return { fired: true, hudDirty: true };
}
