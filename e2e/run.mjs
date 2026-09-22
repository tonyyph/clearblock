/**
 * End-to-end check of the built extension in a real Chromium.
 *
 * Loads dist/ as an unpacked extension, serves the cosmetic fixture over http (content
 * scripts do not run on file:// URLs), and verifies the behaviour a user would see.
 *
 * Deliberately NOT tested here: real YouTube ads. Ad delivery is non-deterministic, so a
 * test that depends on it is a test that fails for reasons unrelated to this code. The
 * YouTube module is covered by fixtures/youtube-ad.html in the unit suite instead.
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDir = resolve(root, 'dist');
const fixturesDir = resolve(root, 'fixtures');

if (!existsSync(join(distDir, 'manifest.json'))) {
  console.error('e2e: dist/ is not built — run "npm run build" first.');
  process.exit(1);
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };

function startServer() {
  const server = createServer((request, response) => {
    const name = (request.url ?? '/').split('?')[0];
    const file = resolve(fixturesDir, `.${name === '/' ? '/test-page.html' : name}`);
    if (!file.startsWith(fixturesDir) || !existsSync(file)) {
      response.writeHead(404).end('not found');
      return;
    }
    response.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'text/plain' });
    response.end(readFileSync(file));
  });
  return new Promise((done) => {
    server.listen(0, '127.0.0.1', () => done({ server, port: server.address().port }));
  });
}

async function launch(profileDir, headless) {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless,
    args: [`--disable-extensions-except=${distDir}`, `--load-extension=${distDir}`],
  });
  let [worker] = context.serviceWorkers();
  if (!worker) {
    worker = await context.waitForEvent('serviceworker', { timeout: 15_000 }).catch(() => null);
  }
  return { context, worker };
}

const results = [];
async function step(name, run) {
  try {
    await run();
    results.push({ name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.error(`  ✗ ${name}\n      ${error.message}`);
  }
}

const isHidden = (page, testId) =>
  page.evaluate((id) => {
    const element = document.querySelector(`[data-testid="${id}"]`);
    if (!element) return 'missing';
    return getComputedStyle(element).display === 'none';
  }, testId);

const { server, port } = await startServer();
const pageUrl = `http://127.0.0.1:${port}/test-page.html`;
const profileDir = mkdtempSync(join(tmpdir(), 'clearblock-e2e-'));

let launched = await launch(profileDir, true);
if (!launched.worker) {
  console.log('e2e: headless run could not start the service worker; retrying headed.');
  await launched.context.close();
  launched = await launch(profileDir, false);
}

const { context, worker } = launched;
assert.ok(worker, 'the extension service worker never started');
const extensionId = new URL(worker.url()).host;
console.log(`e2e: extension loaded (${extensionId})\n`);

try {
  const page = await context.newPage();
  await page.goto(pageUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(600);

  await step('ad elements are hidden on a normal site', async () => {
    for (const id of ['ad-banner', 'ad-token', 'advertisement', 'gpt-ad', 'data-ad-slot']) {
      assert.equal(await isHidden(page, id), true, `${id} should be hidden`);
    }
  });

  await step('look-alike elements are not hidden', async () => {
    for (const id of ['header', 'shadow', 'adapter', 'gradient', 'download', 'badge']) {
      assert.equal(await isHidden(page, id), false, `${id} must stay visible`);
    }
  });

  await step('dynamically inserted ads are hidden too', async () => {
    await page.click('#inject');
    await page.waitForTimeout(400);
    assert.equal(await isHidden(page, 'dynamic-ad-1'), true);
    assert.equal(await isHidden(page, 'dynamic-content-1'), false);
  });

  await step('the popup renders with the current site', async () => {
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await popup.waitForSelector('text=ClearBlock');
    assert.ok(await popup.isVisible('.popup__stats'));
    await popup.close();
  });

  await step('allowlisting a site restores its ads after a reload', async () => {
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.click('button:has-text("Allowlist")');
    await options.fill('#allowlist-input', '127.0.0.1');
    await options.click('button:has-text("Add")');
    await options.waitForSelector('.allowlist__domain');
    await options.close();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    assert.equal(await isHidden(page, 'ad-banner'), false, 'ads must reappear when allowlisted');
  });

  await step('settings survive a reload of the options page', async () => {
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    await options.click('button[role="switch"][id="setting-cosmetic"]');
    await options.waitForTimeout(300);
    await options.reload();
    await options.waitForSelector('#setting-cosmetic');
    const checked = await options.getAttribute('#setting-cosmetic', 'aria-checked');
    assert.equal(checked, 'false', 'the cosmetic filtering switch must stay off');
    await options.close();
  });

  await step('removing the allowlist entry re-enables blocking', async () => {
    const options = await context.newPage();
    await options.goto(`chrome-extension://${extensionId}/options.html`);
    // Turn cosmetic filtering back on, then drop the allowlist entry.
    await options.click('button[role="switch"][id="setting-cosmetic"]');
    await options.click('button:has-text("Allowlist")');
    await options.click('.allowlist__item .icon-button');
    await options.waitForTimeout(300);
    await options.close();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    assert.equal(await isHidden(page, 'ad-banner'), true);
  });
} finally {
  await context.close();
  server.close();
  rmSync(profileDir, { recursive: true, force: true });
}

const failed = results.filter((result) => !result.ok);
console.log(`\ne2e: ${results.length - failed.length}/${results.length} checks passed.`);
process.exit(failed.length === 0 ? 0 : 1);
