/**
 * Validates the static declarativeNetRequest rulesets before they can ship:
 *  - each file is valid JSON and an array of rule objects;
 *  - rule IDs are unique within a file AND across every file (Chrome scopes IDs per
 *    ruleset, but a global collision would still make debugging miserable);
 *  - every rule has id / priority / action / condition with a supported shape;
 *  - resourceTypes are restricted and never include main_frame for a block rule;
 *  - no rule is dangerously broad (a bare "*" urlFilter with no domain condition);
 *  - src/rules/metadata.json matches the real rule counts.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const rulesDir = resolve(root, 'src/rules');

const VALID_ACTIONS = new Set([
  'block',
  'allow',
  'allowAllRequests',
  'redirect',
  'upgradeScheme',
  'modifyHeaders',
]);

const VALID_RESOURCE_TYPES = new Set([
  'main_frame',
  'sub_frame',
  'stylesheet',
  'script',
  'image',
  'font',
  'object',
  'xmlhttprequest',
  'ping',
  'csp_report',
  'media',
  'websocket',
  'other',
]);

const errors = [];
const seenIds = new Map();
const counts = {};

const files = readdirSync(rulesDir).filter((f) => f.endsWith('.json') && f !== 'metadata.json');
if (files.length === 0) errors.push('no ruleset files found in src/rules');

for (const file of files) {
  const label = `rules/${file}`;
  let rules;
  try {
    rules = JSON.parse(readFileSync(resolve(rulesDir, file), 'utf8'));
  } catch (error) {
    errors.push(`${label}: not valid JSON (${error.message})`);
    continue;
  }

  if (!Array.isArray(rules)) {
    errors.push(`${label}: expected an array of rules`);
    continue;
  }
  counts[file.replace(/\.json$/, '')] = rules.length;

  const idsInFile = new Set();

  rules.forEach((rule, index) => {
    const at = `${label}[${index}]`;

    if (!Number.isInteger(rule.id) || rule.id < 1) {
      errors.push(`${at}: id must be a positive integer`);
    } else {
      if (idsInFile.has(rule.id)) errors.push(`${at}: duplicate id ${rule.id} within the file`);
      idsInFile.add(rule.id);
      const owner = seenIds.get(rule.id);
      if (owner && owner !== file) {
        errors.push(`${at}: id ${rule.id} also used by ${owner}`);
      }
      seenIds.set(rule.id, file);
    }

    if (!Number.isInteger(rule.priority) || rule.priority < 1) {
      errors.push(`${at}: priority must be a positive integer`);
    }

    if (!rule.action || typeof rule.action !== 'object') {
      errors.push(`${at}: missing action`);
    } else if (!VALID_ACTIONS.has(rule.action.type)) {
      errors.push(`${at}: unknown action type "${rule.action.type}"`);
    }

    const condition = rule.condition;
    if (!condition || typeof condition !== 'object') {
      errors.push(`${at}: missing condition`);
      return;
    }

    if (!Array.isArray(condition.resourceTypes) || condition.resourceTypes.length === 0) {
      errors.push(`${at}: condition.resourceTypes must be a non-empty array`);
    } else {
      for (const type of condition.resourceTypes) {
        if (!VALID_RESOURCE_TYPES.has(type)) {
          errors.push(`${at}: unsupported resourceType "${type}"`);
        }
      }
      if (rule.action?.type === 'block' && condition.resourceTypes.includes('main_frame')) {
        errors.push(`${at}: block rules must not target main_frame (it breaks navigation)`);
      }
    }

    const hasDomain =
      Array.isArray(condition.requestDomains) && condition.requestDomains.length > 0;
    const hasFilter =
      typeof condition.urlFilter === 'string' && condition.urlFilter.replace(/\*/g, '').length >= 4;

    if (!hasDomain && !hasFilter) {
      errors.push(`${at}: rule is too broad — needs requestDomains or a specific urlFilter`);
    }

    if (hasDomain) {
      for (const domain of condition.requestDomains) {
        if (typeof domain !== 'string' || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) {
          errors.push(`${at}: invalid requestDomain "${domain}"`);
        }
      }
    }
  });
}

// metadata.json must describe what is actually in the files.
try {
  const metadata = JSON.parse(readFileSync(resolve(rulesDir, 'metadata.json'), 'utf8'));
  for (const entry of metadata) {
    if (counts[entry.id] === undefined) {
      errors.push(`metadata.json: unknown ruleset "${entry.id}"`);
    } else if (counts[entry.id] !== entry.ruleCount) {
      errors.push(
        `metadata.json: ${entry.id} says ${entry.ruleCount} rules, file has ${counts[entry.id]} — run "npm run rules"`,
      );
    }
  }
  for (const id of Object.keys(counts)) {
    if (!metadata.some((entry) => entry.id === id)) {
      errors.push(`metadata.json: missing entry for ruleset "${id}"`);
    }
  }
} catch (error) {
  errors.push(`metadata.json: ${error.message}`);
}

if (errors.length > 0) {
  console.error(`\nRule validation failed (${errors.length} problem(s)):`);
  for (const error of errors) console.error(`  - ${error}`);
  process.exit(1);
}

const total = Object.values(counts).reduce((sum, n) => sum + n, 0);
console.log(`rules: OK — ${files.length} ruleset(s), ${total} rules, all IDs unique and in range.`);
