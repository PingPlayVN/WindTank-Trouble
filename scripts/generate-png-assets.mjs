import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { PNG } from 'pngjs';

function setPixel(png, x, y, r, g, b, a = 255) {
  if (x < 0 || y < 0 || x >= png.width || y >= png.height) return;
  const idx = (png.width * y + x) << 2;
  png.data[idx] = r;
  png.data[idx + 1] = g;
  png.data[idx + 2] = b;
  png.data[idx + 3] = a;
}

function createTankBadgePng(primaryRgb, darkRgb) {
  const png = new PNG({ width: 48, height: 48 });
  for (let y = 10; y <= 38; y++) {
    for (let x = 8; x <= 40; x++) {
      const isTread = x <= 13 || x >= 35;
      const isBorder = x === 8 || x === 40 || y === 10 || y === 38;
      if (isBorder) setPixel(png, x, y, 24, 25, 27, 255);
      else if (isTread) setPixel(png, x, y, 43, 45, 48, 255);
      else setPixel(png, x, y, primaryRgb[0], primaryRgb[1], primaryRgb[2], 255);
    }
  }
  // Barrel pointing up
  for (let y = 3; y <= 22; y++) {
    for (let x = 21; x <= 27; x++) {
      const isBorder = x === 21 || x === 27 || y === 3;
      if (isBorder) setPixel(png, x, y, 24, 25, 27, 255);
      else setPixel(png, x, y, darkRgb[0], darkRgb[1], darkRgb[2], 255);
    }
  }
  return PNG.sync.write(png);
}

function createFloorTilePng() {
  const png = new PNG({ width: 64, height: 64 });
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const isEdge = x === 0 || y === 0;
      const c = isEdge ? 230 : 243;
      setPixel(png, x, y, c, c, c - 2, 255);
    }
  }
  return PNG.sync.write(png);
}

async function main() {
  const spriteDir = path.resolve('public/assets/sprites');
  const texDir = path.resolve('public/assets/textures');
  await mkdir(spriteDir, { recursive: true });
  await mkdir(texDir, { recursive: true });

  const palettes = [
    ['tank_red.png', [229, 57, 53], [171, 0, 13]],
    ['tank_green.png', [67, 160, 71], [27, 94, 32]],
    ['tank_blue.png', [30, 136, 229], [13, 71, 161]],
    ['tank_gold.png', [249, 168, 37], [193, 121, 0]],
  ];

  for (const [name, pri, dark] of palettes) {
    await writeFile(path.join(spriteDir, name), createTankBadgePng(pri, dark));
  }
  await writeFile(path.join(texDir, 'arena_floor_tile.png'), createFloorTilePng());
  console.log('Generated static PNG assets in public/assets/{sprites,textures}');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
