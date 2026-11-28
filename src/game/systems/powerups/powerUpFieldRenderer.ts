import { POWERUP_CONFIG } from '../../config/gameplayConfig';
import { previewEnergyBarrierEdge } from '../../skills/items/barrierSkill';
import { computeReaperBlades } from '../../skills/items/reaperSkill';
import type { PowerUpFieldRenderContext } from './powerUpTypes';

export function renderPowerUpFieldVisuals(ctx: PowerUpFieldRenderContext): void {
  const {
    dt,
    animClock,
    arena,
    tanks,
    crates,
    spikeZones,
    mines,
    cryoZones,
    barriers,
    warpBeacons,
    activeEmpCataclysms,
    activeWarpCataclysms,
    huntedTargetIndices,
    zoneGraphics,
    barrierGraphics,
    holoGraphics,
    reticleGraphics,
    reaperShadowGraphics,
    reaperGraphics,
  } = ctx;

  const scale = arena.scaleRatio;

  for (const entry of crates) {
    const bob = Math.sin(animClock * 4.2 + entry.state.id) * 2.2 * scale;
    entry.sprite.setY(entry.state.y + bob);
    entry.ring.setScale(1 + Math.sin(animClock * 5 + entry.state.id) * 0.1);
  }

  for (const z of spikeZones) {
    const rem = z.state.duration - z.state.age;
    if (rem < 1.0) {
      const alpha = 0.3 + 0.7 * Math.abs(Math.sin(rem * 20));
      z.warningRing.setAlpha(alpha * 0.6);
      for (const sp of z.sprites) sp.setAlpha(alpha);
    }
  }

  // Update Stealth Proximity Mine visibility (blinks during 1.6s arming, then cloaks!)
  for (const m of mines) {
    if (m.state.age < m.state.armingSec) {
      const blink = Math.sin(m.state.age * 24) > 0;
      m.sprite.setAlpha(blink ? 1 : 0.45);
      m.armRing.setVisible(true).setAlpha(blink ? 0.65 : 0.2);
    } else {
      m.armRing.setVisible(false);
      const phase = (m.state.age - m.state.armingSec) % 3.2;
      const glint = phase < 0.16 ? 0.32 : 0.04;
      m.sprite.setAlpha(glint);
    }
  }

  zoneGraphics.clear();
  holoGraphics.clear();
  reaperShadowGraphics.clear();
  reaperGraphics.clear();

  // A. Live High-Voltage Tesla Zap Range Ring (`1.5` cells) around any tank holding `emp`!
  for (const t of tanks) {
    if (!t.kinematics.alive || t.getEquippedSkill() !== 'emp') continue;
    const zapR = arena.cellSize * POWERUP_CONFIG.empZapCellsRadius;
    const pulse = 0.72 + 0.28 * Math.sin(animClock * 12);
    zoneGraphics.lineStyle(2.0 * scale, 0x0c091e, 0.34 * pulse);
    zoneGraphics.strokeCircle(t.kinematics.x, t.kinematics.y, zapR);
    const segs = 16;
    for (let sIdx = 0; sIdx < segs; sIdx += 2) {
      const a0 = animClock * 1.8 + (sIdx / segs) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2) / (segs * 1.65);
      zoneGraphics.lineStyle(
        2.0 * scale,
        sIdx % 4 === 0 ? 0xffea00 : 0x651fff,
        0.74 * pulse,
      );
      zoneGraphics.beginPath();
      zoneGraphics.arc(t.kinematics.x, t.kinematics.y, zapR, a0, a1, false);
      zoneGraphics.strokePath();
    }
  }

  // B. Deep Midnight-Sapphire Glacial Cathedral (`cryoZones`)
  for (const cz of cryoZones) {
    const rem = cz.state.duration - cz.state.age;
    const fade = rem < 1.0 ? Math.max(0.1, rem) : 1;
    const cx = cz.state.x;
    const cy = cz.state.y;
    const r = cz.state.radius;
    cz.disc.setAlpha((0.54 + 0.06 * Math.sin(animClock * 5 + cz.state.id)) * fade);

    zoneGraphics.fillStyle(0x00838f, 0.42 * fade);
    zoneGraphics.lineStyle(2.8 * scale, 0x00e5ff, 0.92 * fade);
    zoneGraphics.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + cz.state.id * 0.3;
      const jr = r * (i % 2 === 0 ? 1.03 : 0.91);
      const px = cx + Math.cos(a) * jr;
      const py = cy + Math.sin(a) * jr;
      if (i === 0) zoneGraphics.moveTo(px, py);
      else zoneGraphics.lineTo(px, py);
    }
    zoneGraphics.closePath();
    zoneGraphics.fillPath();
    zoneGraphics.strokePath();

    const slowRot = animClock * 0.55 + cz.state.id;
    for (let i = 0; i < 6; i++) {
      const a = slowRot + (i * Math.PI) / 3;
      const ux = Math.cos(a);
      const uy = Math.sin(a);
      const nx = -uy;
      const ny = ux;
      const tipR = r * 0.88;
      const midR = r * 0.48;
      const wingW = r * 0.13;

      zoneGraphics.fillStyle(0x84ffff, 0.72 * fade);
      zoneGraphics.lineStyle(1.8 * scale, 0x041824, 0.9 * fade);
      zoneGraphics.beginPath();
      zoneGraphics.moveTo(cx, cy);
      zoneGraphics.lineTo(cx + ux * midR + nx * wingW, cy + uy * midR + ny * wingW);
      zoneGraphics.lineTo(cx + ux * tipR, cy + uy * tipR);
      zoneGraphics.lineTo(cx + ux * midR - nx * wingW, cy + uy * midR - ny * wingW);
      zoneGraphics.closePath();
      zoneGraphics.fillPath();
      zoneGraphics.strokePath();

      zoneGraphics.lineStyle(2.0 * scale, 0xffffff, 0.94 * fade);
      zoneGraphics.lineBetween(cx, cy, cx + ux * tipR, cy + uy * tipR);
      const bx = cx + ux * (r * 0.58);
      const by = cy + uy * (r * 0.58);
      for (const side of [-0.58, 0.58]) {
        zoneGraphics.lineBetween(
          bx,
          by,
          bx + Math.cos(a + side) * (r * 0.24),
          by + Math.sin(a + side) * (r * 0.24),
        );
      }
    }

    zoneGraphics.fillStyle(0x041824, 0.92 * fade);
    zoneGraphics.fillCircle(cx, cy, 7.5 * scale);
    zoneGraphics.fillStyle(0xffffff, 0.96 * fade);
    zoneGraphics.fillCircle(cx, cy, 4.2 * scale);
  }

  // C. Chrono-Abyssal Stargate (`warpBeacons`)
  for (const wb of warpBeacons) {
    wb.sprite.rotation += dt * 2.8;
    const rem = wb.state.maxDuration - wb.state.age;
    const ratio = Math.max(0, Math.min(1, rem / wb.state.maxDuration));
    const blink = rem < 2.0 ? 0.4 + 0.6 * Math.abs(Math.sin(rem * 16)) : 1;
    const bx = wb.state.x;
    const by = wb.state.y;
    wb.sprite.setAlpha(blink);
    wb.ring.setVisible(false);

    const gateR = 25 * scale;
    zoneGraphics.fillStyle(0x070412, 0.88 * blink);
    zoneGraphics.fillCircle(bx, by, gateR);
    zoneGraphics.lineStyle(3.2 * scale, 0xe040fb, 0.95 * blink);
    zoneGraphics.strokeCircle(bx, by, gateR);

    zoneGraphics.lineStyle(3.0 * scale, 0x00e5ff, 0.95 * blink);
    zoneGraphics.beginPath();
    zoneGraphics.arc(
      bx,
      by,
      gateR * 1.16,
      -Math.PI / 2,
      -Math.PI / 2 + Math.PI * 2 * ratio,
      false,
    );
    zoneGraphics.strokePath();

    for (const [dir, col] of [
      [1, 0xe040fb],
      [-1.35, 0x00e5ff],
    ] as const) {
      const rot = animClock * 2.5 * dir + wb.state.id;
      zoneGraphics.lineStyle(1.9 * scale, col, 0.88 * blink);
      zoneGraphics.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = rot + (k * Math.PI) / 2;
        const px = bx + Math.cos(a) * (gateR * 0.84);
        const py = by + Math.sin(a) * (gateR * 0.84);
        if (k === 0) zoneGraphics.moveTo(px, py);
        else zoneGraphics.lineTo(px, py);
      }
      zoneGraphics.closePath();
      zoneGraphics.strokePath();
    }

    for (let m = 0; m < 4; m++) {
      const ma = animClock * 5.2 + (m * Math.PI) / 2;
      const mx = bx + Math.cos(ma) * (gateR * 1.24);
      const my = by + Math.sin(ma) * (gateR * 1.24);
      zoneGraphics.fillStyle(0x070412, 0.95 * blink);
      zoneGraphics.fillCircle(mx, my, 4.0 * scale);
      zoneGraphics.fillStyle(m % 2 === 0 ? 0x00e5ff : 0xe040fb, 0.98 * blink);
      zoneGraphics.fillCircle(mx, my, 2.4 * scale);
    }

    const owner = tanks.find((t) => t.index === wb.state.ownerIndex && t.kinematics.alive);
    if (owner && owner.isWarpBeaconPlaced()) {
      const dx = owner.kinematics.x - bx;
      const dy = owner.kinematics.y - by;
      const dist = Math.hypot(dx, dy);
      if (dist > 28 * scale) {
        const dots = Math.min(16, Math.max(4, Math.floor(dist / (30 * scale))));
        const phaseShift = (animClock * 2.4) % 1;
        for (let d = 0; d < dots; d++) {
          const u = 1 - (d + phaseShift) / dots;
          const px = bx + dx * u;
          const py = by + dy * u;
          zoneGraphics.fillStyle(0x090614, 0.65 * blink);
          zoneGraphics.fillCircle(px, py, 3.2 * scale);
          zoneGraphics.fillStyle(d % 2 === 0 ? 0xe040fb : 0x00e5ff, 0.92 * blink);
          zoneGraphics.fillCircle(px, py, 1.9 * scale);
        }
      }
    }
  }

  // D. High-Contrast Tactical Laser Blueprint when holding `barrier`!
  for (const tank of tanks) {
    if (!tank.kinematics.alive || tank.getEquippedSkill() !== 'barrier') continue;
    const preview = previewEnergyBarrierEdge(tank.kinematics, arena);
    if (!preview) continue;
    const pulse = 0.65 + 0.35 * Math.sin(animClock * 10);
    zoneGraphics.lineStyle(9 * scale, 0x071f14, 0.48 * pulse);
    zoneGraphics.lineBetween(preview.x0, preview.y0, preview.x1, preview.y1);

    const segs = 7;
    for (let sIdx = 0; sIdx < segs; sIdx += 2) {
      const f0 = sIdx / segs;
      const f1 = Math.min(1, (sIdx + 1) / segs);
      zoneGraphics.lineStyle(3.4 * scale, 0x00e676, 0.92 * pulse);
      zoneGraphics.lineBetween(
        preview.x0 + (preview.x1 - preview.x0) * f0,
        preview.y0 + (preview.y1 - preview.y0) * f0,
        preview.x0 + (preview.x1 - preview.x0) * f1,
        preview.y0 + (preview.y1 - preview.y0) * f1,
      );
    }
    for (const [px, py] of [
      [preview.x0, preview.y0],
      [preview.x1, preview.y1],
    ]) {
      zoneGraphics.fillStyle(0x071f14, 0.9 * pulse);
      zoneGraphics.fillCircle(px, py, 5.2 * scale);
      zoneGraphics.fillStyle(0x69f0ae, 0.96 * pulse);
      zoneGraphics.fillCircle(px, py, 2.8 * scale);
    }
  }

  // E. Titan Hard-Light Plasma Bastion (`barriers`)
  barrierGraphics.clear();
  for (const b of barriers) {
    const rem = b.duration - b.age;
    const blink = rem < 1.5 ? 0.4 + 0.6 * Math.abs(Math.sin(rem * 18)) : 1;
    const dx = b.x1 - b.x0;
    const dy = b.y1 - b.y0;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;

    barrierGraphics.lineStyle(16.5 * scale, 0x061b11, 0.88 * blink);
    barrierGraphics.lineBetween(b.x0, b.y0, b.x1, b.y1);
    barrierGraphics.lineStyle(9.5 * scale, 0x00c853, 0.95 * blink);
    barrierGraphics.lineBetween(b.x0, b.y0, b.x1, b.y1);
    barrierGraphics.lineStyle(3.6 * scale, 0xffffff, 0.98 * blink);
    barrierGraphics.lineBetween(b.x0, b.y0, b.x1, b.y1);

    reaperGraphics.lineStyle(20 * scale, 0x00e676, 0.34 * blink);
    reaperGraphics.lineBetween(b.x0, b.y0, b.x1, b.y1);

    reaperGraphics.lineStyle(2.2 * scale, 0x84ffff, 0.95 * blink);
    reaperGraphics.beginPath();
    const arcSteps = 8;
    for (let k = 0; k <= arcSteps; k++) {
      const f = k / arcSteps;
      const jit = k > 0 && k < arcSteps ? (Math.random() - 0.5) * 11 * scale : 0;
      const px = b.x0 + dx * f + nx * jit;
      const py = b.y0 + dy * f + ny * jit;
      if (k === 0) reaperGraphics.moveTo(px, py);
      else reaperGraphics.lineTo(px, py);
    }
    reaperGraphics.strokePath();

    const scroll = (animClock * 1.8) % 1;
    for (let k = 0; k < 5; k++) {
      const f = (k / 5 + scroll) % 1;
      const px = b.x0 + dx * f;
      const py = b.y0 + dy * f;
      const rib = 8.2 * scale;
      barrierGraphics.lineStyle(3.2 * scale, 0x061b11, 0.85 * blink);
      barrierGraphics.lineBetween(px - nx * rib, py - ny * rib, px + nx * rib, py + ny * rib);
      barrierGraphics.lineStyle(1.8 * scale, 0x69f0ae, 0.98 * blink);
      barrierGraphics.lineBetween(px - nx * rib, py - ny * rib, px + nx * rib, py + ny * rib);
    }

    for (const [px, py] of [
      [b.x0, b.y0],
      [b.x1, b.y1],
    ]) {
      barrierGraphics.fillStyle(0x061b11, 0.98 * blink);
      barrierGraphics.fillCircle(px, py, 9.2 * scale);
      barrierGraphics.lineStyle(2.4 * scale, 0x00e676, 0.98 * blink);
      barrierGraphics.strokeCircle(px, py, 9.2 * scale);
      barrierGraphics.fillStyle(0xffffff, 0.98 * blink);
      barrierGraphics.fillCircle(px, py, 3.6 * scale);
    }
  }

  // F. Reaper-Class 60-FPS Frame-Animated EMP Thunder-God Array
  for (let i = activeEmpCataclysms.length - 1; i >= 0; i--) {
    const emp = activeEmpCataclysms[i];
    emp.age += dt;
    if (emp.age >= emp.duration) {
      activeEmpCataclysms.splice(i, 1);
      continue;
    }
    const p = emp.age / emp.duration;
    const expand = p < 0.16 ? 1 - Math.pow(1 - p / 0.16, 3) : 1.0;
    const fade = p > 0.62 ? Math.max(0, 1 - (p - 0.62) / 0.38) : 1.0;
    const r = emp.radius * expand;

    reaperShadowGraphics.fillStyle(0x080618, 0.16 * fade);
    reaperShadowGraphics.fillCircle(emp.x, emp.y, r);
    reaperShadowGraphics.lineStyle(9.5 * scale, 0x080618, 0.92 * fade);
    reaperShadowGraphics.strokeCircle(emp.x, emp.y, r);
    reaperShadowGraphics.lineStyle(5.5 * scale, 0x080618, 0.85 * fade);
    reaperShadowGraphics.strokeCircle(emp.x, emp.y, r * 0.64);

    const runeSpin = emp.age * 3.6;
    for (const starOffset of [0, Math.PI / 3]) {
      reaperShadowGraphics.lineStyle(4.8 * scale, 0x080618, 0.78 * fade);
      reaperShadowGraphics.beginPath();
      for (let v = 0; v < 3; v++) {
        const va = runeSpin + starOffset + (v * Math.PI * 2) / 3;
        const vx = emp.x + Math.cos(va) * (r * 0.88);
        const vy = emp.y + Math.sin(va) * (r * 0.88);
        if (v === 0) reaperShadowGraphics.moveTo(vx, vy);
        else reaperShadowGraphics.lineTo(vx, vy);
      }
      reaperShadowGraphics.closePath();
      reaperShadowGraphics.strokePath();

      reaperGraphics.lineStyle(2.4 * scale, starOffset === 0 ? 0x651fff : 0x00e5ff, 0.92 * fade);
      reaperGraphics.beginPath();
      for (let v = 0; v < 3; v++) {
        const va = runeSpin + starOffset + (v * Math.PI * 2) / 3;
        const vx = emp.x + Math.cos(va) * (r * 0.88);
        const vy = emp.y + Math.sin(va) * (r * 0.88);
        if (v === 0) reaperGraphics.moveTo(vx, vy);
        else reaperGraphics.lineTo(vx, vy);
      }
      reaperGraphics.closePath();
      reaperGraphics.strokePath();
    }

    reaperGraphics.lineStyle(10 * scale, 0x651fff, 0.65 * fade);
    reaperGraphics.strokeCircle(emp.x, emp.y, r);
    reaperGraphics.lineStyle(3.6 * scale, 0x00e5ff, 0.98 * fade);
    reaperGraphics.strokeCircle(emp.x, emp.y, r);
    reaperGraphics.lineStyle(2.4 * scale, 0xffea00, 0.9 * fade);
    reaperGraphics.strokeCircle(emp.x, emp.y, r * 0.64);

    for (let k = 0; k < 16; k++) {
      const a = -runeSpin * 1.4 + (k / 16) * Math.PI * 2;
      reaperGraphics.lineStyle(2.8 * scale, k % 2 === 0 ? 0x00e5ff : 0xffea00, 0.96 * fade);
      reaperGraphics.lineBetween(
        emp.x + Math.cos(a) * (r * 0.88),
        emp.y + Math.sin(a) * (r * 0.88),
        emp.x + Math.cos(a) * (r * 1.05),
        emp.y + Math.sin(a) * (r * 1.05),
      );
    }

    const bolts = 10;
    for (let b = 0; b < bolts; b++) {
      const baseA = -runeSpin * 0.5 + (b / bolts) * Math.PI * 2;
      const pts: Array<{ x: number; y: number }> = [{ x: emp.x, y: emp.y }];
      const segs = 5;
      for (let sIdx = 1; sIdx <= segs; sIdx++) {
        const f = sIdx / segs;
        const jit = sIdx < segs ? (Math.random() - 0.5) * 0.36 : 0;
        pts.push({
          x: emp.x + Math.cos(baseA + jit) * (r * f),
          y: emp.y + Math.sin(baseA + jit) * (r * f),
        });
      }

      reaperShadowGraphics.lineStyle(8.5 * scale, 0x080618, 0.88 * fade);
      reaperShadowGraphics.beginPath();
      for (let sIdx = 0; sIdx < pts.length; sIdx++) {
        if (sIdx === 0) reaperShadowGraphics.moveTo(pts[sIdx].x, pts[sIdx].y);
        else reaperShadowGraphics.lineTo(pts[sIdx].x, pts[sIdx].y);
      }
      reaperShadowGraphics.strokePath();

      reaperGraphics.lineStyle(
        (b % 2 === 0 ? 4.4 : 3.0) * scale,
        b % 3 === 0 ? 0xffea00 : 0x00e5ff,
        0.98 * fade,
      );
      reaperGraphics.beginPath();
      for (let sIdx = 0; sIdx < pts.length; sIdx++) {
        if (sIdx === 0) reaperGraphics.moveTo(pts[sIdx].x, pts[sIdx].y);
        else reaperGraphics.lineTo(pts[sIdx].x, pts[sIdx].y);
      }
      reaperGraphics.strokePath();
    }

    for (const tgt of emp.arcTargets) {
      const tdx = tgt.x - emp.x;
      const tdy = tgt.y - emp.y;
      const tLen = Math.hypot(tdx, tdy) || 1;
      const tnx = -tdy / tLen;
      const tny = tdx / tLen;
      const arcPts: Array<{ x: number; y: number }> = [{ x: emp.x, y: emp.y }];
      const aSteps = 7;
      for (let sIdx = 1; sIdx < aSteps; sIdx++) {
        const f = sIdx / aSteps;
        const jit = (Math.random() - 0.5) * (tgt.lethal ? 22 : 14) * scale;
        arcPts.push({
          x: emp.x + tdx * f + tnx * jit,
          y: emp.y + tdy * f + tny * jit,
        });
      }
      arcPts.push({ x: tgt.x, y: tgt.y });

      reaperShadowGraphics.lineStyle((tgt.lethal ? 13 : 8.5) * scale, 0x080618, 0.94 * fade);
      reaperShadowGraphics.beginPath();
      for (let sIdx = 0; sIdx < arcPts.length; sIdx++) {
        if (sIdx === 0) reaperShadowGraphics.moveTo(arcPts[sIdx].x, arcPts[sIdx].y);
        else reaperShadowGraphics.lineTo(arcPts[sIdx].x, arcPts[sIdx].y);
      }
      reaperShadowGraphics.strokePath();

      reaperGraphics.lineStyle(
        (tgt.lethal ? 6.8 : 4.2) * scale,
        tgt.lethal ? 0xffea00 : 0x00e5ff,
        1.0 * fade,
      );
      reaperGraphics.beginPath();
      for (let sIdx = 0; sIdx < arcPts.length; sIdx++) {
        if (sIdx === 0) reaperGraphics.moveTo(arcPts[sIdx].x, arcPts[sIdx].y);
        else reaperGraphics.lineTo(arcPts[sIdx].x, arcPts[sIdx].y);
      }
      reaperGraphics.strokePath();

      if (tgt.lethal) {
        reaperGraphics.lineStyle(2.6 * scale, 0xffffff, 1.0 * fade);
        reaperGraphics.beginPath();
        for (let sIdx = 0; sIdx < arcPts.length; sIdx++) {
          if (sIdx === 0) reaperGraphics.moveTo(arcPts[sIdx].x, arcPts[sIdx].y);
          else reaperGraphics.lineTo(arcPts[sIdx].x, arcPts[sIdx].y);
        }
        reaperGraphics.strokePath();
      }
    }

    reaperShadowGraphics.fillStyle(0x080618, 0.96 * fade);
    reaperShadowGraphics.fillCircle(emp.x, emp.y, 18 * scale);
    reaperGraphics.fillStyle(0x651fff, 0.85 * fade);
    reaperGraphics.fillCircle(emp.x, emp.y, 15 * scale);
    reaperGraphics.fillStyle(0x00e5ff, 0.95 * fade);
    reaperGraphics.fillCircle(emp.x, emp.y, 10 * scale);
    reaperGraphics.fillStyle(0xffffff, 1.0 * fade);
    reaperGraphics.fillCircle(emp.x, emp.y, 5 * scale);
  }

  // G. Reaper-Class 60-FPS Frame-Animated Dimensional Cleave & Dual-End Rift Explosions (`activeWarpCataclysms`)!
  for (let i = activeWarpCataclysms.length - 1; i >= 0; i--) {
    const wp = activeWarpCataclysms[i];
    wp.age += dt;
    if (wp.age >= wp.duration) {
      activeWarpCataclysms.splice(i, 1);
      continue;
    }
    const p = wp.age / wp.duration;
    const expand = p < 0.18 ? 1 - Math.pow(1 - p / 0.18, 3) : 1.0;
    const fade = p > 0.58 ? Math.max(0, 1 - (p - 0.58) / 0.42) : 1.0;
    const r = wp.blastRadius * expand;

    const beamFade = Math.max(0, 1 - p * 1.08);
    if (beamFade > 0.02) {
      reaperShadowGraphics.lineStyle(22 * scale * beamFade, 0x070412, 0.9 * beamFade);
      reaperShadowGraphics.lineBetween(wp.fromX, wp.fromY, wp.toX, wp.toY);
      reaperShadowGraphics.lineStyle(8 * scale * beamFade, 0xd500f9, 0.95 * beamFade);
      reaperShadowGraphics.lineBetween(wp.fromX, wp.fromY, wp.toX, wp.toY);
      reaperGraphics.lineStyle(14 * scale * beamFade, 0xe040fb, 0.78 * beamFade);
      reaperGraphics.lineBetween(wp.fromX, wp.fromY, wp.toX, wp.toY);
      reaperGraphics.lineStyle(4.2 * scale * beamFade, 0x00e5ff, 0.98 * beamFade);
      reaperGraphics.lineBetween(wp.fromX, wp.fromY, wp.toX, wp.toY);

      const bdx = wp.toX - wp.fromX;
      const bdy = wp.toY - wp.fromY;
      const bLen = Math.hypot(bdx, bdy) || 1;
      const bnx = -bdy / bLen;
      const bny = bdx / bLen;
      reaperGraphics.lineStyle(2.6 * scale, 0xffffff, 0.98 * beamFade);
      reaperGraphics.beginPath();
      const lSteps = 12;
      for (let k = 0; k <= lSteps; k++) {
        const f = k / lSteps;
        const jit = k > 0 && k < lSteps ? (Math.random() - 0.5) * 16 * scale : 0;
        const lx = wp.fromX + bdx * f + bnx * jit;
        const ly = wp.fromY + bdy * f + bny * jit;
        if (k === 0) reaperGraphics.moveTo(lx, ly);
        else reaperGraphics.lineTo(lx, ly);
      }
      reaperGraphics.strokePath();
    }

    for (const [bx, by, spinSign] of [
      [wp.fromX, wp.fromY, -1],
      [wp.toX, wp.toY, 1],
    ] as const) {
      reaperShadowGraphics.fillStyle(0x06030f, 0.56 * fade);
      reaperShadowGraphics.fillCircle(bx, by, r * 0.82);
      reaperShadowGraphics.lineStyle(8.0 * scale, 0x090516, 0.95 * fade);
      reaperShadowGraphics.strokeCircle(bx, by, r);

      reaperGraphics.lineStyle(9.0 * scale, 0xe040fb, 0.95 * fade);
      reaperGraphics.strokeCircle(bx, by, r);
      reaperGraphics.lineStyle(3.5 * scale, 0xffea00, 0.98 * fade);
      reaperGraphics.strokeCircle(bx, by, r * 0.74);

      const swirl = wp.age * 10.5 * spinSign;
      for (let arm = 0; arm < 4; arm++) {
        const a0 = swirl + (arm * Math.PI) / 2;
        reaperShadowGraphics.lineStyle(7.5 * scale, 0x070412, 0.85 * fade);
        reaperShadowGraphics.beginPath();
        for (let sIdx = 0; sIdx <= 8; sIdx++) {
          const f = sIdx / 8;
          const a = a0 + f * 1.45 * spinSign;
          const rad = r * (0.18 + f * 0.96);
          const px = bx + Math.cos(a) * rad;
          const py = by + Math.sin(a) * rad;
          if (sIdx === 0) reaperShadowGraphics.moveTo(px, py);
          else reaperShadowGraphics.lineTo(px, py);
        }
        reaperShadowGraphics.strokePath();

        reaperGraphics.lineStyle(4.2 * scale, arm % 2 === 0 ? 0xe040fb : 0x00e5ff, 0.98 * fade);
        reaperGraphics.beginPath();
        for (let sIdx = 0; sIdx <= 8; sIdx++) {
          const f = sIdx / 8;
          const a = a0 + f * 1.45 * spinSign;
          const rad = r * (0.18 + f * 0.96);
          const px = bx + Math.cos(a) * rad;
          const py = by + Math.sin(a) * rad;
          if (sIdx === 0) reaperGraphics.moveTo(px, py);
          else reaperGraphics.lineTo(px, py);
        }
        reaperGraphics.strokePath();
      }
    }
  }

  // H. Draw Twin Giant Obsidian-Black & Blood-Crimson Crescent Scythes + Shadow Afterimages!
  for (const tank of tanks) {
    if (!tank.kinematics.alive || !tank.isReaperSweeping()) continue;
    const extend = tank.getReaperExtendProgress();
    if (extend <= 0.01) continue;
    const crescentExtend = tank.getReaperCrescentProgress();
    const bladeLen = arena.cellSize * POWERUP_CONFIG.reaperBladeCellsLength * extend;
    const cx = tank.kinematics.x;
    const cy = tank.kinematics.y;

    const drawScytheAtAngle = (ang: number, alphaMul: number, isPrimary: boolean) => {
      const sweep = computeReaperBlades(
        cx,
        cy,
        ang,
        tank.index,
        bladeLen,
        [],
        scale,
        crescentExtend,
      );
      const x0 = sweep.bladeB.x1;
      const y0 = sweep.bladeB.y1;
      const x1 = sweep.bladeA.x1;
      const y1 = sweep.bladeA.y1;

      reaperShadowGraphics.lineStyle(26 * scale, 0x090a0e, 0.76 * alphaMul);
      reaperShadowGraphics.lineBetween(x0, y0, x1, y1);
      reaperShadowGraphics.lineStyle(12 * scale, 0x16181f, 0.92 * alphaMul);
      reaperShadowGraphics.lineBetween(x0, y0, x1, y1);

      reaperGraphics.lineStyle(22 * scale, 0xb71c1c, 0.36 * alphaMul);
      reaperGraphics.lineBetween(x0, y0, x1, y1);
      reaperGraphics.lineStyle(9.5 * scale, 0xff1744, 0.88 * alphaMul);
      reaperGraphics.lineBetween(x0, y0, x1, y1);
      if (isPrimary) {
        reaperGraphics.lineStyle(3.8 * scale, 0xffebee, 0.96);
        reaperGraphics.lineBetween(x0, y0, x1, y1);

        reaperGraphics.fillStyle(0xff1744, 0.55);
        reaperGraphics.fillCircle(x0, y0, 10 * scale);
        reaperGraphics.fillCircle(x1, y1, 10 * scale);
        reaperGraphics.fillStyle(0xffffff, 0.95);
        reaperGraphics.fillCircle(x0, y0, 4.2 * scale);
        reaperGraphics.fillCircle(x1, y1, 4.2 * scale);

        reaperGraphics.lineStyle(2.2 * scale, 0xff1744, 0.95);
        reaperGraphics.beginPath();
        const steps = 14;
        for (let sIdx = 0; sIdx <= steps; sIdx++) {
          const f = sIdx / steps;
          const lx =
            x0 +
            (x1 - x0) * f +
            (sIdx > 0 && sIdx < steps ? (Math.random() - 0.5) * 14 * scale : 0);
          const ly =
            y0 +
            (y1 - y0) * f +
            (sIdx > 0 && sIdx < steps ? (Math.random() - 0.5) * 14 * scale : 0);
          if (sIdx === 0) reaperGraphics.moveTo(lx, ly);
          else reaperGraphics.lineTo(lx, ly);
        }
        reaperGraphics.strokePath();
      }

      const drawCrescentHead = (
        outerPts: ReadonlyArray<{ x: number; y: number }>,
        dirSign: 1 | -1,
      ) => {
        if (outerPts.length < 2) return;
        const ux = Math.cos(ang) * dirSign;
        const uy = Math.sin(ang) * dirSign;

        reaperShadowGraphics.fillStyle(0x0b0c10, (isPrimary ? 0.92 : 0.42) * alphaMul);
        reaperShadowGraphics.lineStyle(2.5 * scale, 0x1a1c23, 0.85 * alphaMul);
        reaperShadowGraphics.beginPath();
        for (let i = 0; i < outerPts.length; i++) {
          if (i === 0) reaperShadowGraphics.moveTo(outerPts[i].x, outerPts[i].y);
          else reaperShadowGraphics.lineTo(outerPts[i].x, outerPts[i].y);
        }
        for (let i = outerPts.length - 1; i >= 0; i--) {
          const arch = Math.sin((i / (outerPts.length - 1)) * Math.PI);
          const inset = bladeLen * 0.135 * arch * Math.min(1, crescentExtend);
          reaperShadowGraphics.lineTo(
            outerPts[i].x - ux * inset,
            outerPts[i].y - uy * inset,
          );
        }
        reaperShadowGraphics.closePath();
        reaperShadowGraphics.fillPath();
        reaperShadowGraphics.strokePath();

        const strokePoly = (w: number, col: number, a: number) => {
          reaperGraphics.lineStyle(w, col, a * alphaMul);
          reaperGraphics.beginPath();
          for (let i = 0; i < outerPts.length; i++) {
            if (i === 0) reaperGraphics.moveTo(outerPts[i].x, outerPts[i].y);
            else reaperGraphics.lineTo(outerPts[i].x, outerPts[i].y);
          }
          reaperGraphics.strokePath();
        };

        strokePoly(20 * scale, 0xd50000, 0.42);
        strokePoly(9.5 * scale, 0xff1744, 0.92);
        if (isPrimary) {
          strokePoly(3.8 * scale, 0xffcdd2, 1.0);
        }
      };

      drawCrescentHead(sweep.crescentA, 1);
      drawCrescentHead(sweep.crescentB, -1);
    };

    if (tank.isReaperRotating()) {
      drawScytheAtAngle(tank.kinematics.angle - 0.14, 0.22, false);
      drawScytheAtAngle(tank.kinematics.angle - 0.07, 0.44, false);
    }
    drawScytheAtAngle(tank.kinematics.angle, 1.0, true);
  }

  // I. Spinning red lock-on crosshair around any tank hunted by a Phase-2 Homing Missile
  reticleGraphics.clear();
  if (huntedTargetIndices.size > 0) {
    for (const idx of huntedTargetIndices) {
      const target = tanks.find((t) => t.index === idx);
      if (!target || !target.kinematics.alive) continue;

      const r = target.kinematics.radius * 1.65;
      const rot = animClock * 4.5;
      reticleGraphics.lineStyle(2.2 * scale, 0xff1744, 0.9);
      reticleGraphics.strokeCircle(target.kinematics.x, target.kinematics.y, r);

      for (let c = 0; c < 4; c++) {
        const a = rot + (c * Math.PI) / 2;
        reticleGraphics.lineBetween(
          target.kinematics.x + Math.cos(a) * (r * 0.72),
          target.kinematics.y + Math.sin(a) * (r * 0.72),
          target.kinematics.x + Math.cos(a) * (r * 1.25),
          target.kinematics.y + Math.sin(a) * (r * 1.25),
        );
      }
    }
  }
}
