/**
 * Validates the built extension in dist/ the way a Chrome Web Store reviewer would:
 * manifest shape, declared files actually existing, no banned APIs, and no permission
 * that the source does not use.
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const errors = [];
const warnings = [];

if (!existsSync(dist)) {
  console.error('manifest: dist/ does not exist — run "npm run build" first.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf8'));

const required = ['manifest_version', 'name', 'version', 'description', 'icons', 'action'];
for (const key of required) {
  if (manifest[key] === undefined) errors.push(`missing required key "${key}"`);
}

if (manifest.manifest_version !== 3) errors.push('manifest_version must be 3');
if (!/^\d+(\.\d+){0,3}$/.test(manifest.version ?? '')) {
  errors.push(`version "${manifest.version}" is not a valid Chrome extension version`);
}
if ((manifest.description ?? '').length > 132) {
  errors.push('description must be 132 characters or fewer for the Web Store listing');
}
if (manifest.background?.service_worker === undefined) {
  errors.push('no service worker declared');
}
if (manifest.background?.type !== 'module') {
  warnings.push('service worker is not declared as an ES module');
}

/** Every path the manifest points at must exist in the build output. */
const declaredFiles = [
  manifest.background?.service_worker,
  manifest.action?.default_popup,
  manifest.options_page,
  ...Object.values(manifest.icons ?? {}),
  ...Object.values(manifest.action?.default_icon ?? {}),
  ...(manifest.content_scripts ?? []).flatMap((entry) => [
    ...(entry.js ?? []),
    ...(entry.css ?? []),
  ]),
  ...(manifest.declarative_net_request?.rule_resources ?? []).map((entry) => entry.path),
].filter(Boolean);

for (const file of new Set(declaredFiles)) {
  if (!existsSync(resolve(dist, file))) errors.push(`declared file is missing from dist: ${file}`);
}

/** Rulesets must parse and stay under Chrome's per-extension static rule budget. */
let staticRuleTotal = 0;
for (const resource of manifest.declarative_net_request?.rule_resources ?? []) {
  const path = resolve(dist, resource.path);
  if (!existsSync(path)) continue;
  try {
    const rules = JSON.parse(readFileSync(path, 'utf8'));
    staticRuleTotal += rules.length;
  } catch (error) {
    errors.push(`${resource.path}: ${error.message}`);
  }
}
// Chrome's guaranteed minimum for enabled static rules across all rulesets.
if (staticRuleTotal > 30000) errors.push(`too many static rules: ${staticRuleTotal}`);

/** Banned by Chrome Web Store policy / MV3. */
const banned = [
  { pattern: /\beval\s*\(/, label: 'eval()' },
  { pattern: /new\s+Function\s*\(/, label: 'new Function()' },
  { pattern: /https?:\/\/[^"'\s)]*\.js["'\s)]/, label: 'remote script URL' },
  { pattern: /chrome\.webRequest\b/, label: 'chrome.webRequest' },
];

function walk(dir) {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}

for (const file of walk(dist).filter((f) => f.endsWith('.js'))) {
  const source = readFileSync(file, 'utf8');
  for (const rule of banned) {
    if (rule.pattern.test(source)) {
      errors.push(`${file.replace(`${dist}/`, '')}: contains ${rule.label}`);
    }
  }
}

/** Every declared permission must be used somewhere in the source. */
const sourceText = walk(resolve(root, 'src'))
  .filter((f) => /\.tsx?$/.test(f))
  .map((f) => readFileSync(f, 'utf8'))
  .join('\n');

const PERMISSION_USAGE = {
  storage: /chrome\.storage\./,
  activeTab: /getMatchedRules|chrome\.tabs\.query/,
  tabs: /chrome\.tabs\./,
  declarativeNetRequest: /chrome\.declarativeNetRequest\./,
  declarativeNetRequestFeedback: /getMatchedRules/,
  alarms: /chrome\.alarms\./,
  scripting: /chrome\.scripting\./,
  notifications: /chrome\.notifications\./,
};

for (const permission of [
  ...(manifest.permissions ?? []),
  ...(manifest.optional_permissions ?? []),
]) {
  const probe = PERMISSION_USAGE[permission];
  if (!probe) {
    warnings.push(`permission "${permission}" has no usage check defined`);
    continue;
  }
  if (!probe.test(sourceText)) {
    errors.push(`permission "${permission}" is declared but never used in src/`);
  }
}

if (warnings.length > 0) {
  console.warn('\nmanifest: warnings');
  for (const warning of warnings) console.warn(`  - ${warning}`);
}

if (errors.length > 0) {
  console.error(`\nManifest validation failed (${errors.length} problem(s)):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

console.log(
  `manifest: OK — MV3, v${manifest.version}, ${staticRuleTotal} static rules, ${declaredFiles.length} declared files present.`,
);
