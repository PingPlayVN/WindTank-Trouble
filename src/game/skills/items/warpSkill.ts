import type { PlayerIndex, TankKinematics } from '../../types/gameTypes';
import type { SkillDescriptor, SkillFireContext } from '../types';

export const WARP_SKILL_DESCRIPTOR: SkillDescriptor = {
  id: 'warp',
  name: 'MỎ NEO KHÔNG GIAN',
  hudShort: 'DỊCH CHUYỂN',
  suitTitle: 'Giáp Lữ Khách Thời Không',
  weight: 4,
  dropPercent: 4,
  ammo: 1,
  ammoLabel: 'ĐẶT CỔNG → BIẾN VỀ',
  accentColor: 0xab47bc,
  accentHex: '#8E24AA',
  summary:
    'Cắm Mỏ Neo trên sàn, bấm lần 2 dịch chuyển tức thời về Mỏ Neo và gây vụ nổ nhỏ ở CẢ 2 ĐẦU đi & đến!',
  traits: [
    'Bấm BẮN lần 1: Cắm Mỏ Neo Không Gian tại vị trí hiện tại (duy trì tối đa 12s)',
    'Bấm BẮN lần 2: Dịch chuyển tức thời về Mỏ Neo để thoát hiểm hoặc úp sọt bất ngờ!',
    'NỔ KÉP 2 ĐẦU: Tạo vụ nổ nhỏ ở CẢ vị trí vừa biến đi lẫn tại Mỏ Neo đáp về, hạ địch đuổi theo & rình cổng!',
  ],
};

/**
 * Finds rival tanks caught inside a compact Spatial Warp Rift Explosion (`vụ nổ nhỏ`)
 * at either the departure point or the arrival anchor `(blastX, blastY)`.
 */
export function computeWarpBlastVictims(
  blastX: number,
  blastY: number,
  ownerIndex: PlayerIndex,
  blastRadius: number,
  tanks: readonly TankKinematics[],
): PlayerIndex[] {
  const victims: PlayerIndex[] = [];
  for (const t of tanks) {
    if (!t.alive || t.index === ownerIndex) continue;
    if (Math.hypot(t.x - blastX, t.y - blastY) <= blastRadius + t.radius * 0.65) {
      victims.push(t.index);
    }
  }
  return victims;
}

export function fireWarpSkill(ctx: SkillFireContext): { fired: boolean; hudDirty: boolean } {
  if (!ctx.consumeBufferedPress()) return { fired: false, hudDirty: false };
  return ctx.executeWarpAction(ctx.tank);
}
