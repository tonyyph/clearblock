#!/usr/bin/env node
/**
 * Compiles the downloaded Adblock Plus lists in filters/ into declarativeNetRequest
 * rulesets plus a cosmetic-selector table, both bundled into the extension.
 *
 * Why this exists: a hand-curated domain list cannot block real-world advertising. The
 * networks rotate, and regional sites use private ad servers that no generic list of
 * "known ad companies" will ever name. The community lists do name them.
 *
 * Nothing here runs at extension runtime — this is a build step, and the extension ships
 * only the compiled output. That keeps it inside Chrome's ban on remotely hosted code and
 * is also why ClearBlock works with no network connection.
 *
 * Run with: npm run filters:compile
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  convertNetworkFilter,
  createStats,
  isComment,
  looksCosmetic,
  parseCosmeticFilter,
} from './lib/abp-parser.mjs';
import {
  AD_DOMAINS,
  ANNOYANCE_DOMAINS,
  TRACKER_DOMAINS,
  TRACKER_URL_RULES,
  curatedRules,
} from './lib/curated-filters.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const filtersDir = join(root, 'filters');
const rulesDir = join(root, 'src/rules');

/**
 * Chrome guarantees 30,000 enabled static rules per extension and will refuse to load a
 * ruleset that pushes the total past it. The budget below leaves room for the curated
 * rules and a margin.
 */
const ENABLED_RULE_BUDGET = 29_000;

const TARGETS = [
  {
    id: 'ads',
    source: 'easylist',
    idBase: 1_000_000,
    weight: 0.62,
    curated: curatedRules(AD_DOMAINS),
  },
  {
    id: 'trackers',
    source: 'easyprivacy',
    idBase: 2_000_000,
    weight: 0.38,
    curated: curatedRules(TRACKER_DOMAINS, TRACKER_URL_RULES),
  },
  // Curated only: there is no upstream annoyances list bundled, and blocking cookie
  // banners or consent platforms wholesale breaks more than it fixes.
  {
    id: 'annoyances',
    idBase: 3_000_000,
    weight: 0,
    reserved: true,
    curated: curatedRules(ANNOYANCE_DOMAINS),
    description: 'Push-notification nags, popups and email-capture overlays.',
  },
  // Regional lists are small and disproportionately useful: they name the private ad
  // servers that generic lists never will. Never trimmed.
  { id: 'regional-vi', source: 'abpvn', idBase: 4_000_000, weight: 0, reserved: true },
];

const sources = JSON.parse(readFileSync(join(filtersDir, 'sources.json'), 'utf8'));

/** Deduplicates rules that differ only by id. */
const keyOf = (rule) => JSON.stringify([rule.action, rule.condition]);

const cosmetic = { generic: new Set(), specific: new Map(), exceptions: new Map() };
const report = [];

function addSpecific(map, domain, selector) {
  const list = map.get(domain) ?? new Set();
  list.add(selector);
  map.set(domain, list);
}

function compileSource(target) {
  if (!target.source) {
    report.push({ target, stats: createStats(), proceduralSkipped: 0 });
    return [];
  }
  const file = join(filtersDir, `${target.source}.txt`);
  if (!existsSync(file)) {
    console.error(`filters: ${target.source}.txt is missing — run "npm run filters:fetch".`);
    process.exit(1);
  }

  const stats = createStats();
  const seen = new Set();
  const rules = [];
  let proceduralSkipped = 0;

  for (const raw of readFileSync(file, 'utf8').split('\n')) {
    const line = raw.trim();
    stats.lines += 1;
    if (!line || isComment(line)) {
      stats.comments += 1;
      continue;
    }

    if (looksCosmetic(line)) {
      stats.cosmetic += 1;
      const rule = parseCosmeticFilter(line);
      if (!rule) continue;
      if (rule.isProcedural) {
        // :has-text(), :xpath() and friends need a JS engine evaluating them continuously.
        // ClearBlock uses a plain stylesheet, so these are dropped rather than faked.
        proceduralSkipped += 1;
        continue;
      }
      if (rule.isException) {
        for (const domain of rule.domains) addSpecific(cosmetic.exceptions, domain, rule.selector);
        continue;
      }
      if (rule.domains.length === 0) cosmetic.generic.add(rule.selector);
      else for (const domain of rule.domains) addSpecific(cosmetic.specific, domain, rule.selector);
      continue;
    }

    stats.network += 1;
    const rule = convertNetworkFilter(line, stats);
    if (!rule) continue;
    const key = keyOf(rule);
    if (seen.has(key)) continue;
    seen.add(key);
    rules.push(rule);
  }

  report.push({ target, stats, proceduralSkipped });
  return rules;
}

/* --- compile ------------------------------------------------------------ */

const compiled = TARGETS.map((target) => {
  const upstream = compileSource(target);
  const seen = new Set(upstream.map(keyOf));
  // Curated rules go first so they survive any trimming: they are the vetted baseline.
  const curated = (target.curated ?? []).filter((rule) => !seen.has(keyOf(rule)));
  return { target, curated, rules: [...curated, ...upstream] };
});

