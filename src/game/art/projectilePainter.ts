import type Phaser from 'phaser';
import { makeCanvas, roundRectPath } from './canvasUtils';

export function createShellTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  size: number,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const r = size * 0.36;

  ctx.beginPath();
  ctx.arc(c + 0.6, c + 0.8, r + 0.8, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.18)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(c - r * 0.32, c - r * 0.32, 0.5, c, c, r);
  grad.addColorStop(0, '#595E66');
  grad.addColorStop(0.45, '#22252A');
  grad.addColorStop(1, '#111215');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#0D0E10';
  ctx.stroke();

  tex.addCanvas(key, canvas);
}

export function createGatlingBulletTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  size: number,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const r = size * 0.34;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(c - 1, c - 1, 0.5, c, c, r);
  grad.addColorStop(0, '#FFF59D');
  grad.addColorStop(0.5, '#FB8C00');
  grad.addColorStop(1, '#263238');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = '#111215';
  ctx.stroke();
  tex.addCanvas(key, canvas);
}

export function createScatterPelletTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  size: number,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const r = size * 0.35;
  ctx.beginPath();
  ctx.arc(c, c, r, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(c - 1, c - 1, 0.5, c, c, r);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(0.45, '#40C4FF');
  grad.addColorStop(1, '#1565C0');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 1.3;
  ctx.strokeStyle = '#0D1B2A';
  ctx.stroke();
  tex.addCanvas(key, canvas);
}

export function createSpikeBallTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  size: number,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const coreR = size * 0.28;
  const spikeR = size * 0.46;

  ctx.fillStyle = '#CFD8DC';
  ctx.strokeStyle = '#111215';
  ctx.lineWidth = 1.3;
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a - 0.28) * coreR, c + Math.sin(a - 0.28) * coreR);
    ctx.lineTo(c + Math.cos(a) * spikeR, c + Math.sin(a) * spikeR);
    ctx.lineTo(c + Math.cos(a + 0.28) * coreR, c + Math.sin(a + 0.28) * coreR);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(c, c, coreR, 0, Math.PI * 2);
  const grad = ctx.createRadialGradient(c - 2, c - 2, 0.5, c, c, coreR);
  grad.addColorStop(0, '#78909C');
  grad.addColorStop(0.5, '#263238');
  grad.addColorStop(1, '#101214');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#0D0E10';
  ctx.stroke();

  tex.addCanvas(key, canvas);
}

export function createSpikeShardTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  w: number,
  h: number,
): void {
  const { canvas, ctx } = makeCanvas(w, h);
  ctx.beginPath();
  ctx.moveTo(w - 1, h / 2);
  ctx.lineTo(4, 1.5);
  ctx.lineTo(1, h / 2);
  ctx.lineTo(4, h - 1.5);
  ctx.closePath();
  const grad = ctx.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, '#546E7A');
  grad.addColorStop(0.6, '#ECEFF1');
  grad.addColorStop(1, '#FFFFFF');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = '#18191B';
  ctx.stroke();
  tex.addCanvas(key, canvas);
}

