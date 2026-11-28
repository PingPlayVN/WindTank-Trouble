import type Phaser from 'phaser';
import { UI_COLORS } from '../config/paletteConfig';
import { makeCanvas, roundRectPath } from './canvasUtils';

export function createMineTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  size: number,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const r = size * 0.36;

  ctx.strokeStyle = '#18191B';
  ctx.fillStyle = '#546E7A';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    ctx.save();
    ctx.translate(c, c);
    ctx.rotate(a);
    ctx.fillRect(r - 2, -2.2, 4.8, 4.4);
    ctx.strokeRect(r - 2, -2.2, 4.8, 4.4);
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fillStyle = '#263238';
  ctx.fill();
  ctx.lineWidth = 1.8;
  ctx.strokeStyle = '#101214';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(c, c, r * 0.44, 0, Math.PI * 2);
  ctx.fillStyle = '#FF1744';
  ctx.fill();
  tex.addCanvas(key, canvas);
}

export function createWarpBeaconTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  size: number,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const r = size * 0.44;

  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  ctx.fillStyle = '#070412';
  ctx.fill();
  ctx.lineWidth = 2.8;
  ctx.strokeStyle = '#E040FB';
  ctx.stroke();

  ctx.strokeStyle = '#00E5FF';
  ctx.lineWidth = 1.9;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * (r * 0.36), c + Math.sin(a) * (r * 0.36));
    ctx.lineTo(c + Math.cos(a) * (r * 0.88), c + Math.sin(a) * (r * 0.88));
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(c, c, r * 0.46, 0, Math.PI * 2);
  ctx.strokeStyle = '#EA80FC';
  ctx.lineWidth = 2.0;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(c, c, r * 0.24, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  tex.addCanvas(key, canvas);
}

export function createWoodenCrateTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  size: number,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  const pad = 4;
  const box = size - pad * 2;

  roundRectPath(ctx, pad + 2, pad + 3, box, box, 5);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.24)';
  ctx.fill();

  roundRectPath(ctx, pad, pad, box, box, 5);
  const woodGrad = ctx.createLinearGradient(pad, pad, pad + box, pad + box);
  woodGrad.addColorStop(0, '#DDA15E');
  woodGrad.addColorStop(0.5, '#BC6C25');
  woodGrad.addColorStop(1, '#8C4A15');
  ctx.fillStyle = woodGrad;
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.strokeStyle = 'rgba(62, 32, 8, 0.45)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(pad, pad + box * 0.33);
  ctx.lineTo(pad + box, pad + box * 0.33);
  ctx.moveTo(pad, pad + box * 0.67);
  ctx.lineTo(pad + box, pad + box * 0.67);
  ctx.stroke();

  ctx.strokeStyle = '#E6B37A';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(pad + 3, pad + 3);
  ctx.lineTo(pad + box - 3, pad + box - 3);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(62, 32, 8, 0.55)';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(pad + 4, pad + 4, box - 8, box - 8);
  ctx.restore();

  roundRectPath(ctx, pad, pad, box, box, 5);
  ctx.lineWidth = 2.4;
  ctx.strokeStyle = '#2A180B';
  ctx.stroke();

  const bSize = 7;
  const corners = [
    [pad, pad],
    [pad + box - bSize, pad],
    [pad, pad + box - bSize],
    [pad + box - bSize, pad + box - bSize],
  ];
  for (const [cx, cy] of corners) {
    ctx.fillStyle = '#455A64';
    ctx.fillRect(cx, cy, bSize, bSize);
    ctx.strokeStyle = '#18191B';
    ctx.lineWidth = 1.4;
    ctx.strokeRect(cx, cy, bSize, bSize);
    ctx.fillStyle = '#CFD8DC';
    ctx.beginPath();
    ctx.arc(cx + bSize / 2, cy + bSize / 2, 1.3, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.font = "900 19px 'Segoe UI', sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = 3.5;
  ctx.strokeStyle = '#2A180B';
  ctx.strokeText('?', size / 2, size / 2 + 1);
  ctx.fillStyle = '#FFF8E1';
  ctx.fillText('?', size / 2, size / 2 + 1);

  tex.addCanvas(key, canvas);
}

export function createTntBarrelTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  size: number,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  const pad = 4;
  const w = size - pad * 2;
  const h = size - pad * 2;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  roundRectPath(ctx, pad + 1.5, pad + 2.5, w, h, 7);
  ctx.fill();

  const bodyGrad = ctx.createLinearGradient(pad, pad, pad + w, pad + h);
  bodyGrad.addColorStop(0, '#D32F2F');
  bodyGrad.addColorStop(0.55, '#B71C1C');
  bodyGrad.addColorStop(1, '#7F0000');
  ctx.fillStyle = bodyGrad;
  roundRectPath(ctx, pad, pad, w, h, 7);
  ctx.fill();

  ctx.fillStyle = '#263238';
  ctx.fillRect(pad + 1, pad + 5, w - 2, 4);
  ctx.fillRect(pad + 1, pad + h - 9, w - 2, 4);

  ctx.fillStyle = '#212121';
  ctx.fillRect(pad + 2, size / 2 - 7, w - 4, 14);
  ctx.strokeStyle = '#FFB300';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(pad + 2.5, size / 2 - 6.5, w - 5, 13);

  ctx.fillStyle = '#ECEFF1';
  for (const [rx, ry] of [
    [pad + 5, pad + 5],
    [pad + w - 5, pad + 5],
    [pad + 5, pad + h - 5],
    [pad + w - 5, pad + h - 5],
  ]) {
    ctx.beginPath();
    ctx.arc(rx, ry, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.font = "900 9.5px 'Segoe UI', Arial, sans-serif";
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFEA00';
  ctx.fillText('TNT', size / 2, size / 2 + 0.5);

  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#18191B';
  roundRectPath(ctx, pad, pad, w, h, 7);
  ctx.stroke();

  tex.addCanvas(key, canvas);
}

export function createGroundSpikeTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  size: number,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;

  ctx.beginPath();
  ctx.arc(c, c + 1, size * 0.34, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();

  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a - 0.5) * 3.2, c + Math.sin(a - 0.5) * 3.2);
    ctx.lineTo(c + Math.cos(a) * (size * 0.45), c + Math.sin(a) * (size * 0.45));
    ctx.lineTo(c + Math.cos(a + 0.5) * 3.2, c + Math.sin(a + 0.5) * 3.2);
    ctx.closePath();
    ctx.fillStyle = i % 2 === 0 ? '#CFD8DC' : '#90A4AE';
    ctx.fill();
    ctx.lineWidth = 1.3;
    ctx.strokeStyle = '#18191B';
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(c, c, 3.0, 0, Math.PI * 2);
  ctx.fillStyle = '#D32F2F';
  ctx.fill();
  ctx.stroke();

  tex.addCanvas(key, canvas);
}

