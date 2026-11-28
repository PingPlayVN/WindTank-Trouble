import { NEUTRAL_SKIN_STATS, type TankSkinModule } from '../types';

const OUTLINE = '#18191B';

export const CYBER_OMEGA_SKIN: TankSkinModule = {
  descriptor: {
    id: 'cyber_omega',
    name: 'Chiến Thần Quang Tử',
    shortName: 'Quang Tử',
    rarity: 'legendary',
    rarityLabel: 'HUYỀN THOẠI',
    rarityColor: 0x8e24aa,
    rarityHex: '#8E24AA',
    priceXu: 500000,
    tagline: 'Tuyệt tác công nghệ lượng tử — lõi tinh thể xoay kép và dải lụa ánh sáng Neon rực rỡ.',
    pros: ['Thân gọn -10%, tốc độ xe +10%, đạn bay +12%', 'Hào quang Lượng Tử & dải lụa sáng Neon độc quyền'],
    cons: ['Băng đạn giới hạn 7 viên (đòi hỏi bắn chuẩn)', 'Máu chế độ Giáp -20% (kỹ năng cao)'],
    stats: {
      ...NEUTRAL_SKIN_STATS,
      radiusScale: 0.9,
      forwardSpeedScale: 1.1,
      backwardSpeedScale: 1.1,
      turnSpeedScale: 1.14,
      maxAmmo: 7,
      projectileSpeedScale: 1.12,
      armorHpScale: 0.8,
    },
    leavesTreadMarks: false,
    hoverBobAmplitude: 1.6,
  },

  drawChassis(ctx, palette, treadPhase) {
    // Floating Cyber-Neon Split Wing Blades
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-19, sign * 11);
      ctx.lineTo(-10, sign * 18.5);
      ctx.lineTo(15, sign * 16.5);
      ctx.lineTo(20, sign * 10);
      ctx.lineTo(-14, sign * 8.5);
      ctx.closePath();
      ctx.fillStyle = '#141622';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();

      // Animated Quantum Pulse Strip along wing
      const pulseX = -10 + ((treadPhase * 7) % 21);
      ctx.strokeStyle = palette.highlightHex;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-10, sign * 14.5);
      ctx.lineTo(13, sign * 13.5);
      ctx.stroke();

      ctx.fillStyle = '#00E5FF';
      ctx.beginPath();
      ctx.arc(pulseX, sign * 14, 1.9, 0, Math.PI * 2);
      ctx.fill();
    }

    // Pearlescent + Dynamic Player-Palette Cyber Chassis
    this.drawHullClipPath(ctx);
    const grad = ctx.createLinearGradient(-18, -11, 18, 11);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.28, palette.highlightHex);
    grad.addColorStop(0.68, palette.primaryHex);
    grad.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = grad;
    ctx.fill();

    ctx.save();
    this.drawHullClipPath(ctx);
    ctx.clip();
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(-15, 0);
    ctx.lineTo(15, 0);
    ctx.stroke();
    ctx.restore();

    this.drawHullClipPath(ctx);
    ctx.lineWidth = 2.1;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();
  },

  drawHullClipPath(ctx) {
    ctx.beginPath();
    ctx.moveTo(-18, -5.5);
    ctx.lineTo(-9, -10.5);
    ctx.lineTo(11, -10.5);
    ctx.lineTo(19, -4.5);
    ctx.lineTo(15, 0);
    ctx.lineTo(19, 4.5);
    ctx.lineTo(11, 10.5);
    ctx.lineTo(-9, 10.5);
    ctx.lineTo(-18, 5.5);
    ctx.lineTo(-14, 0);
    ctx.closePath();
  },

  drawStandardBarrel(ctx, palette) {
    // Split Quantum Prism Cannon
    ctx.fillStyle = '#EA80FC';
    ctx.fillRect(5, -1.8, 22, 3.6);

    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(3, sign * 1.8);
      ctx.lineTo(28.5, sign * 4.6);
      ctx.lineTo(24.5, sign * 1.4);
      ctx.closePath();
      ctx.fillStyle = palette.primaryHex;
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = OUTLINE;
      ctx.stroke();
    }

    ctx.beginPath();
    ctx.arc(25.5, 0, 2.7, 0, Math.PI * 2);
    ctx.fillStyle = '#00E5FF';
    ctx.fill();
  },

  drawTurret(ctx, palette) {
    // Futuristic Halo-Core Turret
    ctx.beginPath();
    ctx.arc(0, 0, 9.8, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(-2, -2, 1, 0, 0, 10);
    g.addColorStop(0, '#FFFFFF');
    g.addColorStop(0.5, palette.primaryHex);
    g.addColorStop(1, palette.shadowHex);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 2.1;
    ctx.strokeStyle = OUTLINE;
    ctx.stroke();

    // Glowing Diamond Quantum Crystal in center
    ctx.beginPath();
    ctx.moveTo(0, -4.8);
    ctx.lineTo(4.8, 0);
    ctx.lineTo(0, 4.8);
    ctx.lineTo(-4.8, 0);
    ctx.closePath();
    ctx.fillStyle = '#00E5FF';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = '#18191B';
    ctx.stroke();
  },

  drawLiveAura({
    kinematics,
    palette,
    scaleRatio,
    timeSec,
    auraGraphics,
    overlayGraphics,
    trailHistory,
  }) {
    const s = scaleRatio;
    const pulse = 0.6 + 0.4 * Math.sin(timeSec * 8);

    // 1. Multi-segment Neon Light-Ribbon Trail streaming behind the tank!
    if (trailHistory && trailHistory.length >= 2) {
      for (let i = 0; i < trailHistory.length - 1; i++) {
        const p0 = trailHistory[i];
        const p1 = trailHistory[i + 1];
        const u = 1 - i / trailHistory.length;
        auraGraphics.lineStyle(8.5 * s * u, palette.primary, 0.28 * u);
        auraGraphics.lineBetween(p0.x, p0.y, p1.x, p1.y);
        auraGraphics.lineStyle(3.0 * s * u, 0x00e5ff, 0.55 * u);
        auraGraphics.lineBetween(p0.x, p0.y, p1.x, p1.y);
      }
    }

    // 2. Counter-Rotating Geometric Quantum Hex-Halo under hull
    const haloR = 19.5 * s;
    auraGraphics.lineStyle(1.8 * s, palette.primary, 0.52 * pulse);
    auraGraphics.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = timeSec * 1.9 + (i / 6) * Math.PI * 2;
      const px = kinematics.x + Math.cos(a) * haloR;
      const py = kinematics.y + Math.sin(a) * haloR;
      if (i === 0) auraGraphics.moveTo(px, py);
      else auraGraphics.lineTo(px, py);
    }
    auraGraphics.closePath();
    auraGraphics.strokePath();

    // 3. Three Orbiting Quantum Light Prisms
    for (let i = 0; i < 3; i++) {
      const a = -timeSec * 3.4 + (i * Math.PI * 2) / 3;
      const ox = kinematics.x + Math.cos(a) * (17.2 * s);
      const oy = kinematics.y + Math.sin(a) * (17.2 * s);
      overlayGraphics.fillStyle(i === 0 ? 0x00e5ff : i === 1 ? 0xea80fc : palette.highlight, 0.92);
      overlayGraphics.fillCircle(ox, oy, 2.2 * s);
    }
  },
};
