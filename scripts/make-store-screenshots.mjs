#!/usr/bin/env node
/**
 * Renders the Chrome Web Store screenshots at the required 1280x800.
 *
 * Every pixel of UI in these images is a real capture of the built extension running in
 * Chromium with `dist/` loaded unpacked — the popup genuinely queried the active tab, and
 * the "with ClearBlock" panels are the page as the content script actually leaves it. The
 * only thing composed afterwards is the framing: panel borders, labels and the drop shadow
 * behind the popup.
 *
 * The page underneath is `fixtures/demo-article.html`, a fictional publication. A store
 * listing should not carry a real newspaper's masthead or articles, and a fixture lets the
 * before/after be an exact like-for-like comparison.
 *
 * Run with: npm run screenshots
 */
import { createServer } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const fixtures = resolve(root, 'fixtures');
const outDir = resolve(root, 'docs/screenshots');

const W = 1280;
const H = 800;
const POPUP_W = 360;
const POPUP_H = 600;
const SETTINGS_KEY = 'clearblock:settings';

if (!existsSync(join(dist, 'manifest.json'))) {
  console.error('screenshots: dist/ is not built — run "npm run build" first.');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript' };

function startServer() {
  const server = createServer((request, response) => {
    const name = (request.url ?? '/').split('?')[0];
    const file = resolve(fixtures, `.${name === '/' ? '/demo-article.html' : name}`);
    if (!file.startsWith(fixtures) || !existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'text/plain' });
    response.end(readFileSync(file));
  });
  return new Promise((done) =>
    server.listen(0, '127.0.0.1', () => done({ server, port: server.address().port })),
  );
}

/** Writes settings the same way the options UI does, so the extension reacts normally. */
async function patchSettings(worker, patch) {
  await worker.evaluate(
    async ({ key, value }) => {
      const stored = (await chrome.storage.local.get(key))[key] ?? {};
      await chrome.storage.local.set({ [key]: { ...stored, ...value } });
    },
    { key: SETTINGS_KEY, value: patch },
  );
  // Give the service worker and every content script a moment to apply it.
  await new Promise((done) => setTimeout(done, 400));
}

const dataUri = (file) => `data:image/png;base64,${readFileSync(file).toString('base64')}`;

/**
 * Renders an HTML composition in Chromium and saves it at exactly 1280x800.
 *
 * The browser context runs at deviceScaleFactor 2 so the captures underneath stay sharp,
 * which means the composition comes out at 2560x1600 and has to be resized. The Chrome Web
 * Store accepts only 1280x800 or 640x400 and rejects anything else, so supersampling and
 * then downscaling is both required and the best-looking option.
 */
async function renderComposition(context, name, html) {
  const page = await context.newPage();
  await page.setViewportSize({ width: W, height: H });
  await page.setContent(html, { waitUntil: 'domcontentloaded' });
  const captured = await page.screenshot({ type: 'png' });
  await page.close();

  const buffer = await sharp(captured)
    .resize(W, H, { fit: 'fill', kernel: 'lanczos3' })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(join(outDir, name), buffer);

  const meta = await sharp(buffer).metadata();
  console.log(
    `screenshots: ${name}  ${meta.width}x${meta.height}  ${(buffer.length / 1024).toFixed(0)}KB`,
  );
}

const FONT = `-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif`;

