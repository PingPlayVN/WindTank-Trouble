import { roundRectPath } from '../../art/canvasUtils';
import { NEUTRAL_SKIN_STATS, type TankSkinModule } from '../types';

const OUTLINE = '#18191B';

export const HOVER_SPECTER_SKIN: TankSkinModule = {
  descriptor: {
    id: 'hover_specter',
    name: 'Đệm Từ Bóng Đêm',
    shortName: 'Đệm Từ',
    rarity: 'epic',
    rarityLabel: 'PHẢN TRỌNG LỰC',
    rarityColor: 0x00897b,
    rarityHex: '#00897B',
    priceXu: 200000,
    tagline: 'Chiến xa đệm từ lơ lửng không bánh xích — lùi nhanh ngang tiến, lướt êm qua băng.',
    pros: ['Tốc độ đi lùi siêu tốc (+35%, ngang đi tiến)', 'Xoay tại chỗ +30%, kháng trơn băng 50%'],
    cons: ['Thân bè hơn +6%, máu Giáp -15%', 'Độ giật lùi khi bắn mạnh hơn +35%'],
    stats: {
      ...NEUTRAL_SKIN_STATS,
      radiusScale: 1.06,
      forwardSpeedScale: 1.04,
      backwardSpeedScale: 1.38,
      turnSpeedScale: 1.3,
      armorHpScale: 0.85,
      recoilScale: 1.35,
      iceResistRatio: 0.5,
    },
    leavesTreadMarks: false,
    hoverBobAmplitude: 2.1,
  },

  drawChassis(ctx, palette) {
    // Curved Twin Anti-Gravity Hover Nacelles (instead of rubber treads!)
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-18, sign * 9.5);
      ctx.quadraticCurveTo(0, sign * 20.5, 19, sign * 10.5);
      ctx.lineTo(14, sign * 7.2);
      ctx.quadraticCurveTo(0, sign * 14.5, -14, sign * 7.2);
      ctx.closePath();
      ctx.fillStyle = palette.shadowHex;
      ctx.fill();
      ctx.lineWidth = 1.9;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();

      // Glowing Cyan Ion Thruster Strip inside nacelle
      ctx.beginPath();
      ctx.moveTo(-12, sign * 11.8);
      ctx.quadraticCurveTo(0, sign * 16.8, 12, sign * 11.8);
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 2.4;
      ctx.stroke();
    }

    // Streamlined Manta Hover Hull
    this.drawHullClipPath(ctx);
    const grad = ctx.createRadialGradient(-2, -3, 2, 0, 0, 20);
    grad.addColorStop(0, palette.highlightHex);
    grad.addColorStop(0.55, palette.primaryHex);
    grad.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.save();
    this.drawHullClipPath(ctx);
    ctx.clip();
    ctx.strokeStyle = '#84FFFF';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.arc(-14, 0, 8, -0.9, 0.9);
    ctx.stroke();
    ctx.restore();

    this.drawHullClipPath(ctx);
    ctx.lineWidth = 2.1;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  },

  drawHullClipPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-17.5, -6.5);
    ctx.quadraticCurveTo(-2, -13.5, 17.5, -6.5);
    ctx.quadraticCurveTo(21, 0, 17.5, 6.5);
    ctx.quadraticCurveTo(-2, 13.5, -17.5, 6.5);
    ctx.quadraticCurveTo(-20.5, 0, -17.5, -6.5);
    ctx.closePath();
  },

  drawStandardBarrel(ctx, palette) {
    // Sleek Ion-Lance Barrel
    roundRectPath(ctx, 3, -3.4, 24, 6.8, 3.0);
    const g = ctx.createLinearGradient(3, -3.4, 3, 3.4);
    g.addColorStop(0, palette.highlightHex);
    g.addColorStop(0.5, palette.primaryHex);
    g.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 1.9;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    ctx.fillStyle = '#00E5FF';
    ctx.beginPath();
    ctx.arc(24.5, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
  },

  drawTurret(ctx, palette) {
    ctx.beginPath();
    ctx.ellipse(0, 0, 10.5, 8.8, 0, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-2, -2, 1.5, 0, 0, 10.5);
    g.addColorStop(0, palette.highlightHex);
    g.addColorStop(0.65, palette.primaryHex);
    g.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.1;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    ctx.strokeStyle = '#84FFFF';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, 5.2, -1.2, 1.2);
    ctx.stroke();
  },

  drawLiveAura({ kinematics, palette, scaleRatio, timeSec, auraGraphics }) {
    const s = scaleRatio;
    const pulse = 0.5 + 0.5 * Math.sin(timeSec * 6.5);
    const expand = (timeSec * 1.4) % 1;

    // Anti-gravity plasma cushion under hull
    auraGraphics.fillStyle(0x00e5ff, 0.13 + 0.06 * pulse);
    auraGraphics.fillCircle(kinematics.x, kinematics.y + 2 * s, 18.5 * s);

    auraGraphics.lineStyle(2.0 * s, 0x00e5ff, 0.65 * (1 - expand));
    auraGraphics.strokeCircle(kinematics.x, kinematics.y + 2 * s, (13 + expand * 11) * s);

    auraGraphics.lineStyle(1.4 * s, palette.highlight, 0.45);
    auraGraphics.strokeCircle(kinematics.x, kinematics.y + 2 * s, 16 * s);
  },
};
