/**
 * Packages dist/ into release/clearblock-v<version>.zip, ready to upload to the
 * Chrome Web Store. The archive is built from the build output only — no sources, no
 * node_modules, no dotfiles.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const releaseDir = resolve(root, 'release');

if (!existsSync(resolve(dist, 'manifest.json'))) {
  console.error('zip: dist/ is not built — run "npm run build" first.');
  process.exit(1);
}

const { version } = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'));
const target = resolve(releaseDir, `clearblock-v${version}.zip`);

mkdirSync(releaseDir, { recursive: true });
rmSync(target, { force: true });

// Chrome writes `_metadata/` into an unpacked extension directory when it loads one
// (e.g. during the e2e run). It must never end up in an uploaded archive.
rmSync(resolve(dist, '_metadata'), { recursive: true, force: true });

try {
  // -r recursive, -X drops macOS extra attributes, -q quiet.
  execFileSync(
    'zip',
    ['-r', '-X', '-q', target, '.', '-x', '_metadata/*', '.DS_Store', '*/.DS_Store'],
    {
      cwd: dist,
      stdio: 'inherit',
    },
  );
} catch (error) {
  console.error(`zip: failed to create the archive (${error.message}).`);
  console.error('zip: install the "zip" command, or compress dist/ manually.');
  process.exit(1);
}

const size = statSync(target).size;
console.log(`zip: ${target.replace(`${root}/`, '')} (${(size / 1024).toFixed(1)} kB)`);
