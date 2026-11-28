import type Phaser from 'phaser';
import { SKILL_DESCRIPTORS } from '../skills/registry';
import type { SkillId } from '../types/gameTypes';
import { makeCanvas, roundRectPath } from './canvasUtils';

export function createSkillEmblemTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  skill: SkillId,
  size: number,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const desc = SKILL_DESCRIPTORS.find((d) => d.id === skill)!;

  roundRectPath(ctx, 3, 3, size - 6, size - 6, 9);
  ctx.fillStyle = desc.accentHex;
  ctx.fill();
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#18191B';
  ctx.stroke();

  ctx.save();
  ctx.translate(c, c);
  if (skill === 'laser') {
    ctx.strokeStyle = '#E0F7FA';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.moveTo(-13, 8);
    ctx.quadraticCurveTo(-2, 6, 13, -9);
    ctx.stroke();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.2;
    ctx.stroke();
  } else if (skill === 'spike') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a - 0.25) * 6, Math.sin(a - 0.25) * 6);
      ctx.lineTo(Math.cos(a) * 14, Math.sin(a) * 14);
      ctx.lineTo(Math.cos(a + 0.25) * 6, Math.sin(a + 0.25) * 6);
      ctx.closePath();
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
    }
    ctx.beginPath();
    ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
    ctx.fillStyle = '#263238';
    ctx.fill();
  } else if (skill === 'gatling') {
    ctx.fillStyle = '#FFF8E1';
    for (const oy of [-7, 0, 7]) {
      roundRectPath(ctx, -11, oy - 2.2, 22, 4.4, 2);
      ctx.fill();
    }
  } else if (skill === 'homing') {
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-14, 0);
    ctx.lineTo(14, 0);
    ctx.moveTo(0, -14);
    ctx.lineTo(0, 14);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.fillStyle = '#FFEA00';
    ctx.fill();
  } else if (skill === 'scatter') {
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.4;
    for (const a of [-0.45, 0, 0.45]) {
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.lineTo(-10 + Math.cos(a) * 22, Math.sin(a) * 22);
      ctx.stroke();
    }
  } else if (skill === 'mine') {
    ctx.fillStyle = '#263238';
    ctx.beginPath();
    ctx.arc(0, 0, 11, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#FF1744';
    ctx.beginPath();
    ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (skill === 'flame') {
    ctx.fillStyle = '#FFEA00';
    ctx.beginPath();
    ctx.moveTo(0, -14);
    ctx.quadraticCurveTo(12, 2, 0, 13);
    ctx.quadraticCurveTo(-12, 2, 0, -14);
    ctx.fill();
  } else if (skill === 'drill') {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#18191B';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-10, -9.5);
    ctx.lineTo(-10, 9.5);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#FF6D00';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-6, -6);
    ctx.lineTo(-2, 5.5);
    ctx.moveTo(1, -4);
    ctx.lineTo(4.5, 3.5);
    ctx.stroke();
  } else if (skill === 'shield') {
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      const px = Math.cos(a) * 12.5;
      const py = Math.sin(a) * 12.5;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
  } else if (skill === 'reaper') {
    ctx.fillStyle = '#0D0E12';
    ctx.beginPath();
    ctx.arc(0, 0, 14.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FF1744';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.arc(0, 0, 11, -0.85, 1.45);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 0, 11, Math.PI - 0.85, Math.PI + 1.45);
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (skill === 'emp') {
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(0, 0, 12.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#FFEA00';
    ctx.beginPath();
    ctx.moveTo(2, -13);
    ctx.lineTo(-7, 1);
    ctx.lineTo(0, 1);
    ctx.lineTo(-3, 13);
    ctx.lineTo(8, -2);
    ctx.lineTo(1, -2);
    ctx.closePath();
    ctx.fill();
  } else if (skill === 'phantom') {
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.beginPath();
    ctx.arc(0, -2, 10.5, Math.PI, 0, false);
    ctx.lineTo(10.5, 11);
    ctx.lineTo(5, 7.5);
    ctx.lineTo(0, 11.5);
    ctx.lineTo(-5, 7.5);
    ctx.lineTo(-10.5, 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#311B92';
    ctx.beginPath();
    ctx.arc(-3.6, -2.5, 2.1, 0, Math.PI * 2);
    ctx.arc(3.6, -2.5, 2.1, 0, Math.PI * 2);
    ctx.fill();
  } else if (skill === 'cryo') {
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.6;
    for (let i = 0; i < 3; i++) {
      const a = (i * Math.PI) / 3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * -13, Math.sin(a) * -13);
      ctx.lineTo(Math.cos(a) * 13, Math.sin(a) * 13);
      ctx.stroke();
    }
    ctx.fillStyle = '#84FFFF';
    ctx.beginPath();
    ctx.arc(0, 0, 4.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (skill === 'barrier') {
    ctx.fillStyle = '#B9F6CA';
    roundRectPath(ctx, -13, -7, 26, 14, 3);
    ctx.fill();
    ctx.strokeStyle = '#18191B';
    ctx.lineWidth = 1.8;
    ctx.stroke();
    ctx.strokeStyle = '#1B5E20';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(13, 0);
    ctx.moveTo(-3, -7);
    ctx.lineTo(-3, 0);
    ctx.moveTo(4, 0);
    ctx.lineTo(4, 7);
    ctx.stroke();
  } else if (skill === 'warp') {
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.arc(0, 0, 12, 0.3, Math.PI * 1.8);
    ctx.stroke();
    ctx.strokeStyle = '#80D8FF';
    ctx.beginPath();
    ctx.arc(0, 0, 6.8, Math.PI * 0.8, Math.PI * 2.3);
    ctx.stroke();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(0, 0, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  tex.addCanvas(key, canvas);
}
