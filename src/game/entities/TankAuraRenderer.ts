import type Phaser from 'phaser';
import { POWERUP_CONFIG } from '../config/gameplayConfig';
import { getSkillDescriptor } from '../skills/registry';
import { getTankSkinModule } from '../skins/registry';
import type { SkillId, TankColorPalette, TankKinematics, TankSkinId } from '../types/gameTypes';

export interface TankAuraRenderParams {
  kinematics: Readonly<TankKinematics>;
  skinId?: TankSkinId;
  palette?: TankColorPalette;
  trailHistory?: ReadonlyArray<{ x: number; y: number; angle: number }>;
  scaleRatio: number;
  auraPulseClock: number;
  hasArmorBar: boolean;
  hpRatio: number;
  shieldRemainingSec: number;
  phantomRemainingSec: number;
  onIceFloor: boolean;
  chillRatio: number;
  frozenRemainingSec: number;
  empJamRemainingSec: number;
  equippedSkill: SkillId | null;
  isReaperWindingUp: boolean;
  isReaperSweeping: boolean;
  reaperWindupProgress: number | null;
  laserChargeProgress: number | null;
  muzzlePos: { x: number; y: number };
  auraGraphics: Phaser.GameObjects.Graphics;
  overlayGraphics: Phaser.GameObjects.Graphics;
}

