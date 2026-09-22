/**
 * Generates the static declarativeNetRequest rulesets from curated domain lists.
 *
 * Keeping the source lists here (rather than hand-editing JSON) guarantees unique,
 * stable, per-ruleset rule IDs and a consistent condition shape. Run `npm run rules`
 * after editing a list, then `npm run validate:rules`.
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Every resource type except `main_frame`. Blocking a top-level navigation would replace
 * the page a user explicitly clicked with a Chrome error page, which is worse than an ad.
 */
const SUBRESOURCE_TYPES = [
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
];

/** Ad networks, exchanges, ad servers and sponsored-content widgets. */
const AD_DOMAINS = [
  '2mdn.net',
  '33across.com',
  'adcolony.com',
  'adform.net',
  'adnxs.com',
  'adnxs-simple.com',
  'adroll.com',
  'ads-twitter.com',
  'adsafeprotected.com',
  'adservice.google.com',
  'adsrvr.org',
  'adsterra.com',
  'adtelligent.com',
  'advertising.com',
  'amazon-adsystem.com',
  'aniview.com',
  'app-measurement.com',
  'applovin.com',
  'appnexus.com',
  'bidswitch.net',
  'bidr.io',
  'casalemedia.com',
  'contextweb.com',
  'conversantmedia.com',
  'criteo.com',
  'criteo.net',
  'doubleclick.net',
  'districtm.io',
  'emxdgt.com',
  'exoclick.com',
  'gumgum.com',
  'improvedigital.com',
  'indexww.com',
  'inmobi.com',
  'juicyads.com',
  'lijit.com',
  'media.net',
  'mediavine.com',
  'mgid.com',
  'moatads.com',
  'nativery.com',
  'onetag-sys.com',
  'openx.net',
  'outbrain.com',
  'pubmatic.com',
  'pubnative.net',
  'popads.net',
  'propellerads.com',
  'revcontent.com',
  'rhythmone.com',
  'rubiconproject.com',
  'servedbyadbutler.com',
  'sharethrough.com',
  'smartadserver.com',
  'smaato.net',
  'sonobi.com',
  'sovrn.com',
  'spotxchange.com',
  'springserve.com',
  'taboola.com',
  'teads.tv',
  'themoneytizer.com',
  'triplelift.com',
  'unrulymedia.com',
  'yieldlab.net',
  'yieldmo.com',
  'zedo.com',
  'zemanta.com',
  'googlesyndication.com',
  'googleadservices.com',
];

/**
 * Advertising trackers: identity graphs, data-management platforms, retargeting pixels and
 * session-replay vendors. General product analytics (Google Analytics, Plausible, ...) is
 * deliberately NOT here — blanket-blocking analytics breaks sites and is not ad blocking.
 */
const TRACKER_DOMAINS = [
  'addthis.com',
  'agkn.com',
  'bluekai.com',
  'bounceexchange.com',
  'branch.io',
  'clicktale.net',
  'crazyegg.com',
  'crwdcntrl.net',
  'demdex.net',
  'everesttech.net',
  'exelator.com',
  'eyeota.net',
  'fullstory.com',
  'hotjar.com',
  'hotjar.io',
  'id5-sync.com',
  'inspectlet.com',
  'krxd.net',
  'liadm.com',
  'luckyorange.com',
  'mathtag.com',
  'mouseflow.com',
  'netmng.com',
  'omnitagjs.com',
  'onaudience.com',
  'owneriq.net',
  'parsely.com',
  'quantserve.com',
  'quantcast.com',
  'rlcdn.com',
  'scorecardresearch.com',
  'segment.io',
  'sharethis.com',
  'smartlook.com',
  'tapad.com',
  'thebrighttag.com',
  'tiqcdn.com',
  'turn.com',
  'yieldoptimizer.com',
  'zqtk.net',
];

/**
 * Precise URL rules for vendors whose domain also serves non-advertising functionality
 * (e.g. Facebook's login SDK lives next to its conversion pixel). Matching the path keeps
 * the useful part of the domain working.
 */
const TRACKER_URL_RULES = [
  { urlFilter: '||connect.facebook.net/signals/', note: 'Meta conversions pixel' },
  { urlFilter: '||connect.facebook.net^*/fbevents.js', note: 'Meta pixel bootstrap' },
  { urlFilter: '||analytics.tiktok.com/i18n/pixel/', note: 'TikTok pixel' },
  { urlFilter: '||px.ads.linkedin.com^', note: 'LinkedIn ad pixel' },
  { urlFilter: '||bat.bing.com/bat.js', note: 'Microsoft UET ad tag' },
];

/**
 * Annoyances: push-notification nags, popup/interstitial SDKs and email-capture overlays.
 * Consent-management platforms are intentionally excluded — blocking a CMP leaves the
 * banner half-rendered and can stop a site loading at all.
 */
const ANNOYANCE_DOMAINS = [
  'izooto.com',
  'onesignal.com',
  'optinmonster.com',
  'pushengage.com',
  'pushnami.com',
  'pushwoosh.com',
  'sendpulse.com',
  'sumo.com',
  'truepush.com',
  'webpushr.com',
  'wisepops.com',
  'getsitecontrol.com',
  'popupsmart.com',
  'privy.com',
  'justuno.com',
  'sleeknote.com',
  'insider.com.tr',
  'exitintel.com',
];

const RULESETS = [
  {
    id: 'ads',
    idBase: 1000,
    description: 'Ad networks, exchanges and sponsored-content widgets.',
    domains: AD_DOMAINS,
    urlRules: [],
  },
  {
    id: 'trackers',
    idBase: 2000,
    description: 'Advertising trackers, identity graphs and session-replay vendors.',
    domains: TRACKER_DOMAINS,
    urlRules: TRACKER_URL_RULES,
  },
  {
    id: 'annoyances',
    idBase: 3000,
    description: 'Push-notification nags, popups and email-capture overlays.',
    domains: ANNOYANCE_DOMAINS,
    urlRules: [],
  },
];

function buildRules(ruleset) {
  const rules = [];
  let nextId = ruleset.idBase;

  for (const domain of [...new Set(ruleset.domains)].sort()) {
    rules.push({
      id: nextId++,
      priority: 1,
      action: { type: 'block' },
      condition: {
        // `requestDomains` matches the domain and all of its subdomains, which is both
        // faster and far less error-prone than an equivalent urlFilter wildcard.
        requestDomains: [domain],
        resourceTypes: SUBRESOURCE_TYPES,
      },
    });
  }

  for (const rule of ruleset.urlRules) {
    rules.push({
      id: nextId++,
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: rule.urlFilter,
        resourceTypes: ['script', 'image', 'xmlhttprequest', 'ping'],
      },
    });
  }

  if (nextId > ruleset.idBase + 999) {
    throw new Error(`Ruleset "${ruleset.id}" overflowed its 1000-ID block`);
  }
  return rules;
}

const metadata = [];
const today = new Date().toISOString().slice(0, 10);

for (const ruleset of RULESETS) {
  const rules = buildRules(ruleset);
  const target = resolve(root, 'src/rules', `${ruleset.id}.json`);
  writeFileSync(target, `${JSON.stringify(rules, null, 2)}\n`, 'utf8');
  metadata.push({
    id: ruleset.id,
    ruleCount: rules.length,
    updatedAt: today,
    description: ruleset.description,
  });
  console.log(`rules: ${ruleset.id} -> ${rules.length} rules`);
}

writeFileSync(
  resolve(root, 'src/rules/metadata.json'),
  `${JSON.stringify(metadata, null, 2)}\n`,
  'utf8',
);
console.log('rules: wrote src/rules/metadata.json');
