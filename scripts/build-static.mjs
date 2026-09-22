/**
 * Copies the non-bundled part of the extension into dist/ and keeps the manifest version
 * in lockstep with package.json, so a release can never ship a mismatched version.
 */
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');

const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'));
const manifest = JSON.parse(readFileSync(resolve(root, 'manifest.json'), 'utf8'));

if (manifest.version !== pkg.version) {
  console.log(`static: manifest version ${manifest.version} -> ${pkg.version}`);
}
manifest.version = pkg.version;

mkdirSync(dist, { recursive: true });
writeFileSync(resolve(dist, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log('static: wrote dist/manifest.json');

const rulesSource = resolve(root, 'src/rules');
const rulesTarget = resolve(dist, 'rules');
mkdirSync(rulesTarget, { recursive: true });

for (const entry of readdirSync(rulesSource)) {
  // metadata.json is bundled into the service worker, not shipped as a DNR resource.
  if (!entry.endsWith('.json') || entry === 'metadata.json') continue;
  copyFileSync(resolve(rulesSource, entry), resolve(rulesTarget, entry));
  console.log(`static: copied rules/${entry}`);
}