export function renderTankAurasAndOverlays(params: TankAuraRenderParams): void {
  const {
    kinematics,
    skinId,
    palette,
    trailHistory,
    scaleRatio,
    auraPulseClock,
    hasArmorBar,
    hpRatio,
    shieldRemainingSec,
    phantomRemainingSec,
    onIceFloor,
    chillRatio,
    frozenRemainingSec,
    empJamRemainingSec,
    equippedSkill,
    isReaperWindingUp,
    isReaperSweeping,
    reaperWindupProgress,
    laserChargeProgress,
    muzzlePos,
    auraGraphics,
    overlayGraphics,
  } = params;

  auraGraphics.clear();
  overlayGraphics.clear();

  // -1. Custom Tank Skin Ambient VFX (Thrusters, Magma Embers, Hover Rings, Quantum Neon Ribbon!)
  if (kinematics.alive && skinId && skinId !== 'classic' && palette) {
    const skinMod = getTankSkinModule(skinId);
    skinMod.drawLiveAura?.({
      kinematics,
      palette,
      scaleRatio,
      timeSec: auraPulseClock,
      auraGraphics,
      overlayGraphics,
      trailHistory,
    });
  }

  // 0. Floating World-Space Armor Durability Bar (`Độ Bền Giáp HP`)
  if (hasArmorBar && kinematics.alive) {
    const bw = 34 * scaleRatio;
    const bh = 5.2 * scaleRatio;
    const bx = kinematics.x - bw / 2;
    const by = kinematics.y - kinematics.radius - 13 * scaleRatio;
    const barColor =
      hpRatio > 0.6
        ? 0x00c853
        : hpRatio > 0.3
          ? 0xffb300
          : Math.floor(auraPulseClock * 12) % 2 === 0
            ? 0xff1744
            : 0xd50000;

    auraGraphics.fillStyle(0x111318, 0.86);
    auraGraphics.fillRoundedRect(bx - 1, by - 1, bw + 2, bh + 2, 2.5);
    if (hpRatio > 0) {
      auraGraphics.fillStyle(barColor, 0.98);
      auraGraphics.fillRoundedRect(bx, by, Math.max(2, bw * hpRatio), bh, 2);
    }
    auraGraphics.lineStyle(1, 0xffffff, 0.35);
    auraGraphics.strokeRoundedRect(bx - 1, by - 1, bw + 2, bh + 2, 2.5);
  }

  // 1. Active 5.5s Hexagonal Aegis Forcefield Dome!
  if (shieldRemainingSec > 0) {
    const shieldR = kinematics.radius * POWERUP_CONFIG.shieldRadiusFactor;
    const blink =
      shieldRemainingSec < 1.1 ? 0.35 + 0.65 * Math.abs(Math.sin(shieldRemainingSec * 22)) : 1;
    const rot = auraPulseClock * 2.4;

    auraGraphics.fillStyle(0x00e5ff, 0.14 * blink);
    auraGraphics.lineStyle(2.6 * scaleRatio, 0x1de9b6, 0.92 * blink);
    auraGraphics.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = rot + (i / 6) * Math.PI * 2;
      const px = kinematics.x + Math.cos(a) * shieldR;
      const py = kinematics.y + Math.sin(a) * shieldR;
      if (i === 0) auraGraphics.moveTo(px, py);
      else auraGraphics.lineTo(px, py);
    }
    auraGraphics.closePath();
    auraGraphics.fillPath();
    auraGraphics.strokePath();
  }

  // 1B. Reaper-Grade Abyssal Wraith Form (`Phantom Phase` — Giant Spectral Scythe-Wings + Long Soul-Flame Comet!)
  if (phantomRemainingSec > 0) {
    const s = scaleRatio;
    const cx = kinematics.x;
    const cy = kinematics.y;
    const rBase = kinematics.radius;
    const ghostR = rBase * (2.15 + Math.sin(auraPulseClock * 9) * 0.14);
    const ratio = Math.max(0, Math.min(1, phantomRemainingSec / POWERUP_CONFIG.phantomDurationSec));

    auraGraphics.fillStyle(0x0b0718, 0.44);
    auraGraphics.fillCircle(cx, cy, rBase * 1.45);
    auraGraphics.lineStyle(4.2 * s, 0x0b0718, 0.88);
    auraGraphics.strokeCircle(cx, cy, ghostR);
    auraGraphics.lineStyle(2.4 * s, 0xe040fb, 0.96);
    auraGraphics.strokeCircle(cx, cy, ghostR);

    const fwdX = Math.cos(kinematics.angle);
    const fwdY = Math.sin(kinematics.angle);
    const sideX = -fwdY;
    const sideY = fwdX;
    const wingFlap = Math.sin(auraPulseClock * 11) * 0.16;

    for (const sign of [-1, 1]) {
      const wSpan = rBase * (2.85 + wingFlap);
      const rootX = cx - fwdX * (rBase * 0.15) + sideX * sign * (rBase * 0.65);
      const rootY = cy - fwdY * (rBase * 0.15) + sideY * sign * (rBase * 0.65);
      const tipX = cx - fwdX * (rBase * 1.35) + sideX * sign * wSpan;
      const tipY = cy - fwdY * (rBase * 1.35) + sideY * sign * wSpan;
      const midX = cx + fwdX * (rBase * 0.35) + sideX * sign * (wSpan * 0.72);
      const midY = cy + fwdY * (rBase * 0.35) + sideY * sign * (wSpan * 0.72);

      auraGraphics.fillStyle(0x0d071c, 0.84);
      auraGraphics.lineStyle(2.2 * s, 0xe040fb, 0.96);
      auraGraphics.beginPath();
      auraGraphics.moveTo(rootX, rootY);
      auraGraphics.lineTo(midX, midY);
      auraGraphics.lineTo(tipX, tipY);
      auraGraphics.closePath();
      auraGraphics.fillPath();
      auraGraphics.strokePath();

      auraGraphics.lineStyle(1.5 * s, 0x80d8ff, 0.9);
      auraGraphics.lineBetween(rootX, rootY, tipX, tipY);
    }

    const backAng = kinematics.angle + Math.PI;
    const perpX = -Math.sin(backAng);
    const perpY = Math.cos(backAng);
    for (const side of [-1, 1]) {
      const tailSegs = 9;
      for (let k = 1; k <= tailSegs; k++) {
        const f0 = (k - 1) / tailSegs;
        const f1 = k / tailSegs;
        const len0 = (12 + f0 * 58) * s;
        const len1 = (12 + f1 * 58) * s;
        const wave0 =
          side * (8 + f0 * 8) * s +
          Math.sin(auraPulseClock * 16 - f0 * 5.6 + side) * (7.5 * f0 * s);
        const wave1 =
          side * (8 + f1 * 8) * s +
          Math.sin(auraPulseClock * 16 - f1 * 5.6 + side) * (7.5 * f1 * s);
        const x0 = cx + Math.cos(backAng) * len0 + perpX * wave0;
        const y0 = cy + Math.sin(backAng) * len0 + perpY * wave0;
        const x1 = cx + Math.cos(backAng) * len1 + perpX * wave1;
        const y1 = cy + Math.sin(backAng) * len1 + perpY * wave1;
        const fade = 1 - f1 * 0.85;
        auraGraphics.lineStyle(8.5 * (1 - f0 * 0.68) * s, 0x0b0718, 0.78 * fade);
        auraGraphics.lineBetween(x0, y0, x1, y1);
        auraGraphics.lineStyle(
          3.6 * (1 - f0 * 0.68) * s,
          side > 0 ? 0xe040fb : 0x00e5ff,
          0.95 * fade,
        );
        auraGraphics.lineBetween(x0, y0, x1, y1);
      }
    }

    auraGraphics.lineStyle(3.4 * s, 0x00e5ff, 0.96);
    auraGraphics.beginPath();
    auraGraphics.arc(
      cx,
      cy,
      ghostR * 1.1,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * ratio,
      false,
    );
    auraGraphics.strokePath();

    for (let w = 0; w < 4; w++) {
      const wa = auraPulseClock * 5.8 + (w * Math.PI) / 2;
      const wx = cx + Math.cos(wa) * (ghostR * 1.12);
      const wy = cy + Math.sin(wa) * (ghostR * 1.12);
      auraGraphics.fillStyle(0x0b0718, 0.92);
      auraGraphics.fillCircle(wx, wy, 4.6 * s);
      auraGraphics.fillStyle(w % 2 === 0 ? 0x00e5ff : 0xe040fb, 0.98);
      auraGraphics.fillCircle(wx, wy, 2.8 * s);
    }
  }

  // 1C. 2x Cryo Slow & Freeze-Exposure Warning Ring + 3D Translucent Faceted Ice Block (`frozenRemainingSec > 0`)!
  if ((onIceFloor || chillRatio > 0.04) && frozenRemainingSec <= 0) {
    const s = scaleRatio;
    const cx = kinematics.x;
    const cy = kinematics.y;
    const ringR = kinematics.radius * 1.48;

    auraGraphics.fillStyle(0x062233, 0.16 + chillRatio * 0.24);
    auraGraphics.fillCircle(cx, cy, ringR * 0.94);
    auraGraphics.lineStyle(3.0 * s, 0x051c2c, 0.72);
    auraGraphics.strokeCircle(cx, cy, ringR);
    auraGraphics.lineStyle(1.8 * s, 0x84ffff, 0.92);
    auraGraphics.strokeCircle(cx, cy, ringR);

    const spikeCount = 6;
    for (let i = 0; i < spikeCount; i++) {
      const a = auraPulseClock * 1.8 + (i / spikeCount) * Math.PI * 2;
      const inner = kinematics.radius * 0.95;
      const outer = inner + (4 + chillRatio * 9) * s;
      auraGraphics.lineStyle(2.8 * s, 0x051c2c, 0.8);
      auraGraphics.lineBetween(
        cx + Math.cos(a) * inner,
        cy + Math.sin(a) * inner,
        cx + Math.cos(a) * outer,
        cy + Math.sin(a) * outer,
      );
      auraGraphics.lineStyle(1.6 * s, 0xe0f7fa, 0.96);
      auraGraphics.lineBetween(
        cx + Math.cos(a) * inner,
        cy + Math.sin(a) * inner,
        cx + Math.cos(a) * outer,
        cy + Math.sin(a) * outer,
      );
    }

    if (chillRatio > 0.03) {
      const urgentColor = chillRatio > 0.68 ? 0xffffff : 0x00e5ff;
      auraGraphics.lineStyle(3.8 * s, urgentColor, 0.98);
      auraGraphics.beginPath();
      auraGraphics.arc(
        cx,
        cy,
        ringR * 1.12,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * chillRatio,
        false,
      );
      auraGraphics.strokePath();
    }
  }

  if (frozenRemainingSec > 0) {
    const s = scaleRatio;
    const cx = kinematics.x;
    const cy = kinematics.y;
    const r = kinematics.radius;
    const thawRatio = Math.max(
      0,
      Math.min(1, frozenRemainingSec / POWERUP_CONFIG.cryoFreezeDurationSec),
    );

    auraGraphics.fillStyle(0x052233, 0.72);
    auraGraphics.lineStyle(2.8 * s, 0x031521, 0.94);
    auraGraphics.beginPath();
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const rad = i % 2 === 0 ? r * 2.28 : r * 1.68;
      const px = cx + Math.cos(a) * rad;
      const py = cy + Math.sin(a) * rad;
      if (i === 0) auraGraphics.moveTo(px, py);
      else auraGraphics.lineTo(px, py);
    }
    auraGraphics.closePath();
    auraGraphics.fillPath();
    auraGraphics.strokePath();

    const hw = r * 1.68;
    const hh = r * 1.52;
    const bev = r * 0.46;
    const dropY = 6.0 * s;

    const buildOctagon = (ox: number, oy: number, wHalf: number, hHalf: number, b: number) => [
      { x: ox - wHalf + b, y: oy - hHalf },
      { x: ox + wHalf - b, y: oy - hHalf },
      { x: ox + wHalf, y: oy - hHalf + b },
      { x: ox + wHalf, y: oy + hHalf - b },
      { x: ox + wHalf - b, y: oy + hHalf },
      { x: ox - wHalf + b, y: oy + hHalf },
      { x: ox - wHalf, y: oy + hHalf - b },
      { x: ox - wHalf, y: oy - hHalf + b },
    ];

    const basePoly = buildOctagon(cx, cy + dropY, hw, hh, bev);
    const topPoly = buildOctagon(cx, cy - 2.5 * s, hw, hh, bev);

    overlayGraphics.fillStyle(0x00838f, 0.44);
    overlayGraphics.lineStyle(3.0 * s, 0x041824, 0.96);
    overlayGraphics.beginPath();
    for (let i = 0; i < basePoly.length; i++) {
      if (i === 0) overlayGraphics.moveTo(basePoly[i].x, basePoly[i].y);
      else overlayGraphics.lineTo(basePoly[i].x, basePoly[i].y);
    }
    overlayGraphics.closePath();
    overlayGraphics.fillPath();
    overlayGraphics.strokePath();

    overlayGraphics.fillStyle(0x4dd0e1, 0.34);
    overlayGraphics.lineStyle(2.8 * s, 0x84ffff, 0.98);
    overlayGraphics.beginPath();
    for (let i = 0; i < topPoly.length; i++) {
      if (i === 0) overlayGraphics.moveTo(topPoly[i].x, topPoly[i].y);
      else overlayGraphics.lineTo(topPoly[i].x, topPoly[i].y);
    }
    overlayGraphics.closePath();
    overlayGraphics.fillPath();
    overlayGraphics.strokePath();

    overlayGraphics.lineStyle(2.0 * s, 0xe0f7fa, 0.92);
    for (const idx of [2, 3, 4, 5, 6]) {
      overlayGraphics.lineBetween(
        topPoly[idx].x,
        topPoly[idx].y,
        basePoly[idx].x,
        basePoly[idx].y,
      );
    }

    const innerPoly = buildOctagon(cx, cy - 2.5 * s, hw * 0.74, hh * 0.74, bev * 0.74);
    overlayGraphics.lineStyle(1.7 * s, 0xffffff, 0.9);
    overlayGraphics.beginPath();
    for (let i = 0; i < innerPoly.length; i++) {
      if (i === 0) overlayGraphics.moveTo(innerPoly[i].x, innerPoly[i].y);
      else overlayGraphics.lineTo(innerPoly[i].x, innerPoly[i].y);
    }
    overlayGraphics.closePath();
    overlayGraphics.strokePath();

    overlayGraphics.lineStyle(2.8 * s, 0xffffff, 0.94);
    overlayGraphics.lineBetween(
      cx - hw * 0.65,
      cy - hh * 0.55,
      cx - hw * 0.1,
      cy - hh * 0.88,
    );
    overlayGraphics.lineBetween(
      cx - hw * 0.78,
      cy + hh * 0.18,
      cx + hw * 0.38,
      cy - hh * 0.82,
    );
    overlayGraphics.lineBetween(
      cx + hw * 0.15,
      cy + hh * 0.65,
      cx + hw * 0.74,
      cy + hh * 0.05,
    );

    overlayGraphics.lineStyle(3.2 * s, 0x00e5ff, 0.96);
    overlayGraphics.beginPath();
    overlayGraphics.arc(
      cx,
      cy,
      r * 2.34,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * thawRatio,
      false,
    );
    overlayGraphics.strokePath();
  }

  // 1D. Reaper-Grade EMP Short-Circuit (`Chập Mạch Đảo Lái & Cướp Cò` — Spinning Inverted-Steering Arrows!)
  if (empJamRemainingSec > 0) {
    const s = scaleRatio;
    const cx = kinematics.x;
    const cy = kinematics.y;
    const jamR = kinematics.radius * 1.72;

    auraGraphics.fillStyle(0x09071a, 0.42);
    auraGraphics.fillCircle(cx, cy, jamR * 0.9);
    auraGraphics.lineStyle(2.6 * s, 0x651fff, 0.92);
    auraGraphics.strokeCircle(cx, cy, jamR);

    for (let k = 0; k < 6; k++) {
      const baseA = auraPulseClock * 24 + (k * Math.PI * 2) / 6;
      const x0 = cx + Math.cos(baseA) * (jamR * 0.52);
      const y0 = cy + Math.sin(baseA) * (jamR * 0.52);
      const xm = cx + Math.cos(baseA + 0.28) * (jamR * 1.22);
      const ym = cy + Math.sin(baseA + 0.28) * (jamR * 1.22);
      const x1 = cx + Math.cos(baseA + 0.54) * (jamR * 0.66);
      const y1 = cy + Math.sin(baseA + 0.54) * (jamR * 0.66);
      overlayGraphics.lineStyle(4.2 * s, 0x09071a, 0.85);
      overlayGraphics.lineBetween(x0, y0, xm, ym);
      overlayGraphics.lineBetween(xm, ym, x1, y1);
      overlayGraphics.lineStyle(2.2 * s, k % 2 === 0 ? 0xffea00 : 0x00e5ff, 0.98);
      overlayGraphics.lineBetween(x0, y0, xm, ym);
      overlayGraphics.lineBetween(xm, ym, x1, y1);
    }

    const iy = cy - kinematics.radius * 1.68;
    const hw = 7.6 * s;
    overlayGraphics.lineStyle(4.8 * s, 0x09071a, 0.95);
    overlayGraphics.lineBetween(cx - hw, iy - 2.2 * s, cx + hw, iy - 2.2 * s);
    overlayGraphics.lineBetween(cx - hw, iy + 2.6 * s, cx + hw, iy + 2.6 * s);

    overlayGraphics.lineStyle(2.5 * s, 0xffea00, 1.0);
    overlayGraphics.lineBetween(cx - hw, iy - 2.2 * s, cx + hw, iy - 2.2 * s);
    overlayGraphics.lineBetween(cx + hw, iy - 2.2 * s, cx + hw - 3.6 * s, iy - 5.2 * s);
    overlayGraphics.lineBetween(cx + hw, iy - 2.2 * s, cx + hw - 3.6 * s, iy + 0.8 * s);

    overlayGraphics.lineStyle(2.5 * s, 0x00e5ff, 1.0);
    overlayGraphics.lineBetween(cx + hw, iy + 2.6 * s, cx - hw, iy + 2.6 * s);
    overlayGraphics.lineBetween(cx - hw, iy + 2.6 * s, cx - hw + 3.6 * s, iy - 0.4 * s);
    overlayGraphics.lineBetween(cx - hw, iy + 2.6 * s, cx - hw + 3.6 * s, iy + 5.6 * s);
  }

  // 2. Equipped Skill Aura + Laser Charge / Reaper Windup Telegraphs
  if (equippedSkill) {
    const desc = getSkillDescriptor(equippedSkill);
    const pulse = 1 + Math.sin(auraPulseClock * 8) * 0.08;
    auraGraphics.lineStyle(
      2.0 * scaleRatio,
      desc.accentColor,
      0.52 + Math.sin(auraPulseClock * 8) * 0.16,
    );
    auraGraphics.strokeCircle(kinematics.x, kinematics.y, kinematics.radius * 1.42 * pulse);

    if (isReaperWindingUp || isReaperSweeping) {
      const s = scaleRatio;
      const cx = kinematics.x;
      const cy = kinematics.y;
      const sigilR =
        reaperWindupProgress !== null
          ? kinematics.radius * (2.65 - reaperWindupProgress * 0.82)
          : kinematics.radius * (1.85 + Math.sin(auraPulseClock * 12) * 0.12);

      auraGraphics.fillStyle(
        0x0b0c10,
        reaperWindupProgress !== null ? 0.48 + reaperWindupProgress * 0.28 : 0.56,
      );
      auraGraphics.fillCircle(cx, cy, sigilR * 0.96);
      auraGraphics.lineStyle(2.8 * s, 0xff1744, 0.95);
      auraGraphics.strokeCircle(cx, cy, sigilR);
      auraGraphics.lineStyle(1.6 * s, 0x111216, 0.9);
      auraGraphics.strokeCircle(cx, cy, sigilR * 0.72);

      const runeRot = auraPulseClock * (reaperWindupProgress !== null ? -5.5 : 3.0);
      for (let r = 0; r < 8; r++) {
        const ra = runeRot + (r / 8) * Math.PI * 2;
        const x0 = cx + Math.cos(ra) * (sigilR * 0.56);
        const y0 = cy + Math.sin(ra) * (sigilR * 0.56);
        const x1 = cx + Math.cos(ra) * (sigilR * 1.14);
        const y1 = cy + Math.sin(ra) * (sigilR * 1.14);
        auraGraphics.lineStyle(2.0 * s, r % 2 === 0 ? 0xff1744 : 0x111216, 0.92);
        auraGraphics.lineBetween(x0, y0, x1, y1);
      }
    }

    if (laserChargeProgress !== null) {
      const s = scaleRatio;
      const outerR = kinematics.radius * (2.28 - laserChargeProgress * 0.56);
      const spinA = auraPulseClock * (3.2 + laserChargeProgress * 7.5);
      auraGraphics.lineStyle(1.8 * s, 0x0091ea, 0.45 + laserChargeProgress * 0.45);
      auraGraphics.strokeCircle(kinematics.x, kinematics.y, outerR);

      for (let n = 0; n < 6; n++) {
        const na = spinA + (n / 6) * Math.PI * 2;
        const nx = kinematics.x + Math.cos(na) * outerR;
        const ny = kinematics.y + Math.sin(na) * outerR;
        auraGraphics.fillStyle(n % 2 === 0 ? 0x00e5ff : 0xffffff, 0.88);
        auraGraphics.fillCircle(nx, ny, (1.8 + laserChargeProgress * 1.4) * s);
      }

      auraGraphics.lineStyle(3.6 * s, 0x00e5ff, 0.96);
      auraGraphics.beginPath();
      auraGraphics.arc(
        kinematics.x,
        kinematics.y,
        kinematics.radius * 1.68,
        -Math.PI / 2,
        -Math.PI / 2 + Math.PI * 2 * laserChargeProgress,
        false,
      );
      auraGraphics.strokePath();

      const guideLen = (88 + laserChargeProgress * 34) * s;
      const coneRad = (POWERUP_CONFIG.laserAutoAimConeDeg * Math.PI) / 180;
      const leftAng = kinematics.angle - coneRad;
      const rightAng = kinematics.angle + coneRad;

      auraGraphics.fillStyle(0x00b0ff, 0.06 + laserChargeProgress * 0.12);
      auraGraphics.beginPath();
      auraGraphics.moveTo(muzzlePos.x, muzzlePos.y);
      auraGraphics.lineTo(
        muzzlePos.x + Math.cos(leftAng) * guideLen,
        muzzlePos.y + Math.sin(leftAng) * guideLen,
      );
      auraGraphics.lineTo(
        muzzlePos.x + Math.cos(rightAng) * guideLen,
        muzzlePos.y + Math.sin(rightAng) * guideLen,
      );
      auraGraphics.closePath();
      auraGraphics.fillPath();

      const sweepAng = kinematics.angle + Math.sin(auraPulseClock * 11) * coneRad;
      auraGraphics.lineStyle(1.4 * s, 0x80d8ff, 0.42 + laserChargeProgress * 0.35);
      auraGraphics.lineBetween(
        muzzlePos.x,
        muzzlePos.y,
        muzzlePos.x + Math.cos(sweepAng) * guideLen,
        muzzlePos.y + Math.sin(sweepAng) * guideLen,
      );

      auraGraphics.lineStyle(1.6 * s, 0x00e5ff, 0.45 + laserChargeProgress * 0.4);
      auraGraphics.lineBetween(
        muzzlePos.x,
        muzzlePos.y,
        muzzlePos.x + Math.cos(kinematics.angle) * (guideLen * 1.1),
        muzzlePos.y + Math.sin(kinematics.angle) * (guideLen * 1.1),
      );
      for (const ca of [leftAng, rightAng]) {
        auraGraphics.lineStyle(1.1 * s, 0x40c4ff, 0.3);
        auraGraphics.lineBetween(
          muzzlePos.x,
          muzzlePos.y,
          muzzlePos.x + Math.cos(ca) * guideLen,
          muzzlePos.y + Math.sin(ca) * guideLen,
        );
      }

      const orbR = (4.2 + laserChargeProgress * 11.5) * s;
      auraGraphics.fillStyle(0x0066ff, 0.28 + laserChargeProgress * 0.36);
      auraGraphics.fillCircle(muzzlePos.x, muzzlePos.y, orbR * 1.85);
      auraGraphics.fillStyle(0x00e5ff, 0.55 + laserChargeProgress * 0.4);
      auraGraphics.fillCircle(muzzlePos.x, muzzlePos.y, orbR * 1.18);
      auraGraphics.fillStyle(0xffffff, 0.96);
      auraGraphics.fillCircle(muzzlePos.x, muzzlePos.y, orbR * 0.55);

      const flareSpan = orbR * (1.5 + Math.sin(auraPulseClock * 26) * 0.35);
      auraGraphics.lineStyle(2.0 * s, 0xffffff, 0.85);
      for (let k = 0; k < 2; k++) {
        const fa = kinematics.angle + (k * Math.PI) / 2 + auraPulseClock * 4;
        auraGraphics.lineBetween(
          muzzlePos.x - Math.cos(fa) * flareSpan,
          muzzlePos.y - Math.sin(fa) * flareSpan,
          muzzlePos.x + Math.cos(fa) * flareSpan,
          muzzlePos.y + Math.sin(fa) * flareSpan,
        );
      }
    }
  }
}
