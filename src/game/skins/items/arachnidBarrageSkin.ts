import { roundRectPath } from '../../art/canvasUtils';
import { NEUTRAL_SKIN_STATS, type TankSkinModule } from '../types';

const OUTLINE = '#18191B';

export const ARACHNID_BARRAGE_SKIN: TankSkinModule = {
  descriptor: {
    id: 'arachnid_barrage',
    name: 'Nhện Cơ Khí',
    shortName: 'Nhện Cơ Khí',
    rarity: 'rare',
    rarityLabel: 'ĐA NÒNG',
    rarityColor: 0x43a047,
    rarityHex: '#43A047',
    priceXu: 140000,
    tagline: 'Cỗ máy 4 chân xích cơ khí mang trống đạn xoay 15 viên rải kín mọi hành lang.',
    pros: ['Băng đạn khủng 15 viên (chuẩn 10)', 'Nhịp bắn nhanh +20%, đạn nảy thêm +4 lần'],
    cons: ['Tốc độ đạn bay chậm hơn -12%', 'Tốc độ di chuyển thẳng -8%'],
    stats: {
      ...NEUTRAL_SKIN_STATS,
      forwardSpeedScale: 0.92,
      backwardSpeedScale: 0.95,
      turnSpeedScale: 1.08,
      maxAmmo: 15,
      fireCooldownScale: 0.8,
      projectileSpeedScale: 0.88,
      projectileBonusBounces: 4,
    },
    leavesTreadMarks: true,
    hoverBobAmplitude: 0,
  },

  drawChassis(ctx, palette, treadPhase) {
    // 4 Articulated Diagonal Spider-Crawler Track Pods
    const legAngles = [
      { bx: 9, by: -9, ang: -0.45 },
      { bx: 9, by: 9, ang: 0.45 },
      { bx: -10, by: -9, ang: -2.68 },
      { bx: -10, by: 9, ang: 2.68 },
    ];
    const stepShift = ((treadPhase % 3) - 1) * 1.1;

    for (let i = 0; i < legAngles.length; i++) {
      const leg = legAngles[i];
      ctx.save();
      ctx.translate(leg.bx, leg.by);
      ctx.rotate(leg.ang + (i % 2 === 0 ? stepShift * 0.06 : -stepShift * 0.06));

      // Servo arm strut
      ctx.strokeStyle = '#37474F';
      ctx.lineWidth = 4.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(11, 0);
      ctx.stroke();

      // Mini-crawler pod at tip
      roundRectPath(ctx, 5.5, -3.6, 11.5, 7.2, 2.2);
      ctx.fillStyle = '#263238';
      ctx.fill();
      ctx.lineWidth = 1.7;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();

      ctx.fillStyle = palette.highlightHex;
      ctx.fillRect(8.5, -1.6, 5.5, 3.2);
      ctx.restore();
    }

    // Rear Rotary 15-Shell Drum Magazine
    ctx.beginPath();
    ctx.arc(-15.5, 0, 7.2, 0, Math.PI * 2);
    ctx.fillStyle = '#37474F';
    ctx.fill();
    ctx.lineWidth = 1.9;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
    ctx.fillStyle = '#FFD54F';
    for (let a = 0; a < 6; a++) {
      const th = (a / 6) * Math.PI * 2 + treadPhase * 0.5;
      ctx.beginPath();
      ctx.arc(-15.5 + Math.cos(th) * 3.8, Math.sin(th) * 3.8, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Hexagonal Core Chassis
    this.drawHullClipPath(ctx);
    const grad = ctx.createLinearGradient(-13, -12, 15, 12);
    grad.addColorStop(0, palette.highlightHex);
    grad.addColorStop(0.5, palette.primaryHex);
    grad.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = grad;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  },

  drawHullClipPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-13.5, -7.5);
    ctx.lineTo(-2, -12.2);
    ctx.lineTo(11, -10.5);
    ctx.lineTo(16.5, 0);
    ctx.lineTo(11, 10.5);
    ctx.lineTo(-2, 12.2);
    ctx.lineTo(-13.5, 7.5);
    ctx.closePath();
  },

  drawStandardBarrel(ctx, palette) {
    // Twin-linked Rapid Autocannon Barrels
    for (const by of [-4.3, 1.1]) {
      roundRectPath(ctx, 3, by, 23.5, 3.2, 1.2);
      ctx.fillStyle = palette.primaryHex;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
    roundRectPath(ctx, 17, -5.2, 4.5, 10.4, 1.4);
    ctx.fillStyle = '#FFD54F';
    ctx.fill();
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  },

  drawTurret(ctx, palette) {
    ctx.beginPath();
    ctx.arc(0, 0, 9.6, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 10);
    g.addColorStop(0, palette.highlightHex);
    g.addColorStop(0.6, palette.primaryHex);
    g.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.1;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    // 3 Arachnid Optical Sensors on front arc
    for (const ey of [-3.6, 0, 3.6]) {
      ctx.beginPath();
      ctx.arc(5.5, ey, ey === 0 ? 1.8 : 1.3, 0, Math.PI * 2);
      ctx.fillStyle = '#76FF03';
      ctx.fill();
    }
  },

  drawLiveAura({ kinematics, palette, scaleRatio, timeSec, auraGraphics }) {
    const s = scaleRatio;
    const cos = Math.cos(kinematics.angle);
    const sin = Math.sin(kinematics.angle);
    const drumX = kinematics.x - cos * 15.5 * s;
    const drumY = kinematics.y - sin * 15.5 * s;

    // Rotating Mechanical Ammo-Loader Ring on rear drum
    auraGraphics.lineStyle(1.6 * s, palette.highlight, 0.55);
    auraGraphics.strokeCircle(drumX, drumY, 8.6 * s);
    for (let i = 0; i < 4; i++) {
      const a = timeSec * 4.2 + (i * Math.PI) / 2;
      auraGraphics.fillStyle(0xffd54f, 0.8);
      auraGraphics.fillCircle(
        drumX + Math.cos(a) * 8.6 * s,
        drumY + Math.sin(a) * 8.6 * s,
        1.5 * s,
      );
    }
  },
};
