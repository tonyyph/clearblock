/**
 * ClearBlock's own curated domain lists.
 *
 * These predate the upstream lists and are kept for two reasons: they are vetted by hand,
 * and they guarantee coverage of a core set of ad and tracker domains regardless of what
 * the community lists happen to contain on any given day. `compile-filters.mjs` merges
 * them into the compiled rulesets.
 */
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
  // Legacy Google Publisher Tag host. Still served, still pure ad tech — not to be
  // confused with googletagmanager.com, which is deliberately left alone below.
  'googletagservices.com',
  'serving-sys.com',
  'flashtalking.com',
  'creativecdn.com',
  'dotomi.com',
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

export { SUBRESOURCE_TYPES, AD_DOMAINS, TRACKER_DOMAINS, TRACKER_URL_RULES, ANNOYANCE_DOMAINS };

/** Builds DNR rule bodies (no `id`) for a curated domain list. */
export function curatedRules(domains, urlRules = []) {
  const rules = [];
  for (const domain of [...new Set(domains)].sort()) {
    rules.push({
      priority: 1,
      action: { type: 'block' },
      condition: { requestDomains: [domain], resourceTypes: SUBRESOURCE_TYPES },
    });
  }
  for (const rule of urlRules) {
    rules.push({
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: rule.urlFilter,
        resourceTypes: ['script', 'image', 'xmlhttprequest', 'ping'],
      },
    });
  }
  return rules;
}
