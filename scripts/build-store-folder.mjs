#!/usr/bin/env node
/**
 * Assembles the Chrome Web Store submission folder.
 *
 * Everything it copies is a build output or a tracked file in `store/`, so the folder can
 * be deleted and rebuilt at any time and always matches the commit it was built from. It
 * also checks the exact pixel dimensions of every image, because the dashboard rejects a
 * wrong-sized asset only after you have filled in the whole form.
 *
 * Run with: npm run store        (builds everything first)
 *           node scripts/build-store-folder.mjs [target-dir]
 */
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = resolve(root, process.argv[2] ?? '../clearblock-store');

const REPO_URL = 'https://github.com/tonyyph/clearblock';

const dist = join(root, 'dist');
const shots = join(root, 'docs/screenshots');
const manifestPath = join(dist, 'manifest.json');

if (!existsSync(manifestPath)) {
  console.error('store: dist/ is not built — run "npm run build" first.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
const version = manifest.version;
const zipName = `clearblock-${version}-chrome.zip`;
const sourceZip = join(root, 'release', `clearblock-v${version}.zip`);

if (!existsSync(sourceZip)) {
  console.error(`store: ${basename(sourceZip)} is missing — run "npm run zip" first.`);
  process.exit(1);
}

const ruleCount = (manifest.declarative_net_request?.rule_resources ?? []).reduce(
  (total, resource) => total + JSON.parse(readFileSync(join(dist, resource.path), 'utf8')).length,
  0,
);

/* --- Assemble ----------------------------------------------------------- */

rmSync(target, { recursive: true, force: true });
mkdirSync(join(target, 'screenshots'), { recursive: true });

// Chrome writes _metadata/ into any unpacked extension directory it loads. It must not be
// handed to a reviewer as part of the source.
rmSync(join(dist, '_metadata'), { recursive: true, force: true });
cpSync(dist, join(target, 'unpacked-chrome'), { recursive: true });

cpSync(sourceZip, join(target, zipName));
cpSync(join(root, 'public/icons/icon-128.png'), join(target, 'store-icon-128.png'));
cpSync(join(root, 'store/DESCRIPTION.txt'), join(target, 'DESCRIPTION.txt'));
cpSync(join(root, 'PRIVACY.md'), join(target, 'PRIVACY.md'));
cpSync(join(root, 'CHROME_WEB_STORE_CHECKLIST.md'), join(target, 'CHROME_WEB_STORE_CHECKLIST.md'));

const screenshots = readdirSync(shots)
  .filter((name) => /^store-\d+-.*\.png$/.test(name))
  .sort();
for (const name of screenshots) cpSync(join(shots, name), join(target, 'screenshots', name));

const promos = ['promo-small-440x280.png', 'promo-marquee-1400x560.png'];
for (const name of promos) {
  if (!existsSync(join(shots, name))) {
    console.error(`store: ${name} is missing — run "npm run promo" first.`);
    process.exit(1);
  }
  cpSync(join(shots, name), join(target, name));
}

const description = readFileSync(join(root, 'store/DESCRIPTION.txt'), 'utf8').trimEnd();
const sheet = readFileSync(join(root, 'store/PASTE-INTO-DASHBOARD.template.md'), 'utf8')
  .replaceAll('{{ZIP_NAME}}', zipName)
  .replaceAll('{{VERSION}}', version)
  .replaceAll('{{RULE_COUNT}}', String(ruleCount))
  .replaceAll('{{REPO_URL}}', REPO_URL)
  .replaceAll('{{DESCRIPTION_CHARS}}', description.length.toLocaleString('en-US'))
  .replaceAll('{{DESCRIPTION}}', description);
writeFileSync(join(target, 'PASTE-INTO-DASHBOARD.md'), sheet, 'utf8');

/* --- Verify ------------------------------------------------------------- */

const problems = [];

async function expectSize(file, width, height) {
  const meta = await sharp(file).metadata();
  if (meta.width !== width || meta.height !== height) {
    problems.push(`${basename(file)} is ${meta.width}x${meta.height}, expected ${width}x${height}`);
  }
}

await expectSize(join(target, 'store-icon-128.png'), 128, 128);
await expectSize(join(target, 'promo-small-440x280.png'), 440, 280);
await expectSize(join(target, 'promo-marquee-1400x560.png'), 1400, 560);
for (const name of screenshots) {
  await expectSize(join(target, 'screenshots', name), 1280, 800);
}

if (screenshots.length === 0) {
  problems.push('no screenshots found — run "npm run screenshots" first');
}
if (description.length > 16000) {
  problems.push(`DESCRIPTION.txt is ${description.length} chars, over the 16,000 limit`);
}
if ((manifest.description ?? '').length > 132) {
  problems.push('manifest description is over the 132-char summary limit');
}

if (problems.length > 0) {
  console.error(`\nstore: ${problems.length} problem(s) with the assembled folder:`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

/* --- Report ------------------------------------------------------------- */

const size = (file) => `${(statSync(file).size / 1024).toFixed(0)} kB`;

console.log(`\nstore: assembled ${target}\n`);
console.log(`  ${zipName.padEnd(34)} ${size(join(target, zipName))}   <- upload this`);
console.log(`  unpacked-chrome/${''.padEnd(18)} the same build, unzipped`);
console.log(`  PASTE-INTO-DASHBOARD.md${''.padEnd(11)} every field, ready to paste`);
console.log(`  DESCRIPTION.txt${''.padEnd(19)} ${description.length} chars`);
console.log(`  PRIVACY.md, CHROME_WEB_STORE_CHECKLIST.md`);
console.log(`  store-icon-128.png, promo-small-440x280.png, promo-marquee-1400x560.png`);
console.log(`  screenshots/${''.padEnd(22)} ${screenshots.length} x 1280x800`);
console.log(`\nstore: version ${version}, ${ruleCount} bundled rules, all asset sizes verified.`);
