import type Phaser from 'phaser';
import { getTankSkinModule } from '../skins/registry';
import type { SkillId, TankColorPalette, TankSkinId } from '../types/gameTypes';
import { makeCanvas, roundRectPath } from './canvasUtils';

export function createTankTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  palette: TankColorPalette,
  treadPhase: number,
  width: number,
  height: number,
  skill: SkillId | null,
  skinId: TankSkinId = 'classic',
): void {
  const skinMod = getTankSkinModule(skinId);
  const { canvas, ctx } = makeCanvas(width, height);
  const cx = width * 0.44;
  const cy = height * 0.5;
  const scale = width / 64;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(scale, scale);

  const outline = '#18191B';

  // 0. Superhero Rear Wings / Side Shields / Rear Racks
  if (skill === 'laser') {
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-8, sign * 11);
      ctx.lineTo(-22, sign * 22);
      ctx.lineTo(-4, sign * 19);
      ctx.lineTo(8, sign * 12);
      ctx.closePath();
      ctx.fillStyle = '#E0F7FA';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = outline;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-17, sign * 19.5);
      ctx.lineTo(-4, sign * 16.5);
      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 2.2;
      ctx.stroke();
    }
  } else if (skill === 'homing') {
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-6, sign * 11);
      ctx.lineTo(-23, sign * 23);
      ctx.lineTo(-13, sign * 23);
      ctx.lineTo(4, sign * 13);
      ctx.closePath();
      ctx.fillStyle = '#ECEFF1';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.fillStyle = '#FF1744';
      ctx.fillRect(-18, sign > 0 ? 18 : -21, 7, 3);
    }
  } else if (skill === 'gatling') {
    for (const ty of [-7.5, 3.5]) {
      roundRectPath(ctx, -23, ty, 7, 4.2, 1.5);
      ctx.fillStyle = '#FFB300';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = outline;
      ctx.stroke();
    }
  } else if (skill === 'shield') {
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-14, sign * 14);
      ctx.quadraticCurveTo(0, sign * 23, 15, sign * 14);
      ctx.lineTo(11, sign * 11);
      ctx.quadraticCurveTo(0, sign * 17, -11, sign * 11);
      ctx.closePath();
      ctx.fillStyle = '#00E5FF';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = outline;
      ctx.stroke();
    }
  } else if (skill === 'reaper') {
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-4, sign * 11);
      ctx.quadraticCurveTo(-20, sign * 25, 14, sign * 23.5);
      ctx.quadraticCurveTo(2, sign * 17, 8, sign * 12);
      ctx.closePath();
      ctx.fillStyle = '#0D0E12';
      ctx.fill();
      ctx.lineWidth = 1.9;
      ctx.strokeStyle = '#FF1744';
      ctx.stroke();
    }
  } else if (skill === 'drill') {
    for (const py of [-14.2, 10.2]) {
      roundRectPath(ctx, -14, py, 24, 4.0, 1.5);
      ctx.fillStyle = '#37474F';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.fillStyle = '#ECEFF1';
      ctx.fillRect(6, py + 0.8, 7, 2.4);
    }
  } else if (skill === 'mine') {
    roundRectPath(ctx, -24.5, -8.5, 8, 17, 2);
    ctx.fillStyle = '#263238';
    ctx.fill();
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-20.5, 0, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = '#FF1744';
    ctx.fill();
  } else if (skill === 'emp') {
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-6, sign * 11);
      ctx.lineTo(-24, sign * 23);
      ctx.lineTo(-7, sign * 22);
      ctx.lineTo(10, sign * 13);
      ctx.closePath();
      ctx.fillStyle = '#0D0A22';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#651FFF';
      ctx.stroke();

      ctx.strokeStyle = '#00E5FF';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-19, sign * 20.5);
      ctx.lineTo(-4, sign * 16.5);
      ctx.stroke();
      ctx.fillStyle = '#FFEA00';
      ctx.beginPath();
      ctx.arc(-12, sign * 18.5, 2.0, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (skill === 'phantom') {
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-4, sign * 11);
      ctx.quadraticCurveTo(-24, sign * 25.5, 13, sign * 23);
      ctx.quadraticCurveTo(1, sign * 16.5, 9, sign * 12);
      ctx.closePath();
      ctx.fillStyle = '#0E091C';
      ctx.fill();
      ctx.lineWidth = 1.9;
      ctx.strokeStyle = '#E040FB';
      ctx.stroke();
    }
  } else if (skill === 'cryo') {
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(-15, sign * 12);
      ctx.lineTo(-21, sign * 22.5);
      ctx.lineTo(-7, sign * 18.5);
      ctx.lineTo(2, sign * 23.5);
      ctx.lineTo(13, sign * 13);
      ctx.closePath();
      ctx.fillStyle = '#072233';
      ctx.fill();
      ctx.lineWidth = 1.7;
      ctx.strokeStyle = '#00E5FF';
      ctx.stroke();
      ctx.fillStyle = '#84FFFF';
      ctx.beginPath();
      ctx.arc(-3, sign * 18.5, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (skill === 'barrier') {
    for (const sign of [-1, 1]) {
      roundRectPath(ctx, -8, sign > 0 ? 11 : -21.5, 26, 10.5, 2.5);
      ctx.fillStyle = '#0A1F15';
      ctx.fill();
      ctx.lineWidth = 1.8;
      ctx.strokeStyle = '#00E676';
      ctx.stroke();
      ctx.fillStyle = '#69F0AE';
      ctx.fillRect(11, sign > 0 ? 13 : -19.5, 5, 6.5);
    }
  } else if (skill === 'warp') {
    ctx.beginPath();
    ctx.arc(-15, 0, 13.5, Math.PI * 0.48, Math.PI * 1.52);
    ctx.lineWidth = 5.2;
    ctx.strokeStyle = '#090614';
    ctx.stroke();
    ctx.lineWidth = 2.6;
    ctx.strokeStyle = '#E040FB';
    ctx.stroke();
    ctx.fillStyle = '#80D8FF';
    for (const sy of [-12.5, 0, 12.5]) {
      ctx.beginPath();
      ctx.arc(sy === 0 ? -28.5 : -17, sy, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 1 & 2. Custom Skin Treads/Pods/Hover-Nacelles & Color-Adaptive Armored Hull
  skinMod.drawChassis(ctx, palette, treadPhase, skill);

  ctx.save();
  skinMod.drawHullClipPath(ctx);
  ctx.clip();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.30)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-15, -9.8);
  ctx.lineTo(15, -9.8);
  ctx.stroke();

  if (skill === 'laser') {
    ctx.fillStyle = '#00E5FF';
    ctx.beginPath();
    ctx.moveTo(15, -9);
    ctx.lineTo(4, 0);
    ctx.lineTo(15, 9);
    ctx.lineTo(11, 9);
    ctx.lineTo(0, 0);
    ctx.lineTo(11, -9);
    ctx.closePath();
    ctx.fill();
  } else if (skill === 'gatling') {
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    ctx.fillRect(-16, -7.2, 32, 2.2);
    ctx.fillRect(-16, 5.0, 32, 2.2);
    ctx.strokeStyle = '#FFD54F';
    ctx.lineWidth = 3.2;
    ctx.setLineDash([2.4, 1.6]);
    ctx.beginPath();
    ctx.moveTo(-12, -11);
    ctx.lineTo(10, 11);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (skill === 'spike') {
    ctx.strokeStyle = '#37474F';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    ctx.moveTo(-15, -10);
    ctx.lineTo(14, 10);
    ctx.moveTo(-15, 10);
    ctx.lineTo(14, -10);
    ctx.stroke();
  } else if (skill === 'homing') {
    ctx.fillStyle = '#ECEFF1';
    ctx.beginPath();
    ctx.moveTo(-16, -11);
    ctx.lineTo(-5, 0);
    ctx.lineTo(-16, 11);
    ctx.closePath();
    ctx.fill();
  } else if (skill === 'drill') {
    ctx.strokeStyle = '#FFD600';
    ctx.lineWidth = 3.2;
    for (let sx = -18; sx <= 14; sx += 8) {
      ctx.beginPath();
      ctx.moveTo(sx, -12);
      ctx.lineTo(sx + 8, 12);
      ctx.stroke();
    }
  } else if (skill === 'flame') {
    ctx.fillStyle = '#FFEA00';
    ctx.beginPath();
    ctx.moveTo(15, 0);
    ctx.lineTo(3, -8);
    ctx.lineTo(7, -2);
    ctx.lineTo(-8, -6);
    ctx.lineTo(0, 0);
    ctx.lineTo(-8, 6);
    ctx.lineTo(7, 2);
    ctx.lineTo(3, 8);
    ctx.closePath();
    ctx.fill();
  } else if (skill === 'scatter') {
    ctx.strokeStyle = '#E3F2FD';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-12, -9);
    ctx.lineTo(12, 0);
    ctx.lineTo(-12, 9);
    ctx.stroke();
  } else if (skill === 'shield') {
    ctx.fillStyle = 'rgba(224, 247, 250, 0.72)';
    ctx.fillRect(-14, -2.2, 28, 4.4);
    ctx.fillRect(-2, -10, 4.4, 20);
  } else if (skill === 'mine') {
    ctx.strokeStyle = '#263238';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(6, -10);
    ctx.lineTo(-6, 0);
    ctx.lineTo(6, 10);
    ctx.stroke();
  } else if (skill === 'reaper') {
    ctx.fillStyle = '#0D0E12';
    ctx.beginPath();
    ctx.arc(0, 0, 10.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FF1744';
    ctx.lineWidth = 2.4;
    ctx.stroke();
  } else if (skill === 'emp') {
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-13, -7);
    ctx.lineTo(-2, -1);
    ctx.lineTo(-6, 4);
    ctx.lineTo(12, 8);
    ctx.stroke();
  } else if (skill === 'phantom') {
    ctx.strokeStyle = 'rgba(237, 231, 246, 0.85)';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, 11.5, -1.1, 1.1);
    ctx.stroke();
  } else if (skill === 'cryo') {
    ctx.strokeStyle = '#E0F7FA';
    ctx.lineWidth = 2.2;
    for (const a of [0, Math.PI / 3, -Math.PI / 3]) {
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * -10, Math.sin(a) * -10);
      ctx.lineTo(Math.cos(a) * 10, Math.sin(a) * 10);
      ctx.stroke();
    }
  } else if (skill === 'barrier') {
    ctx.fillStyle = '#69F0AE';
    ctx.fillRect(9, -10, 4, 20);
    ctx.fillStyle = 'rgba(105, 240, 174, 0.45)';
    ctx.fillRect(-12, -8, 16, 2.5);
    ctx.fillRect(-12, 5.5, 16, 2.5);
  } else if (skill === 'warp') {
    ctx.strokeStyle = '#EA80FC';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, 9.5, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  if (skill === 'spike') {
    ctx.fillStyle = '#CFD8DC';
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.5;
    for (const ry of [-8, 0, 8]) {
      ctx.beginPath();
      ctx.moveTo(16.5, ry - 2.8);
      ctx.lineTo(22.5, ry);
      ctx.lineTo(16.5, ry + 2.8);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    const corners: Array<[number, number, number, number]> = [
      [-13, -15, -18, -22],
      [11, -15, 16, -22],
      [-13, 15, -18, 22],
      [11, 15, 16, 22],
    ];
    for (const [bx, by, tx, ty] of corners) {
      ctx.beginPath();
      ctx.moveTo(bx - 3, by);
      ctx.lineTo(tx, ty);
      ctx.lineTo(bx + 3, by);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
  } else if (skill === 'homing') {
    for (const py of [-13.5, 7.5]) {
      roundRectPath(ctx, -5, py, 12, 6, 1.8);
      ctx.fillStyle = '#455A64';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.fillStyle = '#FF1744';
      ctx.beginPath();
      ctx.arc(5.2, py + 3, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (skill === 'flame') {
    for (const py of [-13.8, 7.8]) {
      roundRectPath(ctx, -12, py, 20, 6, 2.8);
      ctx.fillStyle = '#FF3D00';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.fillStyle = '#FFD600';
      ctx.fillRect(-4, py + 0.8, 3.5, 4.4);
    }
  }

  // 3. Weapon Barrel
  if (skill === 'laser') {
    for (const by of [-4.8, 1.8]) {
      roundRectPath(ctx, 2, by, 27, 3.0, 1.2);
      ctx.fillStyle = '#ECEFF1';
      ctx.fill();
      ctx.lineWidth = 1.7;
      ctx.strokeStyle = outline;
      ctx.stroke();
    }
    ctx.fillStyle = '#00E5FF';
    ctx.fillRect(4, -1.6, 24, 3.2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(5, -0.7, 22, 1.4);
  } else if (skill === 'gatling') {
    for (const by of [-4.4, -1.3, 1.8]) {
      ctx.fillStyle = '#37474F';
      ctx.fillRect(3, by, 25, 2.5);
      ctx.strokeStyle = outline;
      ctx.lineWidth = 1.2;
      ctx.strokeRect(3, by, 25, 2.5);
    }
    ctx.fillStyle = '#FFB300';
    ctx.fillRect(15, -5.0, 3.2, 10.0);
    ctx.fillRect(23.5, -5.0, 3.5, 10.0);
    ctx.strokeStyle = outline;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(23.5, -5.0, 3.5, 10.0);
  } else if (skill === 'spike') {
    roundRectPath(ctx, 2, -5.0, 24, 10.0, 2.2);
    ctx.fillStyle = '#455A64';
    ctx.fill();
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = outline;
    ctx.stroke();
    roundRectPath(ctx, 21, -6.2, 6, 12.4, 1.6);
    ctx.fillStyle = '#263238';
    ctx.fill();
    ctx.stroke();
  } else if (skill === 'homing') {
    roundRectPath(ctx, 2, -4.4, 25, 8.8, 2.2);
    ctx.fillStyle = '#CFD8DC';
    ctx.fill();
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = outline;
    ctx.stroke();
    roundRectPath(ctx, 22, -4.8, 5.8, 9.6, 1.5);
    ctx.fillStyle = '#E53935';
    ctx.fill();
    ctx.stroke();
  } else if (skill === 'scatter') {
    for (const ang of [-0.26, 0, 0.26]) {
      ctx.save();
      ctx.rotate(ang);
      roundRectPath(ctx, 4, -2.4, 22, 4.8, 1.4);
      ctx.fillStyle = '#455A64';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = outline;
      ctx.stroke();
      ctx.fillStyle = '#2979FF';
      ctx.fillRect(22, -3.0, 4, 6.0);
      ctx.strokeRect(22, -3.0, 4, 6.0);
      ctx.restore();
    }
  } else if (skill === 'drill') {
    roundRectPath(ctx, 1, -6.5, 9.5, 13, 2);
    ctx.fillStyle = '#263238';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.fillStyle = '#FFB300';
    ctx.fillRect(3.5, -5.5, 2.5, 11);

    ctx.beginPath();
    ctx.moveTo(10, -7.8);
    ctx.lineTo(31, 0);
    ctx.lineTo(10, 7.8);
    ctx.closePath();
    const dGrad = ctx.createLinearGradient(10, -7.5, 28, 7.5);
    dGrad.addColorStop(0, '#FFFFFF');
    dGrad.addColorStop(0.32, '#CFD8DC');
    dGrad.addColorStop(0.65, '#FFB300');
    dGrad.addColorStop(1, '#455A64');
    ctx.fillStyle = dGrad;
    ctx.fill();
    ctx.lineWidth = 1.9;
    ctx.strokeStyle = outline;
    ctx.stroke();

    ctx.strokeStyle = '#FF6D00';
    ctx.lineWidth = 2.0;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(27, 0);
    ctx.stroke();

    ctx.strokeStyle = '#18191B';
    ctx.lineWidth = 1.7;
    for (const [x0, y0, x1, y1] of [
      [12.5, -6.4, 15.5, 5.6],
      [17.0, -4.9, 19.8, 4.1],
      [21.5, -3.2, 24.0, 2.6],
    ]) {
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  } else if (skill === 'flame') {
    roundRectPath(ctx, 2, -4.6, 20, 9.2, 2);
    ctx.fillStyle = '#37474F';
    ctx.fill();
    ctx.lineWidth = 1.9;
    ctx.strokeStyle = outline;
    ctx.stroke();

    roundRectPath(ctx, 19, -5.8, 7.5, 11.6, 2);
    ctx.fillStyle = '#FF3D00';
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(27.5, 0, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = '#FFEA00';
    ctx.fill();
  } else if (skill === 'shield') {
    roundRectPath(ctx, 2, -3.8, 24, 7.6, 2.2);
    ctx.fillStyle = '#E0F2F1';
    ctx.fill();
    ctx.lineWidth = 1.9;
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.fillStyle = '#00BFA5';
    ctx.fillRect(18, -4.4, 6, 8.8);
    ctx.strokeRect(18, -4.4, 6, 8.8);
  } else if (skill === 'mine') {
    roundRectPath(ctx, 2, -3.0, 25, 6.0, 1.8);
    ctx.fillStyle = '#263238';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.fillStyle = '#FF1744';
    ctx.fillRect(21, -3.2, 3, 6.4);
  } else if (skill === 'reaper') {
    for (const dir of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(
        dir * 13.5,
        0,
        7.0,
        dir > 0 ? -Math.PI / 2 : Math.PI / 2,
        dir > 0 ? Math.PI / 2 : -Math.PI / 2,
        false,
      );
      ctx.closePath();
      ctx.fillStyle = '#0D0E12';
      ctx.fill();
      ctx.lineWidth = 2.0;
      ctx.strokeStyle = '#FF1744';
      ctx.stroke();
    }
  } else if (skill === 'emp') {
    for (const py of [-5.8, 2.4]) {
      roundRectPath(ctx, 2, py, 26, 3.4, 1.3);
      ctx.fillStyle = '#0D0A22';
      ctx.fill();
      ctx.lineWidth = 1.6;
      ctx.strokeStyle = '#651FFF';
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(25.5, 0, 4.8, 0, Math.PI * 2);
    ctx.fillStyle = '#00E5FF';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#0D0A22';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(25.5, 0, 2.1, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
  } else if (skill === 'phantom') {
    for (const sign of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(4, sign * 2.2);
      ctx.lineTo(28, sign * 5.8);
      ctx.lineTo(23, sign * 1.4);
      ctx.closePath();
      ctx.fillStyle = '#0E091C';
      ctx.fill();
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = '#E040FB';
      ctx.stroke();
    }
    roundRectPath(ctx, 2, -2.6, 24, 5.2, 1.8);
    ctx.fillStyle = '#B388FF';
    ctx.fill();
    ctx.strokeStyle = '#0E091C';
    ctx.stroke();
  } else if (skill === 'cryo') {
    roundRectPath(ctx, 2, -4.8, 22, 9.6, 2.2);
    ctx.fillStyle = '#072233';
    ctx.fill();
    ctx.lineWidth = 1.9;
    ctx.strokeStyle = outline;
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(20, -7.2);
    ctx.lineTo(30.5, 0);
    ctx.lineTo(20, 7.2);
    ctx.closePath();
    ctx.fillStyle = '#84FFFF';
    ctx.fill();
    ctx.lineWidth = 1.7;
    ctx.strokeStyle = '#072233';
    ctx.stroke();
  } else if (skill === 'barrier') {
    roundRectPath(ctx, 2, -3.8, 19, 7.6, 1.8);
    ctx.fillStyle = '#0A1F15';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = outline;
    ctx.stroke();
    roundRectPath(ctx, 19.5, -10.0, 7.2, 20.0, 2.2);
    ctx.fillStyle = '#0A1F15';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#00E676';
    ctx.stroke();
    ctx.fillStyle = '#69F0AE';
    ctx.fillRect(21.8, -7.8, 2.8, 15.6);
  } else if (skill === 'warp') {
    roundRectPath(ctx, 2, -4.2, 21, 8.4, 2);
    ctx.fillStyle = '#090614';
    ctx.fill();
    ctx.lineWidth = 1.8;
    ctx.strokeStyle = '#E040FB';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(25.0, 0, 5.4, 0, Math.PI * 2);
    ctx.fillStyle = '#090614';
    ctx.fill();
    ctx.lineWidth = 2.0;
    ctx.strokeStyle = '#80D8FF';
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(25.0, 0, 2.2, 0, Math.PI * 2);
    ctx.fillStyle = '#EA80FC';
    ctx.fill();
  } else {
    skinMod.drawStandardBarrel(ctx, palette);
  }

  // 4. Central Turret Dome / Custom Skin Crest + Superhero Helmet
  skinMod.drawTurret(ctx, palette, skill);

  if (skill) {
    const visorColorMap: Record<SkillId, string> = {
      laser: '#00E5FF',
      spike: '#FFAB00',
      gatling: '#FFEA00',
      homing: '#FF1744',
      scatter: '#40C4FF',
      mine: '#FF5252',
      flame: '#FF6D00',
      drill: '#FFD600',
      shield: '#1DE9B6',
      reaper: '#FF1744',
      emp: '#00E5FF',
      phantom: '#EA80FC',
      cryo: '#84FFFF',
      barrier: '#69F0AE',
      warp: '#E040FB',
    };
    const visorColor = visorColorMap[skill];

    ctx.beginPath();
    ctx.moveTo(2.5, -7.2);
    ctx.lineTo(8.5, 0);
    ctx.lineTo(2.5, 7.2);
    ctx.lineTo(-1.0, 4.6);
    ctx.lineTo(3.8, 0);
    ctx.lineTo(-1.0, -4.6);
    ctx.closePath();
    ctx.fillStyle = visorColor;
    ctx.fill();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = outline;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(-3.2, 0, 2.8, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = visorColor;
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(-1.2, -0.5, 3.6, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fill();
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(24,25,27,0.55)';
    ctx.stroke();
  }

  ctx.restore();
  tex.addCanvas(key, canvas);
}

export function createTankShadowTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  width: number,
  height: number,
): void {
  const { canvas, ctx } = makeCanvas(width, height);
  const cx = width * 0.44;
  const cy = height * 0.5;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  roundRectPath(ctx, -20, -16.5, 40, 33, 8);
  ctx.fill();
  roundRectPath(ctx, 4, -4.5, 24, 9, 3);
  ctx.fill();
  ctx.restore();

  tex.addCanvas(key, canvas);
}
