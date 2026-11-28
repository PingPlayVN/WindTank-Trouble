import { roundRectPath } from '../../art/canvasUtils';
import { NEUTRAL_SKIN_STATS, type TankSkinModule } from '../types';

const OUTLINE = '#18191B';

export const CLASSIC_SKIN: TankSkinModule = {
  descriptor: {
    id: 'classic',
    name: 'Chiến Xa Tiêu Chuẩn',
    shortName: 'Tiêu Chuẩn',
    rarity: 'starter',
    rarityLabel: 'MẶC ĐỊNH',
    rarityColor: 0x546e7a,
    rarityHex: '#546E7A',
    priceXu: 0,
    tagline: 'Khung gầm quân sự cân bằng hoàn hảo cho mọi địa hình mê cung.',
    pros: ['Cân bằng 100% mọi chỉ số cơ bản', 'Băng đạn 10 viên ổn định, dễ làm chủ'],
    cons: ['Không có hiệu ứng cường hóa đặc biệt', 'Kích thước & tốc độ ở mức chuẩn'],
    stats: { ...NEUTRAL_SKIN_STATS },
    leavesTreadMarks: true,
    hoverBobAmplitude: 0,
  },

  drawChassis(ctx, palette, treadPhase, skill) {
    const treadPositions = [-15.5, 9.0];
    for (const ty of treadPositions) {
      roundRectPath(ctx, -19, ty, 38, 6.5, 2.5);
      ctx.fillStyle = skill === 'laser' ? '#1A2733' : skill === 'spike' ? '#231F20' : '#2B2D30';
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = skill === 'laser' ? '#00B0FF' : skill === 'reaper' ? '#FF1744' : '#161719';
      const offset = (treadPhase * 2.2) % 6.6;
      for (let gx = -22 + offset; gx < 20; gx += 6.6) {
        ctx.fillRect(gx, ty, skill === 'laser' || skill === 'reaper' ? 1.8 : 2.6, 6.5);
      }
      ctx.restore();

      roundRectPath(ctx, -19, ty, 38, 6.5, 2.5);
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }

    roundRectPath(ctx, -17, -11.5, 34, 23, 4.5);
    const hullGrad = ctx.createLinearGradient(-17, -12, 17, 12);
    hullGrad.addColorStop(0, palette.highlightHex);
    hullGrad.addColorStop(0.35, palette.primaryHex);
    hullGrad.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = hullGrad;
    ctx.fill();

    if (!skill) {
      ctx.fillStyle = 'rgba(20, 22, 25, 0.38)';
      ctx.fillRect(-13.5, -6.5, 3.2, 3.2);
      ctx.fillRect(-13.5, -1.6, 3.2, 3.2);
      ctx.fillRect(-13.5, 3.3, 3.2, 3.2);
    }

    roundRectPath(ctx, -17, -11.5, 34, 23, 4.5);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  },

  drawHullClipPath(ctx) {
    roundRectPath(ctx, -17, -11.5, 34, 23, 4.5);
  },

  drawStandardBarrel(ctx, palette) {
    roundRectPath(ctx, 2, -3.6, 25, 7.2, 2.0);
    const barrelGrad = ctx.createLinearGradient(2, -3.6, 2, 3.6);
    barrelGrad.addColorStop(0, palette.highlightHex);
    barrelGrad.addColorStop(0.5, palette.primaryHex);
    barrelGrad.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = barrelGrad;
    ctx.fill();
    ctx.lineWidth = 2.1;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    roundRectPath(ctx, 22.5, -4.3, 5.2, 8.6, 1.5);
    ctx.fillStyle = palette.shadowHex;
    ctx.fill();
    ctx.lineWidth = 1.9;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  },

  drawTurret(ctx, palette, skill) {
    ctx.beginPath();
    ctx.arc(0, 0, skill ? 10.0 : 9.2, 0, Math.PI * 2);
    const turretGrad = ctx.createRadialGradient(-2.5, -2.5, 1.5, 0, 0, 10.2);
    turretGrad.addColorStop(0, palette.highlightHex);
    turretGrad.addColorStop(0.65, palette.primaryHex);
    turretGrad.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = turretGrad;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  },
};
