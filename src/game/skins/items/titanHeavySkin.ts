import { roundRectPath } from '../../art/canvasUtils';
import { NEUTRAL_SKIN_STATS, type TankSkinModule } from '../types';

const OUTLINE = '#18191B';

export const TITAN_HEAVY_SKIN: TankSkinModule = {
  descriptor: {
    id: 'titan_heavy',
    name: 'Pháo Đài Titan',
    shortName: 'Titan',
    rarity: 'common',
    rarityLabel: 'HẠNG NẶNG',
    rarityColor: 0x6d4c41,
    rarityHex: '#6D4C41',
    priceXu: 55000,
    tagline: 'Pháo đài di động bọc giáp phản ứng nổ kèm lưỡi ủi thép siêu trường.',
    pros: ['Máu chế độ Giáp +45%, kháng văng nổ +60%', 'Đạn pháo to hơn +25% (dễ bắn trúng địch)'],
    cons: ['Thân xe to hơn +18% (dễ bị ngắm bắn)', 'Tốc độ chạy -16%, xoay thân -15%'],
    stats: {
      ...NEUTRAL_SKIN_STATS,
      radiusScale: 1.18,
      forwardSpeedScale: 0.84,
      backwardSpeedScale: 0.84,
      turnSpeedScale: 0.85,
      projectileRadiusScale: 1.25,
      armorHpScale: 1.45,
      knockbackScale: 0.4,
      recoilScale: 0.65,
    },
    leavesTreadMarks: true,
    hoverBobAmplitude: 0,
  },

  drawChassis(ctx, palette, treadPhase) {
    // Extra-wide double armored caterpillar tracks
    for (const ty of [-18.2, 9.8]) {
      roundRectPath(ctx, -21, ty, 41, 8.4, 2.8);
      ctx.fillStyle = '#242629';
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#111214';
      const offset = (treadPhase * 2.2) % 6.6;
      for (let gx = -23 + offset; gx < 21; gx += 6.6) {
        ctx.fillRect(gx, ty, 3.1, 8.4);
      }
      ctx.restore();

      roundRectPath(ctx, -21, ty, 41, 8.4, 2.8);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }

    // Front Serrated V-Dozer Ramming Plow
    ctx.beginPath();
    ctx.moveTo(16.5, -15.5);
    ctx.lineTo(23.5, -10.5);
    ctx.lineTo(21.5, 0);
    ctx.lineTo(23.5, 10.5);
    ctx.lineTo(16.5, 15.5);
    ctx.closePath();
    ctx.fillStyle = '#B0BEC5';
    ctx.fill();
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    // Heavy Blocky Juggernaut Hull + Side Skirts
    this.drawHullClipPath(ctx);
    const grad = ctx.createLinearGradient(-19, -14, 18, 14);
    grad.addColorStop(0, palette.highlightHex);
    grad.addColorStop(0.4, palette.primaryHex);
    grad.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = grad;
    ctx.fill();

    // ERA Reactive Armor Bricks & Rivets
    ctx.save();
    this.drawHullClipPath(ctx);
    ctx.clip();
    ctx.strokeStyle = 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 1.6;
    for (const sx of [-11, -3, 5, 13]) {
      ctx.strokeRect(sx, -13.5, 7, 4);
      ctx.strokeRect(sx, 9.5, 7, 4);
    }
    ctx.fillStyle = '#FFB300';
    ctx.fillRect(14.5, -12, 2.5, 24);
    ctx.restore();

    this.drawHullClipPath(ctx);
    ctx.lineWidth = 2.4;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  },

  drawHullClipPath(ctx) {
    roundRectPath(ctx, -19.5, -13.5, 38, 27, 4.0);
  },

  drawStandardBarrel(ctx, palette) {
    // Heavy Siege Howitzer Cannon with Recoil Sleeve
    roundRectPath(ctx, 2, -5.8, 12, 11.6, 2);
    ctx.fillStyle = palette.shadowHex;
    ctx.fill();
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    roundRectPath(ctx, 11, -4.6, 17, 9.2, 1.8);
    ctx.fillStyle = palette.primaryHex;
    ctx.fill();
    ctx.stroke();

    roundRectPath(ctx, 23.5, -6.2, 6.2, 12.4, 1.8);
    ctx.fillStyle = '#37474F';
    ctx.fill();
    ctx.stroke();
  },

  drawTurret(ctx, palette) {
    // Octagonal Heavy Fortress Turret
    const r = 11.2;
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    const g = ctx.createRadialGradient(-3, -3, 1.5, 0, 0, 12);
    g.addColorStop(0, palette.highlightHex);
    g.addColorStop(0.65, palette.primaryHex);
    g.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.3;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  },

  drawLiveAura({ kinematics, palette, scaleRatio, timeSec, auraGraphics }) {
    const s = scaleRatio;
    const pulse = 0.45 + 0.35 * Math.sin(timeSec * 4.5);
    const cos = Math.cos(kinematics.angle);
    const sin = Math.sin(kinematics.angle);
    const nx = -sin;
    const ny = cos;

    // 4 Corner Reactive-Armor Force Brackets
    const halfL = 19.5 * s;
    const halfW = 15.5 * s;
    auraGraphics.lineStyle(2.0 * s, palette.highlight, 0.55 * pulse);
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        const cx = kinematics.x + cos * sx * halfL + nx * sy * halfW;
        const cy = kinematics.y + sin * sx * halfL + ny * sy * halfW;
        auraGraphics.lineBetween(cx, cy, cx - cos * sx * 6 * s, cy - sin * sx * 6 * s);
        auraGraphics.lineBetween(cx, cy, cx - nx * sy * 6 * s, cy - ny * sy * 6 * s);
      }
    }
  },
};