function popupOverPage({ backdrop, popup, caption }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${W}px;height:${H}px;overflow:hidden;font-family:${FONT}}
    .bg{position:absolute;inset:0;background:url('${backdrop}') center top/cover no-repeat;
        filter:blur(1.5px) saturate(.92) brightness(.96)}
    .veil{position:absolute;inset:0;background:rgba(248,250,252,.42)}
    .popup{position:absolute;top:52px;right:64px;width:${POPUP_W}px;height:${POPUP_H}px;
           border-radius:14px;overflow:hidden;background:#fff;
           box-shadow:0 26px 60px rgba(15,23,42,.30),0 3px 10px rgba(15,23,42,.14)}
    .popup img{display:block;width:${POPUP_W}px;height:${POPUP_H}px}
    .fade{position:absolute;left:0;bottom:0;width:860px;height:360px;
          background:linear-gradient(to top right,rgba(255,255,255,.98) 0%,
                     rgba(255,255,255,.94) 42%,rgba(255,255,255,0) 100%)}
    .cap{position:absolute;left:56px;bottom:56px;max-width:600px}
    .cap h2{font-size:34px;line-height:1.15;letter-spacing:-.9px;color:#0f172a;font-weight:700}
    .cap p{margin-top:10px;font-size:17px;line-height:1.5;color:#475569;font-weight:500}
    .rule{width:52px;height:4px;border-radius:4px;background:#F97316;margin-bottom:18px}
  </style></head><body>
    <div class="bg"></div><div class="veil"></div><div class="fade"></div>
    <div class="popup"><img src="${popup}" alt=""></div>
    <div class="cap"><div class="rule"></div><h2>${caption.title}</h2><p>${caption.body}</p></div>
  </body></html>`;
}

function beforeAfter({ before, after }) {
  const panel = (src, label, tone) => `
    <div class="panel">
      <div class="tag ${tone}">${label}</div>
      <div class="frame"><img src="${src}" alt=""></div>
    </div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${W}px;height:${H}px;overflow:hidden;font-family:${FONT};
              background:linear-gradient(180deg,#fff7ed 0%,#ffffff 60%)}
    .head{text-align:center;padding:30px 0 0}
    .head h1{font-size:31px;letter-spacing:-.8px;color:#0f172a;font-weight:700}
    .head p{margin-top:7px;font-size:15px;color:#64748b;font-weight:500}
    .row{display:flex;gap:64px;justify-content:center;padding:22px 40px 0}
    .panel{width:${(W - 80 - 64) / 2}px}
    .tag{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:700;
         letter-spacing:.06em;text-transform:uppercase;padding:5px 11px;border-radius:999px;
         margin-bottom:11px}
    .tag.off{background:#f1f5f9;color:#64748b;border:1px solid #e2e8f0}
    .tag.on{background:#fff7ed;color:#c2410c;border:1px solid #fed7aa}
    .frame{height:566px;border-radius:12px;overflow:hidden;background:#fff;
           border:1px solid #e2e8f0;box-shadow:0 14px 34px rgba(15,23,42,.10)}
    .frame img{display:block;width:100%}
  </style></head><body>
    <div class="head">
      <h1>The same page, with and without ClearBlock</h1>
      <p>Ad slots are hidden in place — the article keeps its layout</p>
    </div>
    <div class="row">
      ${panel(before, 'ClearBlock paused', 'off')}
      ${panel(after, 'ClearBlock active', 'on')}
    </div>
  </body></html>`;
}

function fullPanel({ shot, caption }) {
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    *{margin:0;padding:0;box-sizing:border-box}
    html,body{width:${W}px;height:${H}px;overflow:hidden;font-family:${FONT};
              background:linear-gradient(160deg,#fff7ed 0%,#ffffff 55%)}
    .head{padding:34px 64px 0}
    .rule{width:52px;height:4px;border-radius:4px;background:#F97316;margin-bottom:16px}
    .head h1{font-size:31px;letter-spacing:-.8px;color:#0f172a;font-weight:700}
    .head p{margin-top:7px;font-size:16px;color:#475569;font-weight:500}
    .shot{margin:24px 64px 0;height:582px;border-radius:14px;overflow:hidden;background:#fff;
          border:1px solid #e2e8f0;box-shadow:0 18px 44px rgba(15,23,42,.12)}
    .shot img{display:block;width:100%}
  </style></head><body>
    <div class="head"><div class="rule"></div><h1>${caption.title}</h1><p>${caption.body}</p></div>
    <div class="shot"><img src="${shot}" alt=""></div>
  </body></html>`;
}

/* ------------------------------------------------------------------ */

const { server, port } = await startServer();
const pageUrl = `http://127.0.0.1:${port}/demo-article.html`;
const profile = mkdtempSync(join(tmpdir(), 'clearblock-shots-'));

const context = await chromium.launchPersistentContext(profile, {
  headless: false,
  viewport: { width: W, height: H },
  deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});

let [worker] = context.serviceWorkers();
if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 });
const extensionId = new URL(worker.url()).host;
console.log(`screenshots: extension loaded (${extensionId})`);

const raw = (name) => join(outDir, `raw-${name}.png`);

try {
  await patchSettings(worker, { enabled: true, allowlistedDomains: [] });

  const site = await context.newPage();
  await site.goto(pageUrl, { waitUntil: 'domcontentloaded' });
  await site.waitForTimeout(700);

  // --- Wide captures of the article, protection on and off -------------------
  await site.screenshot({ path: raw('page-on'), clip: { x: 0, y: 0, width: W, height: H } });

  await patchSettings(worker, { enabled: false });
  await site.reload({ waitUntil: 'domcontentloaded' });
  await site.waitForTimeout(600);
  await site.screenshot({ path: raw('page-off'), clip: { x: 0, y: 0, width: W, height: H } });

  // --- Portrait captures for the before/after panels -------------------------
  const PANEL_W = 560;
  const PANEL_H = 566;
  // Capturing at exactly the panel size puts the sticky footer ad inside the frame, so
  // the before/after shows a second, very visible difference.
  await site.setViewportSize({ width: PANEL_W, height: PANEL_H });
  await site.reload({ waitUntil: 'domcontentloaded' });
  await site.waitForTimeout(900);
  await site.screenshot({ path: raw('panel-off') });

  await patchSettings(worker, { enabled: true });
  await site.reload({ waitUntil: 'domcontentloaded' });
  await site.waitForTimeout(900);
  await site.screenshot({ path: raw('panel-on') });

  await site.setViewportSize({ width: W, height: H });
  await site.reload({ waitUntil: 'domcontentloaded' });
  await site.waitForTimeout(600);
  await site.bringToFront();

  // --- Popup, captured while the article really is the active tab ------------
  // The popup reads chrome.tabs.query({active:true}). Opening it as a background tab
  // leaves the article active, so the panel shows the real site rather than itself.
  const popupUrl = `chrome-extension://${extensionId}/popup.html`;
  const openPopup = async () => {
    const opened = context.waitForEvent('page');
    await worker.evaluate(async (url) => {
      await chrome.tabs.create({ url, active: false });
    }, popupUrl);
    const popup = await opened;
    await popup.waitForLoadState('load');
    await popup.waitForTimeout(900);
    return popup;
  };

  const popupActive = await openPopup();
  await popupActive.screenshot({
    path: raw('popup-active'),
    clip: { x: 0, y: 0, width: POPUP_W, height: POPUP_H },
  });

  // Pausing from inside the popup is the real flow, and it surfaces the reload prompt.
  await popupActive.click('button[role="switch"]#site-toggle');
  await popupActive.waitForTimeout(600);
  await popupActive.screenshot({
    path: raw('popup-paused'),
    clip: { x: 0, y: 0, width: POPUP_W, height: POPUP_H },
  });
  await popupActive.close();

  await patchSettings(worker, { allowlistedDomains: [] });

  // --- Dashboard -------------------------------------------------------------
  const options = await context.newPage();
  await options.setViewportSize({ width: 1180, height: 582 });
  await options.goto(`chrome-extension://${extensionId}/options.html`, {
    waitUntil: 'domcontentloaded',
  });
  await options.waitForTimeout(700);
  await options.screenshot({ path: raw('options-general') });

  await options.click('button:has-text("Allowlist")');
  await options.fill('#allowlist-input', 'example.com');
  await options.click('button:has-text("Add")');
  await options.fill('#allowlist-input', 'news.example.org');
  await options.click('button:has-text("Add")');
  await options.waitForTimeout(500);
  await options.screenshot({ path: raw('options-allowlist') });

  await options.click('button:has-text("Filters")');
  await options.waitForTimeout(400);
  await options.screenshot({ path: raw('options-filters') });

  await options.click('button:has-text("Privacy")');
  await options.waitForTimeout(400);
  await options.screenshot({ path: raw('options-privacy') });
  await options.close();

  await patchSettings(worker, { allowlistedDomains: [] });

  // --- Compose the store assets ---------------------------------------------
  await renderComposition(
    context,
    'store-1-popup-active.png',
    popupOverPage({
      backdrop: dataUri(raw('page-on')),
      popup: dataUri(raw('popup-active')),
      caption: {
        title: 'One click to pause on any site',
        body: 'See what is blocked on the page you are on, and switch protection off for that site alone.',
      },
    }),
  );

  await renderComposition(
    context,
    'store-2-before-after.png',
    beforeAfter({ before: dataUri(raw('panel-off')), after: dataUri(raw('panel-on')) }),
  );

  await renderComposition(
    context,
    'store-3-popup-paused.png',
    popupOverPage({
      backdrop: dataUri(raw('page-off')),
      popup: dataUri(raw('popup-paused')),
      caption: {
        title: 'Paused means paused',
        body: 'ClearBlock stops filtering the site and offers a reload — it never reloads your tab behind your back.',
      },
    }),
  );

  await renderComposition(
    context,
    'store-4-dashboard.png',
    fullPanel({
      shot: dataUri(raw('options-general')),
      caption: {
        title: 'Every layer, under your control',
        body: 'Network blocking, cosmetic filtering, YouTube handling and tracker blocking, each with its own switch.',
      },
    }),
  );

  await renderComposition(
    context,
    'store-5-privacy.png',
    fullPanel({
      shot: dataUri(raw('options-privacy')),
      caption: {
        title: 'No data collection, and the receipts',
        body: 'Every permission is listed with the reason it exists. There is no server, so there is nothing to send.',
      },
    }),
  );

  await renderComposition(
    context,
    'store-6-allowlist.png',
    fullPanel({
      shot: dataUri(raw('options-allowlist')),
      caption: {
        title: 'An allowlist that covers subdomains',
        body: 'Add a site once. Invalid input is rejected rather than quietly saved.',
      },
    }),
  );
} finally {
  await context.close();
  server.close();
  rmSync(profile, { recursive: true, force: true });
}

console.log(`\nscreenshots: written to docs/screenshots/`);
