/**
 * Development watcher.
 *
 * Runs one full build, then keeps two Vite watchers alive — the extension needs two build
 * passes (ESM pages + worker, IIFE content script) — and re-copies the static files
 * whenever the manifest or a ruleset changes.
 *
 * Chrome still needs the reload button on chrome://extensions after a content-script or
 * service-worker rebuild; popup and options pages only need to be reopened.
 */
import { spawn, spawnSync } from 'node:child_process';
import { watch } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const run = (command, args) => spawnSync(command, args, { cwd: root, stdio: 'inherit' });

console.log('dev: initial build...');
if (run('npm', ['run', 'build']).status !== 0) process.exit(1);

const children = [
  spawn('npx', ['vite', 'build', '--watch'], { cwd: root, stdio: 'inherit' }),
  spawn('npx', ['vite', 'build', '--config', 'vite.content.config.ts', '--watch'], {
    cwd: root,
    stdio: 'inherit',
  }),
];

let staticTimer = null;
const rebuildStatic = () => {
  if (staticTimer) clearTimeout(staticTimer);
  staticTimer = setTimeout(() => run('node', ['scripts/build-static.mjs']), 150);
};

watch(resolve(root, 'manifest.json'), rebuildStatic);
watch(resolve(root, 'src/rules'), rebuildStatic);

console.log('\ndev: watching. Load dist/ at chrome://extensions and reload after a rebuild.\n');

const shutdown = () => {
  for (const child of children) child.kill();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
