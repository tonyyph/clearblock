/**
 * Cosmetic selector lists.
 *
 * Design rule: **never substring-match a class name.** `[class*="ad"]` also matches
 * `header`, `shadow`, `adapter`, `gradient`, `download` and `badge`. Every selector here
 * is either a whole-token class/id match (CSS class selectors are token-exact by
 * definition), an exact attribute value, or an attribute that only ad tech ever sets.
 */

/** Applied on every page as a single stylesheet. Selectors must be cheap and unambiguous. */
export const GENERIC_SELECTORS: readonly string[] = [
  // Whole-token class names used by ad stacks. `.ad` will not match `.adapter`.
  '.ad',
  '.ads',
  '.adbox',
  '.adsbox',
  '.adsbygoogle',
  '.ad-banner',
  '.ad-container',
  '.ad-placeholder',
  '.ad-slot',
  '.ad-unit',
  '.ad-wrapper',
  '.adslot',
  '.advert',
  '.adverts',
  '.advertisement',
  '.advertising',
  '.banner-ad',
  '.banner-ads',
  '.display-ad',
  '.google-ad',
  '.google-ads',
  '.leaderboard-ad',
  '.sidebar-ad',
  '.sponsored-ad',
  '.sticky-ad',
  '.text-ad',
  '.video-ads',

  // Whole-token ids.
  '#ad',
  '#ads',
  '#adBanner',
  '#ad-banner',
  '#advertisement',
  '#banner-ad',

  // Ad-server generated ids. A prefix match on these is unambiguous.
  '[id^="div-gpt-ad"]',
  '[id^="gpt-ad"]',
  '[id^="google_ads_"]',
  '[id^="google_ads_iframe"]',
  '[id^="taboola-"]',
  '[id^="outbrain_widget"]',
  '[id^="ad-slot-"]',
  '[id^="adunit"]',

  // Attributes only ad tech sets.
  '[data-ad-client]',
  '[data-ad-slot]',
  '[data-ad-unit]',
  '[data-adunit]',
  '[data-ad-manager-id]',
  '[data-google-query-id]',
  'ins.adsbygoogle',

  // Exact ARIA labels used to announce ad regions.
  '[aria-label="Advertisement" i]',
  '[aria-label="Sponsored" i]',

  // Frames served directly from ad domains that DNR could not block (e.g. srcdoc frames
  // created after an allow rule, or when a ruleset is disabled).
  'iframe[src*="doubleclick.net"]',
  'iframe[src*="googlesyndication.com"]',
  'iframe[src*="amazon-adsystem.com"]',
  'iframe[src*="adnxs.com"]',
];

/**
 * Containers that are only worth hiding once they are demonstrably empty — hiding them
 * unconditionally would remove real content on sites that reuse the class name.
 */
export const PLACEHOLDER_SELECTORS: readonly string[] = [
  '[class~="ad-container"]',
  '[class~="ad-wrapper"]',
  '[class~="advertisement-container"]',
  '[id^="ad-container"]',
];

/**
 * Domain-specific rules, applied only on the matching hostname (and its subdomains).
 * Kept small and verifiable on purpose: a wrong rule here breaks one site for everyone.
 */
export const DOMAIN_SELECTORS: Readonly<Record<string, readonly string[]>> = {
  'reddit.com': ['shreddit-ad-post', '[data-testid="search-post-unit-ad"]', '.promotedlink'],
  'theguardian.com': ['.ad-slot-container', '.top-banner-ad-container'],
  'bbc.com': ['[data-component="ad-slot"]'],
  'bbc.co.uk': ['[data-component="ad-slot"]'],
  'cnn.com': ['.ad-feedback-link-container', '[data-ad-feedback-beacon]'],
  'forbes.com': ['.fbs-ad', '[data-ad-unit-path]'],
  'dailymail.co.uk': ['.mpu-container', '.adHolder'],
  'wikihow.com': ['[id^="ad-"]'],
};

/** Selectors whose elements should never be touched, even if a rule above matches. */
export const PROTECTED_TAGS: ReadonlySet<string> = new Set([
  'HTML',
  'HEAD',
  'BODY',
  'MAIN',
  'SCRIPT',
  'STYLE',
  'LINK',
  'META',
]);

/** Domain-specific selectors for a hostname, including parent-domain entries. */
export function selectorsForHostname(hostname: string): string[] {
  const host = hostname.toLowerCase();
  const matched: string[] = [];
  for (const [domain, selectors] of Object.entries(DOMAIN_SELECTORS)) {
    if (host === domain || host.endsWith(`.${domain}`)) matched.push(...selectors);
  }
  return matched;
}
