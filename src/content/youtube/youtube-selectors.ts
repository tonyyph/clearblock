/**
 * YouTube selectors, kept in one file because they are the part of ClearBlock most likely
 * to go stale: YouTube ships DOM changes constantly. Everything that consumes these lists
 * treats "selector matched nothing" as normal, never as an error.
 *
 * Deliberately NOT here:
 *  - anything that touches playback controls, captions, fullscreen, the miniplayer,
 *    playlists, Shorts or live chat;
 *  - the player container itself (`.video-ads`), because the Skip button lives inside it
 *    and hiding its ancestor would make the button unclickable.
 */

/** The player root. Gains the `ad-showing` class while an in-stream ad plays. */
export const PLAYER_SELECTOR = '#movie_player';

/** True-positive signal that an ad is currently playing in the player. */
export const AD_SHOWING_CLASS = 'ad-showing';

/** Skip controls, newest markup first. Only clicked when actually visible and enabled. */
export const SKIP_BUTTON_SELECTORS: readonly string[] = [
  '.ytp-skip-ad-button',
  '.ytp-ad-skip-button-modern',
  '.ytp-ad-skip-button',
  '.ytp-ad-skip-button-slot button',
];

/**
 * Overlay ads drawn on top of the video. Hiding these is purely cosmetic — the video
 * element, its controls and its timeline are untouched.
 */
export const PLAYER_OVERLAY_SELECTORS: readonly string[] = [
  '.ytp-ad-overlay-slot',
  '.ytp-ad-overlay-container',
  '.ytp-ad-text-overlay',
  '.ytp-ad-image-overlay',
  '.ytp-ad-overlay-image',
  '.ytp-featured-product',
  '.ytp-suggested-action',
];

/** Ad surfaces outside the player: feed, sidebar, masthead, watch page. */
export const PAGE_AD_SELECTORS: readonly string[] = [
  'ytd-ad-slot-renderer',
  'ytd-display-ad-renderer',
  'ytd-in-feed-ad-layout-renderer',
  'ytd-promoted-sparkles-web-renderer',
  'ytd-promoted-sparkles-text-search-renderer',
  'ytd-promoted-video-renderer',
  'ytd-banner-promo-renderer',
  'ytd-statement-banner-renderer',
  'ytd-video-masthead-ad-v3-renderer',
  'ytd-video-masthead-ad-advertiser-info-renderer',
  'ytd-primetime-promo-renderer',
  'ytd-brand-video-shelf-renderer',
  'ytd-brand-video-singleton-renderer',
  '#masthead-ad',
  '#player-ads',
  'ytd-rich-item-renderer:has(ytd-ad-slot-renderer)',
  'ytd-rich-section-renderer:has(ytd-statement-banner-renderer)',
  'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-ads"]',
];

/**
 * Leftover empty layout boxes once the renderers above are hidden. Collapsing them is what
 * stops a gap appearing in the feed grid.
 */
export const PAGE_AD_SPACER_SELECTORS: readonly string[] = [
  'ytd-rich-item-renderer:has(> #content > ytd-ad-slot-renderer)',
  '#related ytd-item-section-renderer:has(> #contents > ytd-ad-slot-renderer)',
];

/** Watch pages where the in-player logic is worth running at all. */
export function isWatchPath(pathname: string): boolean {
  return (
    pathname === '/watch' ||
    pathname.startsWith('/embed/') ||
    pathname.startsWith('/live/') ||
    pathname.startsWith('/shorts/')
  );
}