export function createTreadDecalTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  width: number,
  height: number,
): void {
  const { canvas, ctx } = makeCanvas(width, height);
  ctx.fillStyle = 'rgba(40, 42, 46, 0.11)';
  ctx.fillRect(2, 1, 5, 4);
  ctx.fillRect(2, height - 5, 5, 4);
  tex.addCanvas(key, canvas);
}

export function createScorchDecalTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  size: number,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const grad = ctx.createRadialGradient(c, c, 2, c, c, size * 0.45);
  grad.addColorStop(0, 'rgba(22, 23, 26, 0.46)');
  grad.addColorStop(0.45, 'rgba(42, 43, 48, 0.22)');
  grad.addColorStop(1, 'rgba(45, 46, 50, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(24, 25, 29, 0.22)';
  ctx.lineWidth = 2.2;
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + 0.2;
    const r1 = 5 + (i % 3) * 2;
    const r2 = 18 + ((i * 7) % 14);
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * r1, c + Math.sin(a) * r1);
    ctx.lineTo(c + Math.cos(a) * r2, c + Math.sin(a) * r2);
    ctx.stroke();
  }

  tex.addCanvas(key, canvas);
}

export function createSoftCircleTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  size: number,
  color: string,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  ctx.beginPath();
  ctx.arc(c, c, size * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  tex.addCanvas(key, canvas);
}

export function createStarSparkTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  size: number,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const outer = size * 0.48;
  const inner = size * 0.14;

  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? outer : inner;
    const px = c + Math.cos(a) * r;
    const py = c + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  tex.addCanvas(key, canvas);
}

export function createWoodPlankTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  w: number,
  h: number,
): void {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.fillStyle = '#C88746';
  ctx.fillRect(1, 1, w - 2, h - 2);
  ctx.strokeStyle = '#3E2008';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  tex.addCanvas(key, canvas);
}

export function createShardTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  size: number,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.beginPath();
  ctx.moveTo(2, 3);
  ctx.lineTo(size - 2, 2);
  ctx.lineTo(size - 3, size - 3);
  ctx.lineTo(3, size - 2);
  ctx.closePath();
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = UI_COLORS.inkDarkHex;
  ctx.stroke();
  tex.addCanvas(key, canvas);
}

export function createCrownTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  size: number,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  ctx.beginPath();
  ctx.moveTo(4, 24);
  ctx.lineTo(6, 10);
  ctx.lineTo(12, 16);
  ctx.lineTo(16, 7);
  ctx.lineTo(20, 16);
  ctx.lineTo(26, 10);
  ctx.lineTo(28, 24);
  ctx.closePath();
  ctx.fillStyle = '#FFD54F';
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#1D1F22';
  ctx.stroke();
  tex.addCanvas(key, canvas);
}
