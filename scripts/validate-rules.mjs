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

    // resourceTypes may be omitted: DNR then matches every type except main_frame, which
    // is exactly the safe default for a converted Adblock Plus filter that named no type.
    if (condition.resourceTypes !== undefined) {
      if (!Array.isArray(condition.resourceTypes) || condition.resourceTypes.length === 0) {
        errors.push(`${at}: condition.resourceTypes, when present, must be a non-empty array`);
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
    }
    if (Array.isArray(condition.excludedResourceTypes)) {
      for (const type of condition.excludedResourceTypes) {
        if (!VALID_RESOURCE_TYPES.has(type)) {
          errors.push(`${at}: unsupported excludedResourceType "${type}"`);
        }
      }
    }
    if (rule.action?.type === 'allowAllRequests') {
      const types = condition.resourceTypes ?? [];
      if (!types.includes('main_frame') && !types.includes('sub_frame')) {
        errors.push(`${at}: allowAllRequests requires main_frame or sub_frame`);
      }
    }

    // `||` is DNR's domain anchor and must be followed by a hostname. Chrome does not
    // reject a malformed one — it hangs indexing the ruleset and the browser never starts,
    // so this check is the difference between a failed build and a bricked browser.
    if (typeof condition.urlFilter === 'string') {
      const filter = condition.urlFilter;
      if (filter.startsWith('||') && !/^\|\|[a-z0-9]/i.test(filter)) {
        errors.push(`${at}: malformed domain anchor in urlFilter "${filter}"`);
      }
      if (/[^|]\|(?!$)/.test(filter.slice(2))) {
        errors.push(`${at}: "|" may only appear at the start or end of a urlFilter`);
      }

      if (!/^[\x20-\x7E]*$/.test(filter)) {
        errors.push(`${at}: urlFilter must be ASCII`);
      }
    }

    // A rule is acceptably scoped if it names the request's domain, names the sites it
    // applies to, or carries a URL pattern with real substance. A wildcard urlFilter is
    // fine when `initiatorDomains` confines it to named sites.
    const hasRequestDomain =
      Array.isArray(condition.requestDomains) && condition.requestDomains.length > 0;
    const hasInitiatorDomain =
      Array.isArray(condition.initiatorDomains) && condition.initiatorDomains.length > 0;
    const hasFilter =
      typeof condition.urlFilter === 'string' && condition.urlFilter.replace(/\*/g, '').length >= 4;
    const hasRegex = typeof condition.regexFilter === 'string';

    if (!hasRequestDomain && !hasInitiatorDomain && !hasFilter && !hasRegex) {
      errors.push(
        `${at}: rule is too broad — needs requestDomains, initiatorDomains or a specific urlFilter`,
      );
    }

    if (hasRequestDomain) {
      for (const domain of condition.requestDomains) {
        if (typeof domain !== 'string' || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain)) {
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

const total = Object.values(counts).reduce((sum, n) => sum + n, 0);

if (errors.length > 0) {
  console.error(`\nRule validation failed (${errors.length} problem(s)):`);
  // Group by message shape so one systematic mistake does not print 28,000 lines.
  const byKind = new Map();
  for (const error of errors) {
    const kind = error.replace(/\[\d+\]/, '[]').replace(/"[^"]*"/g, '"…"');
    const list = byKind.get(kind) ?? [];
    list.push(error);
    byKind.set(kind, list);
  }
  for (const [kind, list] of byKind) {
    console.error(`  - ${kind}  (${list.length}x)`);
    for (const example of list.slice(0, 3)) console.error(`      e.g. ${example}`);
  }
  process.exit(1);
}

if (total > 30000) {
  console.error(
    `\nRule validation failed: ${total} rules exceeds Chrome's 30,000 enabled static rule limit.`,
  );
  process.exit(1);
}

console.log(`rules: OK — ${files.length} ruleset(s), ${total} rules, all IDs unique and in range.`);
