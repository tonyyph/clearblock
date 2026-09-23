/**
 * Adblock Plus filter syntax -> Chrome declarativeNetRequest.
 *
 * Only the subset DNR can express is converted; anything else is counted and skipped
 * rather than approximated, because a wrong rule breaks a site while a missing rule merely
 * fails to block one thing. `stats.skipped` records why, so the loss stays measurable.
 *
 * DNR's urlFilter syntax was modelled on ABP's, so `||`, `|`, `^` and `*` carry over
 * unchanged. The real work here is the option string and the resource-type mapping.
 */

/** ABP option -> DNR resource type. */
const RESOURCE_TYPES = {
  script: 'script',
  image: 'image',
  stylesheet: 'stylesheet',
  css: 'stylesheet',
  object: 'object',
  'object-subrequest': 'object',
  xmlhttprequest: 'xmlhttprequest',
  xhr: 'xmlhttprequest',
  subdocument: 'sub_frame',
  frame: 'sub_frame',
  document: 'main_frame',
  doc: 'main_frame',
  media: 'media',
  font: 'font',
  websocket: 'websocket',
  ping: 'ping',
  beacon: 'ping',
  other: 'other',
  csp_report: 'csp_report',
};

/**
 * Options that change what a rule *does* in ways DNR has no equivalent for. A filter
 * carrying any of these is dropped whole — approximating them is how blockers break pages.
 */
const UNSUPPORTED_OPTIONS = new Set([
  'redirect',
  'redirect-rule',
  'rewrite',
  'csp',
  'removeparam',
  'queryprune',
  'replace',
  'badfilter',
  'genericblock',
  'generichide',
  'elemhide',
  'ehide',
  'specifichide',
  'shide',
  'inline-script',
  'inline-font',
  'empty',
  'mp4',
  'stealth',
  'cookie',
  'network',
  'app',
  'method',
  'header',
  'permissions',
  'urltransform',
  'uritransform',
  'popunder',
  'all',
  'webrtc',
  'strict1p',
  'strict3p',
  'ipaddress',
  'to',
  'from',
  'denyallow',
  'jsonprune',
  'referrerpolicy',
  'noop',
]);

