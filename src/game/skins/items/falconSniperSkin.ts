import { roundRectPath } from '../../art/canvasUtils';
import { NEUTRAL_SKIN_STATS, type TankSkinModule } from '../types';

const OUTLINE = '#18191B';

export const FALCON_SNIPER_SKIN: TankSkinModule = {
  descriptor: {
    id: 'falcon_sniper',
    name: 'Ưng Tiễn Xạ Thủ',
    shortName: 'Ưng Tiễn',
    rarity: 'rare',
    rarityLabel: 'VIỄN CHINH',
    rarityColor: 0x1e88e5,
    rarityHex: '#1E88E5',
    priceXu: 90000,
    tagline: 'Chiến xa bắn tỉa điện từ trường với nòng Railgun siêu tốc và đèn pha chiếu xa.',
    pros: ['Tốc độ đạn bay +22%, xoay nòng +25%', 'Đèn pha chế độ Đêm chiếu xa hơn +20%'],
    cons: ['Tốc độ đi lùi -22%, băng đạn 7 viên', 'Đạn nảy tường tối đa giảm (10 lần)'],
    stats: {
      ...NEUTRAL_SKIN_STATS,
      forwardSpeedScale: 1.03,
      backwardSpeedScale: 0.78,
      turnSpeedScale: 1.25,
      maxAmmo: 7,
      projectileSpeedScale: 1.22,
      projectileBonusBounces: -4,
      headlightRangeScale: 1.2,
    },
    leavesTreadMarks: true,
    hoverBobAmplitude: 0,
  },

  drawChassis(ctx, palette, treadPhase) {
    // Low-profile precision tracks
    for (const ty of [-15.2, 9.4]) {
      roundRectPath(ctx, -19.5, ty, 37, 5.8, 2.0);
      ctx.fillStyle = '#22272E';
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#90CAF9';
      const offset = (treadPhase * 2.2) % 6.6;
      for (let gx = -22 + offset; gx < 19; gx += 6.6) {
        ctx.fillRect(gx, ty, 1.8, 5.8);
      }
      ctx.restore();

      roundRectPath(ctx, -19.5, ty, 37, 5.8, 2.0);
      ctx.lineWidth = 1.9;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }

    // Swept Stealth Stabilizer Wings
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-16, sign * 10);
      ctx.lineTo(-22, sign * 18.5);
      ctx.lineTo(-8, sign * 16.5);
      ctx.lineTo(8, sign * 10.5);
      ctx.closePath();
      ctx.fillStyle = palette.shadowHex;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }

    // Stealth Diamond-Wedge Hull
    this.drawHullClipPath(ctx);
    const grad = ctx.createLinearGradient(-19, -11, 18, 11);
    grad.addColorStop(0, palette.highlightHex);
    grad.addColorStop(0.5, palette.primaryHex);
    grad.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.save();
    this.drawHullClipPath(ctx);
    ctx.clip();
    ctx.fillStyle = '#102027';
    ctx.fillRect(-16, -5.5, 7, 11);
    ctx.strokeStyle = '#80D8FF';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-13, -7);
    ctx.lineTo(13, -7);
    ctx.moveTo(-13, 7);
    ctx.lineTo(13, 7);
    ctx.stroke();
    ctx.restore();

    this.drawHullClipPath(ctx);
    ctx.lineWidth = 2.1;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  },

  drawHullClipPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-18.5, -7.5);
    ctx.lineTo(-8, -11.5);
    ctx.lineTo(11, -10.5);
    ctx.lineTo(18, -5.5);
    ctx.lineTo(18, 5.5);
    ctx.lineTo(11, 10.5);
    ctx.lineTo(-8, 11.5);
    ctx.lineTo(-18.5, 7.5);
    ctx.closePath();
  },

  drawStandardBarrel(ctx, palette) {
    // Split Electromagnetic Railgun Barrel with glowing plasma channel
    ctx.fillStyle = '#00E5FF';
    ctx.fillRect(4, -1.5, 27, 3.0);

    for (const by of [-4.5, 1.7]) {
      roundRectPath(ctx, 2, by, 29.5, 2.8, 1.1);
      ctx.fillStyle = palette.primaryHex;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(12, -0.7, 17, 1.4);
  },

  drawTurret(ctx, palette) {
    // Angular Diamond Sniper Turret
    ctx.beginPath();
    ctx.moveTo(-10.5, 0);
    ctx.lineTo(-2, -9.5);
    ctx.lineTo(9.5, -5.2);
    ctx.lineTo(11, 0);
    ctx.lineTo(9.5, 5.2);
    ctx.lineTo(-2, 9.5);
    ctx.closePath();
    const g = ctx.createLinearGradient(-10, -9, 10, 9);
    g.addColorStop(0, palette.highlightHex);
    g.addColorStop(0.55, palette.primaryHex);
    g.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.1;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  },

  drawLiveAura({ kinematics, palette, scaleRatio, timeSec, auraGraphics }) {
    const s = scaleRatio;
    const cos = Math.cos(kinematics.angle);
    const sin = Math.sin(kinematics.angle);
    const nx = -sin;
    const ny = cos;

    // Subtle Holographic Rangefinder Laser Tick ahead of muzzle
    const mStart = 28 * s;
    const mEnd = 46 * s;
    auraGraphics.lineStyle(1.3 * s, palette.primary, 0.36);
    auraGraphics.lineBetween(
      kinematics.x + cos * mStart,
      kinematics.y + sin * mStart,
      kinematics.x + cos * mEnd,
      kinematics.y + sin * mEnd,
    );
    const crossX = kinematics.x + cos * mEnd;
    const crossY = kinematics.y + sin * mEnd;
    auraGraphics.lineStyle(1.4 * s, 0x00e5ff, 0.55);
    auraGraphics.lineBetween(
      crossX - nx * 3.5 * s,
      crossY - ny * 3.5 * s,
      crossX + nx * 3.5 * s,
      crossY + ny * 3.5 * s,
    );

    // Wingtip Strobe Beacons
    const blink = Math.sin(timeSec * 8) > 0.2 ? 0.85 : 0.2;
    for (const sign of [-1, 1]) {
      const wx = kinematics.x - cos * 15 * s + nx * sign * 16.5 * s;
      const wy = kinematics.y - sin * 15 * s + ny * sign * 16.5 * s;
      auraGraphics.fillStyle(0x80d8ff, blink);
      auraGraphics.fillCircle(wx, wy, 2.0 * s);
    }
  },
};
