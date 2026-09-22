/**
 * Rasterises src/assets/icon.svg into the PNG sizes the manifest declares.
 * Run with `npm run icons` after editing the SVG.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(root, 'src/assets/icon.svg'));
const outDir = resolve(root, 'public/icons');
const SIZES = [16, 32, 48, 128];

mkdirSync(outDir, { recursive: true });

for (const size of SIZES) {
  const target = resolve(outDir, `icon-${size}.png`);
  const buffer = await sharp(source, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(target, buffer);
  console.log(`icons: wrote public/icons/icon-${size}.png (${buffer.length} bytes)`);
}