const DOMAIN_ONLY = /^\|\|([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)\^?$/;

/**
 * `||` is DNR's domain anchor and must be followed by the start of a hostname. A pattern
 * like `||*.example.com/x` is accepted by Adblock Plus but is malformed for DNR, and
 * Chrome does not reject it — it hangs while indexing the ruleset, which takes the whole
 * browser down with it. One such rule in 29,000 was enough to stop Chrome starting at all.
 */
const ANCHOR_THEN_WILDCARD = /^\|\|\*\.?/;
const VALID_ANCHOR = /^\|\|[a-z0-9]/i;
const ASCII_ONLY = /^[\x20-\x7E]*$/;
const OPTION_TAIL = /^[a-zA-Z0-9~,=|._\-*:/]*$/;

export function createStats() {
  return {
    lines: 0,
    comments: 0,
    cosmetic: 0,
    network: 0,
    converted: 0,
    skipped: {
      unsupportedOption: 0,
      regex: 0,
      nonAscii: 0,
      emptyPattern: 0,
      popup: 0,
      unknownType: 0,
      blockMainFrame: 0,
      malformedAnchor: 0,
    },
  };
}

/**
 * Splits a domain list into included / excluded entries.
 *
 * The separator differs by context and getting it wrong silently produces domain keys like
 * "a.com,b.com" that can never match: network options (`$domain=`) use `|`, cosmetic rule
 * prefixes (`a.com,b.com##...`) use `,`.
 */
export function splitDomains(value, separator = '|') {
  const included = [];
  const excluded = [];
  for (const part of value.split(separator)) {
    const entry = part.trim().toLowerCase();
    if (!entry) continue;
    if (entry.startsWith('~')) excluded.push(entry.slice(1));
    else included.push(entry);
  }
  return { included, excluded };
}

/**
 * Finds where the option string starts. ABP puts it after the last `$`, but a `$` can
 * legitimately appear inside a pattern, so the tail has to actually look like options.
 */
function splitOptions(line) {
  const index = line.lastIndexOf('$');
  if (index === -1) return { pattern: line, options: '' };
  const tail = line.slice(index + 1);
  if (!OPTION_TAIL.test(tail)) return { pattern: line, options: '' };
  return { pattern: line.slice(0, index), options: tail };
}

export function isComment(line) {
  return line.startsWith('!') || line.startsWith('[Adblock');
}

/** True when the line is a cosmetic rule rather than a network filter. */
export function looksCosmetic(line) {
  return /#[@$?%]{0,2}#/.test(line);
}

/**
 * Converts one ABP network filter into a DNR rule body (no `id` yet).
 * Returns null when the filter cannot be represented; `stats` records the reason.
 */
export function convertNetworkFilter(line, stats) {
  const isException = line.startsWith('@@');
  const body = isException ? line.slice(2) : line;
  const { pattern, options } = splitOptions(body);

  if (!pattern) {
    stats.skipped.emptyPattern += 1;
    return null;
  }
  if (pattern.length > 2 && pattern.startsWith('/') && pattern.endsWith('/')) {
    // A regex filter. DNR's regexFilter uses RE2, which rejects back-references and
    // lookarounds; shipping rules that silently fail to load is worse than dropping them.
    stats.skipped.regex += 1;
    return null;
  }
  if (!ASCII_ONLY.test(pattern)) {
    stats.skipped.nonAscii += 1;
    return null;
  }

  // `||*.example.com/x` means "any subdomain"; DNR's `||example.com/x` already covers the
  // domain and its subdomains, so the wildcard is dropped rather than the rule.
  let normalized = pattern.replace(ANCHOR_THEN_WILDCARD, '||');
  if (normalized.startsWith('||') && !VALID_ANCHOR.test(normalized)) {
    stats.skipped.malformedAnchor += 1;
    return null;
  }

  const resourceTypes = new Set();
  const excludedResourceTypes = new Set();
  let domainType;
  let initiatorDomains;
  let excludedInitiatorDomains;
  let caseSensitive = false;
  let isDocumentException = false;
  let sawPopup = false;

  for (const raw of options ? options.split(',') : []) {
    if (!raw) continue;
    const negated = raw.startsWith('~');
    const token = negated ? raw.slice(1) : raw;
    const eq = token.indexOf('=');
    const name = (eq === -1 ? token : token.slice(0, eq)).toLowerCase();
    const value = eq === -1 ? undefined : token.slice(eq + 1);

    if (name === 'popup') {
      // DNR cannot cancel a window.open(). When `popup` is one type among several the
      // rule still has a useful meaning without it, so it is dropped and the rest kept;
      // when it is the only type, converting it to a blanket block would over-block a
      // domain that is only unwanted *as a popup*, so the filter is skipped.
      sawPopup = true;
      continue;
    }
    if (UNSUPPORTED_OPTIONS.has(name)) {
      stats.skipped.unsupportedOption += 1;
      return null;
    }
    if (name === 'third-party' || name === '3p') {
      domainType = negated ? 'firstParty' : 'thirdParty';
      continue;
    }
    if (name === 'first-party' || name === '1p') {
      domainType = negated ? 'thirdParty' : 'firstParty';
      continue;
    }
    if (name === 'match-case') {
      caseSensitive = !negated;
      continue;
    }
    if (name === 'domain' && value) {
      const { included, excluded } = splitDomains(value);
      if (included.length) initiatorDomains = included;
      if (excluded.length) excludedInitiatorDomains = excluded;
      continue;
    }

    const type = RESOURCE_TYPES[name];
    if (!type) {
      stats.skipped.unknownType += 1;
      return null;
    }
    if (type === 'main_frame') {
      if (isException) {
        // `@@...$document` means "do not filter this page at all".
        isDocumentException = true;
        continue;
      }
      // Blocking a top-level navigation replaces the page with a Chrome error page.
      stats.skipped.blockMainFrame += 1;
      return null;
    }
    if (negated) excludedResourceTypes.add(type);
    else resourceTypes.add(type);
  }

  const condition = {};
  const domainMatch = DOMAIN_ONLY.exec(normalized);
  if (domainMatch && !caseSensitive) {
    // `||example.com^` is both more precise and faster as a domain condition than as a
    // URL pattern, and it covers subdomains the way ABP intends.
    condition.requestDomains = [domainMatch[1]];
  } else {
    condition.urlFilter = normalized;
    if (caseSensitive) condition.isUrlFilterCaseSensitive = true;
  }

  if (domainType) condition.domainType = domainType;
  if (initiatorDomains) condition.initiatorDomains = initiatorDomains;
  if (excludedInitiatorDomains) condition.excludedInitiatorDomains = excludedInitiatorDomains;

  if (isDocumentException) {
    condition.resourceTypes = ['main_frame', 'sub_frame'];
    stats.converted += 1;
    return { priority: 3, action: { type: 'allowAllRequests' }, condition };
  }

  if (sawPopup && resourceTypes.size === 0 && excludedResourceTypes.size === 0) {
    stats.skipped.popup += 1;
    return null;
  }

  if (resourceTypes.size) condition.resourceTypes = [...resourceTypes];
  else if (excludedResourceTypes.size) condition.excludedResourceTypes = [...excludedResourceTypes];
  // With neither set, DNR matches every resource type except main_frame — exactly the
  // behaviour an untyped ABP filter should have here.

  stats.converted += 1;
  return {
    priority: isException ? 2 : 1,
    action: { type: isException ? 'allow' : 'block' },
    condition,
  };
}

/** Recognises and splits a cosmetic rule. Returns null if the line is not one. */
export function parseCosmeticFilter(line) {
  const match = /^(.*?)(#@?[$?%]?#)(.+)$/.exec(line);
  if (!match) return null;
  const [, domainPart, separator, selector] = match;

  // #$# injects CSS declarations and #%# runs scriptlets. Neither is a plain selector,
  // and neither is something ClearBlock does.
  if (separator.includes('$') || separator.includes('%')) return null;

  const isProcedural =
    separator.includes('?') ||
    /:-abp-|:has-text\(|:matches-css|:xpath\(|:upward\(|:remove\(|:watch-attr/.test(selector);

  const parts = domainPart ? splitDomains(domainPart, ',') : { included: [], excluded: [] };
  return {
    selector: selector.trim(),
    isException: separator.includes('@'),
    isProcedural,
    domains: parts.included,
    excludedDomains: parts.excluded,
  };
}
