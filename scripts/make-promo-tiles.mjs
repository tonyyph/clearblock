#!/usr/bin/env node
/**
 * Renders the Chrome Web Store promo tiles.
 *
 *   small promo tile   440x280   (the listing tile — the one that matters)
 *   marquee promo tile 1400x560  (only used if Google features the extension, but it has
 *                                 to exist for the listing to be eligible)
 *
 * Rendered in Chromium rather than rasterised from SVG: sharp's SVG backend resolves fonts
 * through fontconfig and substitutes silently, which is the kind of thing you notice only
 * after uploading. The mark is inlined from scripts/icon-artwork.mjs, so the tile shows the
 * same artwork as the packaged icons rather than a redraw of it.
 *
 * Run with: npm run promo
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import {
  DEFAULT_MARK,
  MARK_CENTER,
  MARK_COLOR,
  SHIELD_DARK,
  SHIELD_LIGHT,
  SHIELD_PATH,
  SHIELD_RIGHT_PATH,
} from './icon-artwork.mjs';

const MARK = { ...MARK_CENTER, ...DEFAULT_MARK };

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs/screenshots');

const reach = MARK.radius / Math.SQRT2;
const markSvg = (size) => `
  <svg class="mark" width="${size}" height="${size}" viewBox="0 0 512 512" aria-hidden="true">
    <path d="${SHIELD_PATH}" fill="${SHIELD_LIGHT}"/>
    <path d="${SHIELD_RIGHT_PATH}" fill="${SHIELD_DARK}"/>
    <g stroke="${MARK_COLOR}" fill="none">
      <circle cx="${MARK.x}" cy="${MARK.y}" r="${MARK.radius}" stroke-width="${MARK.ringStroke}"/>
      <path d="M${(MARK.x - reach).toFixed(2)} ${(MARK.y - reach).toFixed(2)} L${(
        MARK.x + reach
      ).toFixed(2)} ${(MARK.y + reach).toFixed(2)}" stroke-width="${MARK.slashStroke}"/>
    </g>
  </svg>`;

/** A faint outline of the same silhouette, used as background texture. */
const ghostShield = (cls) => `
  <svg class="ghost ${cls}" viewBox="0 0 512 512" aria-hidden="true">
    <path d="${SHIELD_PATH}" fill="none" stroke="rgba(255,255,255,0.22)" stroke-width="16"/>
  </svg>`;

function tile({ width, height, scale }) {
  const px = (n) => `${(n * scale).toFixed(2)}px`;
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:${width}px;height:${height}px;overflow:hidden}
  body{
    display:flex;align-items:center;gap:${px(22)};padding:0 ${px(28)};
    font-family:ui-sans-serif,system-ui,-apple-system,'Helvetica Neue',Arial,sans-serif;
    background:
      radial-gradient(120% 140% at 86% 6%, rgba(255,255,255,.22) 0%, rgba(255,255,255,0) 58%),
      linear-gradient(135deg,#F97316 0%,#F97316 38%,#EA580C 100%);
    position:relative;
  }
  .ghost{position:absolute;opacity:.85}
  .g1{width:${px(190)};height:${px(190)};right:${px(-34)};top:${px(-26)};transform:rotate(12deg)}
  .g2{width:${px(140)};height:${px(140)};right:${px(64)};bottom:${px(-40)};transform:rotate(-8deg)}
  .chip{
    width:${px(90)};height:${px(90)};flex:0 0 auto;border-radius:${px(22)};
    background:#fff;display:flex;align-items:center;justify-content:center;
    box-shadow:0 ${px(7)} ${px(18)} rgba(15,23,42,.28);position:relative;z-index:1;
  }
  .mark{width:${px(66)};height:${px(66)};display:block}
  .copy{position:relative;z-index:1}
  h1{color:#fff;font-size:${px(40)};line-height:1.02;letter-spacing:${px(-1.3)};
     font-weight:700;white-space:nowrap}
  p{color:rgba(255,255,255,.92);font-size:${px(14)};font-weight:600;white-space:nowrap;
    margin-top:${px(9)};letter-spacing:${px(-0.1)}}
  .rule{width:${px(42)};height:${px(3)};border-radius:${px(3)};
        background:rgba(255,255,255,.58);margin-top:${px(13)}}
</style></head>
<body>
  ${ghostShield('g1')}
  ${ghostShield('g2')}
  <div class="chip">${markSvg(66 * scale)}</div>
  <div class="copy">
    <h1>ClearBlock</h1>
    <p>Block ads. Keep your privacy.</p>
    <div class="rule"></div>
  </div>
</body></html>`;
}

const TILES = [
  { name: 'promo-small-440x280.png', width: 440, height: 280, scale: 1 },
  { name: 'promo-marquee-1400x560.png', width: 1400, height: 560, scale: 2.6 },
];

await mkdir(outDir, { recursive: true });
const browser = await chromium.launch();

try {
  for (const spec of TILES) {
    const context = await browser.newContext({
      viewport: { width: spec.width, height: spec.height },
      deviceScaleFactor: 1,
    });
    const page = await context.newPage();
    await page.setContent(tile(spec), { waitUntil: 'load' });
    const buffer = await page.screenshot({ type: 'png' });
    await writeFile(join(outDir, spec.name), buffer);
    await context.close();
    console.log(
      `promo: ${spec.name}  ${spec.width}x${spec.height}  ${(buffer.length / 1024).toFixed(0)}KB`,
    );
  }
} finally {
  await browser.close();
}
