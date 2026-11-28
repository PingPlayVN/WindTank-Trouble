import { roundRectPath } from '../../art/canvasUtils';
import { NEUTRAL_SKIN_STATS, type TankSkinModule } from '../types';

const OUTLINE = '#18191B';

export const MAGMA_DRAKE_SKIN: TankSkinModule = {
  descriptor: {
    id: 'magma_drake',
    name: 'Thiết Giáp Hỏa Long',
    shortName: 'Hỏa Long',
    rarity: 'epic',
    rarityLabel: 'HỎA LONG',
    rarityColor: 0xe65100,
    rarityHex: '#E65100',
    priceXu: 320000,
    tagline: 'Giáp vảy rồng rực mạch dung nham nóng chảy — đạn xuyên phá mạnh và kháng khống chế.',
    pros: ['Đạn thường gây +20% sát thương Giáp', 'Giảm 25% thời gian bị Đóng Băng & Đảo Phím EMP'],
    cons: ['Thân xe lớn hơn +12%', 'Tốc độ chạy -10%, băng đạn 8 viên'],
    stats: {
      ...NEUTRAL_SKIN_STATS,
      radiusScale: 1.12,
      forwardSpeedScale: 0.9,
      backwardSpeedScale: 0.9,
      maxAmmo: 8,
      standardBulletDamageScale: 1.2,
      armorHpScale: 1.1,
      ccDurationScale: 0.75,
      iceResistRatio: 0.3,
    },
    leavesTreadMarks: true,
    hoverBobAmplitude: 0,
  },

  drawChassis(ctx, palette, treadPhase) {
    // Spiked Obsidian-Lava Treads
    for (const ty of [-16.8, 9.6]) {
      roundRectPath(ctx, -19.5, ty, 39, 7.2, 2.2);
      ctx.fillStyle = '#1A1110';
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = '#FF6D00';
      const offset = (treadPhase * 2.2) % 6.6;
      for (let gx = -22 + offset; gx < 20; gx += 6.6) {
        ctx.fillRect(gx, ty, 2.0, 7.2);
      }
      ctx.restore();

      roundRectPath(ctx, -19.5, ty, 39, 7.2, 2.2);
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }

    // Jagged Dragon-Scale Hull painted in dynamic Player Palette
    this.drawHullClipPath(ctx);
    const grad = ctx.createLinearGradient(-18, -12, 18, 12);
    grad.addColorStop(0, palette.highlightHex);
    grad.addColorStop(0.45, palette.primaryHex);
    grad.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = grad;
    ctx.fill();

    // Glowing Molten Magma Veins inside hull fissures
    ctx.save();
    this.drawHullClipPath(ctx);
    ctx.clip();
    ctx.strokeStyle = '#FF6D00';
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.moveTo(-16, -8);
    ctx.lineTo(-4, -2);
    ctx.lineTo(12, -7);
    ctx.moveTo(-15, 8);
    ctx.lineTo(-2, 3);
    ctx.lineTo(13, 7);
    ctx.stroke();

    ctx.strokeStyle = '#FFEA00';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();

    this.drawHullClipPath(ctx);
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  },

  drawHullClipPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-18.5, -10.5);
    ctx.lineTo(-4, -13);
    ctx.lineTo(13, -11.5);
    ctx.lineTo(19.5, -5.5);
    ctx.lineTo(16.5, 0);
    ctx.lineTo(19.5, 5.5);
    ctx.lineTo(13, 11.5);
    ctx.lineTo(-4, 13);
    ctx.lineTo(-18.5, 10.5);
    ctx.lineTo(-15, 0);
    ctx.closePath();
  },

  drawStandardBarrel(ctx, palette) {
    // Dragon-Maw Flanged Cannon with glowing magma throat
    roundRectPath(ctx, 2, -4.4, 23, 8.8, 2.0);
    ctx.fillStyle = palette.primaryHex;
    ctx.fill();
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    ctx.fillStyle = '#FF9100';
    ctx.fillRect(6, -1.6, 17, 3.2);

    // Flared Dragon Fang Muzzle
    ctx.beginPath();
    ctx.moveTo(21, -6.2);
    ctx.lineTo(29, -4.0);
    ctx.lineTo(26.5, 0);
    ctx.lineTo(29, 4.0);
    ctx.lineTo(21, 6.2);
    ctx.closePath();
    ctx.fillStyle = '#263238';
    ctx.fill();
    ctx.stroke();
  },

  drawTurret(ctx, palette) {
    // Swept-back Dragon Horns
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-2, sign * 6.5);
      ctx.lineTo(-14.5, sign * 12.5);
      ctx.lineTo(-7, sign * 3.5);
      ctx.closePath();
      ctx.fillStyle = '#FFD54F';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(0, 0, 10.2, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-2, -2, 1.5, 0, 0, 10.5);
    g.addColorStop(0, palette.highlightHex);
    g.addColorStop(0.6, palette.primaryHex);
    g.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  },

  drawLiveAura({ kinematics, palette, scaleRatio, timeSec, auraGraphics, overlayGraphics }) {
    const s = scaleRatio;
    const pulse = 0.55 + 0.45 * Math.sin(timeSec * 7.5);

    // Volcanic heat glow under chassis
    auraGraphics.fillStyle(0xff6d00, 0.14 * pulse);
    auraGraphics.fillCircle(kinematics.x, kinematics.y, 19.5 * s);
    auraGraphics.lineStyle(1.6 * s, palette.primary, 0.4 * pulse);
    auraGraphics.strokeCircle(kinematics.x, kinematics.y, 17.5 * s);

    // 5 Orbiting / Rising Molten Ember Sparks
    for (let i = 0; i < 5; i++) {
      const phase = (timeSec * 1.35 + i * 0.2) % 1;
      const ang = timeSec * 2.2 + i * ((Math.PI * 2) / 5);
      const dist = (11 + phase * 11) * s;
      const ex = kinematics.x + Math.cos(ang) * dist;
      const ey = kinematics.y + Math.sin(ang) * dist - phase * 4 * s;
      const col = i % 2 === 0 ? 0xffea00 : 0xff3d00;
      overlayGraphics.fillStyle(col, (1 - phase) * 0.9);
      overlayGraphics.fillCircle(ex, ey, (2.2 - phase * 1.1) * s);
    }
  },
};
