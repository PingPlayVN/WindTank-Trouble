import { roundRectPath } from '../../art/canvasUtils';
import { NEUTRAL_SKIN_STATS, type TankSkinModule } from '../types';

const OUTLINE = '#18191B';

export const VIPER_SCOUT_SKIN: TankSkinModule = {
  descriptor: {
    id: 'viper_scout',
    name: 'Bọ Cạp Trinh Sát',
    shortName: 'Bọ Cạp',
    rarity: 'common',
    rarityLabel: 'CƠ ĐỘNG',
    rarityColor: 0x00acc1,
    rarityHex: '#00ACC1',
    priceXu: 25000,
    tagline: 'Siêu xe trinh sát thân chữ V nhỏ gọn, lướt góc hẹp với tốc độ chớp nhoáng.',
    pros: ['Thân nhỏ hơn -18% (khó trúng đạn)', 'Tốc độ chạy +18%, xoay nòng +15%'],
    cons: ['Băng đạn giảm còn 6 viên (chuẩn 10)', 'Máu Giáp -25%, dễ bị nổ hất văng'],
    stats: {
      ...NEUTRAL_SKIN_STATS,
      radiusScale: 0.82,
      forwardSpeedScale: 1.18,
      backwardSpeedScale: 1.15,
      turnSpeedScale: 1.15,
      maxAmmo: 6,
      armorHpScale: 0.75,
      knockbackScale: 1.28,
    },
    leavesTreadMarks: true,
    hoverBobAmplitude: 0,
  },

  drawChassis(ctx, palette, treadPhase) {
    // Sleek narrow high-speed racing treads
    for (const sign of [-1, 1]) {
      const ty = sign < 0 ? -13.8 : 8.6;
      roundRectPath(ctx, -16.5, ty, 31, 5.2, 2.2);
      ctx.fillStyle = '#1E2228';
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#80DEEA';
      const offset = (treadPhase * 2.4) % 5.8;
      for (let gx = -19 + offset; gx < 16; gx += 5.8) {
        ctx.fillRect(gx, ty, 1.6, 5.2);
      }
      ctx.restore();

      roundRectPath(ctx, -16.5, ty, 31, 5.2, 2.2);
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();

      // Rear swept aerodynamic vector fins in player color
      ctx.beginPath();
      ctx.moveTo(-9, sign * 9.5);
      ctx.lineTo(-22.5, sign * 17.5);
      ctx.lineTo(-14, sign * 17.5);
      ctx.lineTo(-2, sign * 10);
      ctx.closePath();
      ctx.fillStyle = palette.primaryHex;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }

    // Swept V-Interceptor Hull
    this.drawHullClipPath(ctx);
    const grad = ctx.createLinearGradient(-16, -10, 18, 10);
    grad.addColorStop(0, palette.highlightHex);
    grad.addColorStop(0.45, palette.primaryHex);
    grad.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = grad;
    ctx.fill();

    // Racing chevron stripe
    ctx.save();
    this.drawHullClipPath(ctx);
    ctx.clip();
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(-9, -8);
    ctx.lineTo(6, 0);
    ctx.lineTo(-9, 8);
    ctx.stroke();
    ctx.fillStyle = '#00E5FF';
    ctx.fillRect(-16, -3.2, 3.2, 6.4);
    ctx.restore();

    this.drawHullClipPath(ctx);
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  },

  drawHullClipPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-15.5, -8.8);
    ctx.lineTo(5, -10.2);
    ctx.lineTo(18.5, -4.2);
    ctx.lineTo(18.5, 4.2);
    ctx.lineTo(5, 10.2);
    ctx.lineTo(-15.5, 8.8);
    ctx.lineTo(-12.5, 0);
    ctx.closePath();
  },

  drawStandardBarrel(ctx, palette) {
    // Needle-nose twin-vented scout carbine
    roundRectPath(ctx, 3, -2.8, 24.5, 5.6, 1.8);
    ctx.fillStyle = '#263238';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    ctx.fillStyle = palette.highlightHex;
    ctx.fillRect(6, -1.3, 16, 2.6);

    roundRectPath(ctx, 23, -3.5, 5, 7, 1.4);
    ctx.fillStyle = palette.primaryHex;
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  },

  drawTurret(ctx, palette) {
    ctx.beginPath();
    ctx.moveTo(-8.5, -6.5);
    ctx.lineTo(4, -7.8);
    ctx.lineTo(9.5, 0);
    ctx.lineTo(4, 7.8);
    ctx.lineTo(-8.5, 6.5);
    ctx.closePath();
    const g = ctx.createLinearGradient(-8, -7, 8, 7);
    g.addColorStop(0, palette.highlightHex);
    g.addColorStop(0.55, palette.primaryHex);
    g.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  },

  drawLiveAura({ kinematics, palette, scaleRatio, timeSec, auraGraphics }) {
    const s = scaleRatio;
    const speed = Math.hypot(kinematics.vx, kinematics.vy);
    const pulse = 0.55 + 0.45 * Math.sin(timeSec * 14);
    const cos = Math.cos(kinematics.angle);
    const sin = Math.sin(kinematics.angle);
    const nx = -sin;
    const ny = cos;

    // Twin turbo thruster glow cones at rear
    const boostLen = (speed > 15 ? 13 : 6.5) * s * (0.85 + 0.25 * pulse);
    for (const sign of [-1, 1]) {
      const bx = kinematics.x - cos * 14 * s + nx * sign * 5.2 * s;
      const by = kinematics.y - sin * 14 * s + ny * sign * 5.2 * s;
      const tx = bx - cos * boostLen;
      const ty = by - sin * boostLen;
      auraGraphics.lineStyle(3.2 * s, 0x00e5ff, 0.52 * pulse);
      auraGraphics.lineBetween(bx, by, tx, ty);
      auraGraphics.lineStyle(1.5 * s, 0xffffff, 0.8 * pulse);
      auraGraphics.lineBetween(bx, by, bx - cos * boostLen * 0.55, by - sin * boostLen * 0.55);
    }

    if (speed > 25) {
      // Aerodynamic V-wake lines off wingtips
      for (const sign of [-1, 1]) {
        const wx = kinematics.x - cos * 15 * s + nx * sign * 13 * s;
        const wy = kinematics.y - sin * 15 * s + ny * sign * 13 * s;
        auraGraphics.lineStyle(1.4 * s, palette.highlight, 0.42);
        auraGraphics.lineBetween(wx, wy, wx - cos * 16 * s, wy - sin * 16 * s);
      }
    }
  },
};
