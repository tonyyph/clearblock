#!/usr/bin/env node
/**
 * Downloads the upstream filter lists into filters/.
 *
 * This runs at BUILD time only. The extension itself never downloads anything — Chrome Web
 * Store policy forbids remotely hosted code, and bundling the compiled output is also what
 * lets ClearBlock work offline. Re-run this when you want to refresh the lists, then run
 * `npm run filters:compile`.
 *
 * Run with: npm run filters:fetch
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'filters');

export const SOURCES = [
  {
    id: 'easylist',
    name: 'EasyList',
    url: 'https://easylist.to/easylist/easylist.txt',
    homepage: 'https://easylist.to/',
    license: 'GPLv3 / CC BY-SA 3.0',
    description: 'The primary community ad-blocking list.',
  },
  {
    id: 'easyprivacy',
    name: 'EasyPrivacy',
    url: 'https://easylist.to/easylist/easyprivacy.txt',
    homepage: 'https://easylist.to/',
    license: 'GPLv3 / CC BY-SA 3.0',
    description: 'Tracking and telemetry endpoints.',
  },
  {
    id: 'abpvn',
    name: 'ABPVN',
    url: 'https://easylist-downloads.adblockplus.org/abpvn.txt',
    homepage: 'https://abpvn.com/',
    license: 'CC BY-SA 3.0',
    description: 'Vietnamese sites, maintained by the ABPVN project.',
  },
];

mkdirSync(outDir, { recursive: true });

for (const source of SOURCES) {
  const response = await fetch(source.url, { redirect: 'follow' });
  if (!response.ok) {
    console.error(`filters: ${source.id} failed with HTTP ${response.status}`);
    process.exit(1);
  }
  const text = await response.text();
  const target = join(outDir, `${source.id}.txt`);
  writeFileSync(target, text, 'utf8');
  const lines = text.split('\n').length;
  console.log(
    `filters: ${source.id.padEnd(12)} ${String(lines).padStart(7)} lines  ${(text.length / 1024).toFixed(0)} kB`,
  );
}

writeFileSync(join(outDir, 'sources.json'), `${JSON.stringify(SOURCES, null, 2)}\n`, 'utf8');
console.log('filters: wrote filters/sources.json');