export function createMissileTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  w: number,
  h: number,
): void {
  const { canvas, ctx } = makeCanvas(w, h);
  const cy = h / 2;

  ctx.fillStyle = '#D32F2F';
  ctx.strokeStyle = '#18191B';
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(3, cy - 2);
  ctx.lineTo(1, 1);
  ctx.lineTo(9, cy - 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(3, cy + 2);
  ctx.lineTo(1, h - 1);
  ctx.lineTo(9, cy + 3);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  roundRectPath(ctx, 4, cy - 4, 15, 8, 2.5);
  ctx.fillStyle = '#ECEFF1';
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(17, cy - 4);
  ctx.quadraticCurveTo(w - 1, cy, 17, cy + 4);
  ctx.closePath();
  ctx.fillStyle = '#E53935';
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(13, cy, 1.8, 0, Math.PI * 2);
  ctx.fillStyle = '#FFEA00';
  ctx.fill();

  tex.addCanvas(key, canvas);
}

export function createDrillProjectileTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  w: number,
  h: number,
): void {
  const { canvas, ctx } = makeCanvas(w, h);
  const cy = h / 2;

  const flameGrad = ctx.createLinearGradient(0, cy, 10, cy);
  flameGrad.addColorStop(0, 'rgba(255, 109, 0, 0)');
  flameGrad.addColorStop(0.5, '#FF9100');
  flameGrad.addColorStop(1, '#FFF59D');
  ctx.fillStyle = flameGrad;
  ctx.beginPath();
  ctx.moveTo(0, cy);
  ctx.lineTo(9, cy - 4.5);
  ctx.lineTo(9, cy + 4.5);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#263238';
  ctx.strokeStyle = '#111215';
  ctx.lineWidth = 1.4;
  for (const sign of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(7, cy + sign * 3.5);
    ctx.lineTo(4, cy + sign * (cy - 1));
    ctx.lineTo(13, cy + sign * 5.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
  roundRectPath(ctx, 7, cy - 5.2, 7.5, 10.4, 2);
  ctx.fillStyle = '#37474F';
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#FFAB00';
  ctx.fillRect(9.5, cy - 4.4, 2.4, 8.8);

  ctx.beginPath();
  ctx.moveTo(14, cy - 7.4);
  ctx.lineTo(20, cy - 5.8);
  ctx.lineTo(20, cy - 7.0);
  ctx.lineTo(27, cy - 4.2);
  ctx.lineTo(27, cy - 5.1);
  ctx.lineTo(w - 1, cy);
  ctx.lineTo(27, cy + 5.1);
  ctx.lineTo(27, cy + 4.2);
  ctx.lineTo(20, cy + 7.0);
  ctx.lineTo(20, cy + 5.8);
  ctx.lineTo(14, cy + 7.4);
  ctx.closePath();

  const headGrad = ctx.createLinearGradient(14, 2, w, h - 2);
  headGrad.addColorStop(0, '#FFFFFF');
  headGrad.addColorStop(0.28, '#ECEFF1');
  headGrad.addColorStop(0.58, '#FFD54F');
  headGrad.addColorStop(0.85, '#FF8F00');
  headGrad.addColorStop(1, '#37474F');
  ctx.fillStyle = headGrad;
  ctx.fill();
  ctx.lineWidth = 1.6;
  ctx.strokeStyle = '#141619';
  ctx.stroke();

  ctx.strokeStyle = '#FF3D00';
  ctx.lineWidth = 1.9;
  ctx.beginPath();
  ctx.moveTo(15, cy);
  ctx.lineTo(w - 4, cy);
  ctx.stroke();

  ctx.strokeStyle = '#18191B';
  ctx.lineWidth = 1.6;
  for (const [x0, y0, x1, y1] of [
    [16, cy - 6.0, 19.5, cy + 5.6],
    [21.5, cy - 5.0, 24.8, cy + 4.2],
    [27.2, cy - 3.4, 30.2, cy + 2.8],
  ]) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(w - 3.2, cy, 1.8, 0, Math.PI * 2);
  ctx.fill();

  tex.addCanvas(key, canvas);
}

export function createFlameProjectileTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  w: number,
  h: number,
  variantSeed: number,
): void {
  const { canvas, ctx } = makeCanvas(w, h);
  const cx = w * 0.52;
  const cy = h * 0.5;

  ctx.save();
  const asym = (variantSeed - 1) * 2.5;

  const envGrad = ctx.createRadialGradient(cx + 3, cy, 1.5, cx - 2, cy, w * 0.48);
  envGrad.addColorStop(0, 'rgba(255, 253, 224, 1)');
  envGrad.addColorStop(0.24, 'rgba(255, 214, 0, 0.96)');
  envGrad.addColorStop(0.52, 'rgba(255, 90, 0, 0.9)');
  envGrad.addColorStop(0.78, 'rgba(198, 28, 12, 0.62)');
  envGrad.addColorStop(0.92, 'rgba(90, 18, 10, 0.24)');
  envGrad.addColorStop(1, 'rgba(60, 15, 10, 0)');
  ctx.fillStyle = envGrad;

  ctx.beginPath();
  ctx.moveTo(2, cy + asym * 0.4);
  ctx.bezierCurveTo(
    w * 0.24,
    cy - h * 0.46 + asym,
    w * 0.72,
    cy - h * 0.49 - asym * 0.4,
    w - 2,
    cy + asym * 0.28,
  );
  ctx.bezierCurveTo(
    w * 0.72,
    cy + h * 0.49 + asym * 0.4,
    w * 0.24,
    cy + h * 0.46 - asym,
    2,
    cy + asym * 0.4,
  );
  ctx.closePath();
  ctx.fill();

  const tongueOffsets = [
    { ox: 3.5, oy: -3.8 + asym * 0.45, rx: w * 0.26, ry: h * 0.19 },
    { ox: -2.0, oy: 3.8 - asym * 0.45, rx: w * 0.27, ry: h * 0.2 },
    { ox: 6.5, oy: 0.6 * asym, rx: w * 0.2, ry: h * 0.14 },
  ];
  for (const t of tongueOffsets) {
    const lx = cx + t.ox;
    const ly = cy + t.oy;
    const tGrad = ctx.createRadialGradient(lx, ly, 0.5, lx, ly, t.rx);
    tGrad.addColorStop(0, 'rgba(255, 255, 255, 0.98)');
    tGrad.addColorStop(0.38, 'rgba(255, 234, 0, 0.85)');
    tGrad.addColorStop(0.75, 'rgba(255, 82, 0, 0.45)');
    tGrad.addColorStop(1, 'rgba(213, 0, 0, 0)');
    ctx.fillStyle = tGrad;
    ctx.beginPath();
    ctx.ellipse(lx, ly, t.rx, t.ry, asym * 0.06, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  tex.addCanvas(key, canvas);
}

export function createEmpOrbTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  size: number,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const r = size * 0.42;

  ctx.fillStyle = '#0A0818';
  ctx.strokeStyle = '#651FFF';
  ctx.lineWidth = 1.6;
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a - 0.3) * (r * 0.62), c + Math.sin(a - 0.3) * (r * 0.62));
    ctx.lineTo(c + Math.cos(a) * (r * 1.12), c + Math.sin(a) * (r * 1.12));
    ctx.lineTo(c + Math.cos(a + 0.3) * (r * 0.62), c + Math.sin(a + 0.3) * (r * 0.62));
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(c, c, r * 0.78, 0, Math.PI * 2);
  ctx.fillStyle = '#0C091E';
  ctx.fill();
  ctx.lineWidth = 2.2;
  ctx.strokeStyle = '#00E5FF';
  ctx.stroke();

  const glow = ctx.createRadialGradient(c, c, 0.8, c, c, r * 0.65);
  glow.addColorStop(0, '#FFFFFF');
  glow.addColorStop(0.5, '#00E5FF');
  glow.addColorStop(1, '#651FFF');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(c, c, r * 0.56, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#FFEA00';
  ctx.lineWidth = 2.0;
  ctx.beginPath();
  ctx.moveTo(c + 1, c - 5);
  ctx.lineTo(c - 3.5, c + 0.5);
  ctx.lineTo(c + 1.5, c + 0.5);
  ctx.lineTo(c - 1, c + 5);
  ctx.stroke();

  tex.addCanvas(key, canvas);
}

export function createCryoOrbTexture(
  tex: Phaser.Textures.TextureManager,
  key: string,
  size: number,
): void {
  const { canvas, ctx } = makeCanvas(size, size);
  const c = size / 2;
  const outerR = size * 0.46;
  const innerR = size * 0.24;

  ctx.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    const r = i % 2 === 0 ? outerR : innerR;
    const px = c + Math.cos(a) * r;
    const py = c + Math.sin(a) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  const grad = ctx.createRadialGradient(c, c, 1, c, c, outerR);
  grad.addColorStop(0, '#FFFFFF');
  grad.addColorStop(0.45, '#84FFFF');
  grad.addColorStop(0.82, '#00838F');
  grad.addColorStop(1, '#062130');
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = 2.0;
  ctx.strokeStyle = '#062130';
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(c, c, innerR * 0.65, 0, Math.PI * 2);
  ctx.fillStyle = '#FFFFFF';
  ctx.fill();

  tex.addCanvas(key, canvas);
}