const totalProduced = compiled.reduce((sum, entry) => sum + entry.rules.length, 0);

/**
 * Ranks a rule by how much blocking power it carries per slot, used when the lists have
 * to be trimmed to fit Chrome's enabled-rule ceiling. Truncating in file order would throw
 * away high-value rules purely because of where they happen to sit in the list.
 */
function value(rule) {
  if (rule.action.type !== 'block') return 0; // exceptions first: dropping one breaks a site
  const c = rule.condition;
  if (c.requestDomains) return 1; // blocks an entire ad domain — the broadest rule there is
  if (c.initiatorDomains) return 2; // scoped to named sites, so precise and safe
  if (c.urlFilter && c.urlFilter.startsWith('||')) return 3; // domain-anchored path rule
  return 4; // loose path/substring patterns
}

const reserved = compiled
  .filter((entry) => entry.target.reserved)
  .reduce((sum, entry) => sum + entry.rules.length, 0);
const trimmable = ENABLED_RULE_BUDGET - reserved;

for (const entry of compiled) {
  if (entry.target.reserved) continue;
  const cap = Math.floor(trimmable * entry.target.weight);
  // Stable sort by value; curated rules already rank first because they are domain blocks.
  entry.rules.sort((a, b) => value(a) - value(b));
  if (entry.rules.length <= cap) continue;
  entry.trimmed = entry.rules.length - cap;
  entry.rules = entry.rules.slice(0, cap);
}

const metadata = [];
const today = new Date().toISOString().slice(0, 10);

for (const entry of compiled) {
  const { target } = entry;
  const withIds = entry.rules.map((rule, index) => ({ id: target.idBase + index, ...rule }));
  writeFileSync(join(rulesDir, `${target.id}.json`), `${JSON.stringify(withIds)}\n`, 'utf8');
  const source = sources.find((s) => s.id === target.source);
  metadata.push({
    id: target.id,
    ruleCount: withIds.length,
    updatedAt: today,
    description: target.description ?? source?.description ?? '',
    // Attribution is a licence condition of the upstream lists, so it travels with the
    // data and is rendered in the dashboard's Filters panel.
    source: source?.name ?? 'ClearBlock curated',
    homepage: source?.homepage ?? '',
    license: source?.license ?? 'MIT',
  });
}

/* --- cosmetic table ----------------------------------------------------- */

// Exceptions remove a selector from that domain.
for (const [domain, selectors] of cosmetic.exceptions) {
  const list = cosmetic.specific.get(domain);
  if (!list) continue;
  for (const selector of selectors) list.delete(selector);
}

const specific = Object.fromEntries(
  [...cosmetic.specific.entries()]
    .filter(([, selectors]) => selectors.size > 0)
    .map(([domain, selectors]) => [domain, [...selectors]]),
);

writeFileSync(
  join(root, 'src/content/generated-cosmetic.json'),
  `${JSON.stringify({ generic: [...cosmetic.generic], specific })}\n`,
  'utf8',
);

/* --- report ------------------------------------------------------------- */

console.log('\nfilters: network rules\n');
for (const { target, stats } of report) {
  const entry = compiled.find((c) => c.target.id === target.id);
  const trimmed = entry.trimmed ? `  (trimmed ${entry.trimmed} to fit the budget)` : '';
  console.log(
    `  ${target.id.padEnd(12)} ${String(entry.rules.length).padStart(6)} rules  ` +
      `(${entry.curated.length} curated + ${String(stats.network)} upstream filters)${trimmed}`,
  );
  const s = stats.skipped;
  console.log(
    `  ${''.padEnd(12)} skipped: option ${s.unsupportedOption}, regex ${s.regex}, popup ${s.popup}, ` +
      `type ${s.unknownType}, main_frame ${s.blockMainFrame}, non-ascii ${s.nonAscii}`,
  );
}

const enabledTotal = compiled.reduce((sum, entry) => sum + entry.rules.length, 0);
console.log(
  `\n  produced ${totalProduced}, shipping ${enabledTotal} (budget ${ENABLED_RULE_BUDGET})`,
);

const genericCount = cosmetic.generic.size;
const specificDomains = Object.keys(specific).length;
const specificSelectors = Object.values(specific).reduce((n, list) => n + list.length, 0);
const cosmeticBytes = readFileSync(join(root, 'src/content/generated-cosmetic.json')).length;
console.log(
  `\nfilters: cosmetic\n\n  generic ${genericCount} selectors, specific ${specificSelectors} across ${specificDomains} domains` +
    `\n  procedural skipped ${report.reduce((n, r) => n + r.proceduralSkipped, 0)}` +
    `\n  generated-cosmetic.json ${(cosmeticBytes / 1024).toFixed(0)} kB`,
);

writeFileSync(join(rulesDir, 'metadata.json'), `${JSON.stringify(metadata, null, 2)}\n`, 'utf8');
console.log('\nfilters: wrote src/rules/metadata.json');
