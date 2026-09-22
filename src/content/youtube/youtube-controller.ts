/**
 * YouTube protection.
 *
 * Scope and honesty
 * -----------------
 * Under Manifest V3 this module can do exactly three things, and it does only these:
 *   1. hide ad surfaces outside the player (feed, sidebar, masthead) with CSS;
 *   2. hide overlay ads drawn on top of the video with CSS;
 *   3. press the real "Skip" button once it exists, is visible and is enabled.
 *
 * It does NOT, and will not: touch playback rate, mute or seek the video, tamper with
 * YouTube's media streams, spoof Premium, or block the ad request itself (in-stream ads
 * are served from the same endpoints as the video). Pre-roll ads that have no Skip button
 * still play. README.md states this limitation in the same words.
 *
 * Everything below fails soft: a selector that no longer matches simply does nothing.
 */
import { createLogger } from '../../shared/logger';
import { createBoundedObserver } from './youtube-observer';
import { createNavigationWatcher } from './youtube-navigation';
import {
  AD_SHOWING_CLASS,
  PAGE_AD_SELECTORS,
  PAGE_AD_SPACER_SELECTORS,
  PLAYER_OVERLAY_SELECTORS,
  PLAYER_SELECTOR,
  SKIP_BUTTON_SELECTORS,
} from './youtube-selectors';

const log = createLogger('youtube');

const STYLE_ID = 'clearblock-youtube-style';

/** Minimum gap between two synthetic clicks — prevents any possibility of a click loop. */
export const MIN_CLICK_INTERVAL_MS = 800;
/** A single ad break never needs more presses than this; beyond it we stop trying. */
export const MAX_CLICKS_PER_BREAK = 3;
/** Absolute ceiling regardless of how many breaks occur. */
export const MAX_CLICKS_PER_MINUTE = 20;

/**
 * Pure click budget, extracted so the cooldown behaviour can be unit-tested without a DOM.
 */
export class SkipThrottle {
  private lastClickAt = 0;
  private clicksThisBreak = 0;
  private recentClicks: number[] = [];

  canClick(now: number): boolean {
    if (now - this.lastClickAt < MIN_CLICK_INTERVAL_MS) return false;
    if (this.clicksThisBreak >= MAX_CLICKS_PER_BREAK) return false;
    this.recentClicks = this.recentClicks.filter((time) => now - time < 60_000);
    return this.recentClicks.length < MAX_CLICKS_PER_MINUTE;
  }

  recordClick(now: number): void {
    this.lastClickAt = now;
    this.clicksThisBreak += 1;
    this.recentClicks.push(now);
  }

  /** Called when the player leaves the ad state, so the next break starts with a fresh budget. */
  endBreak(): void {
    this.clicksThisBreak = 0;
  }

  get clicksInCurrentBreak(): number {
    return this.clicksThisBreak;
  }
}

/** A skip control is only pressed when a real user could have pressed it. */
export function isClickable(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement)) return false;
  if (element.hasAttribute('disabled')) return false;
  if (element.getAttribute('aria-disabled') === 'true') return false;
  if (element.getAttribute('aria-hidden') === 'true') return false;

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;

  const style = getComputedStyle(element);
  if (style.visibility === 'hidden' || style.display === 'none') return false;
  return Number(style.opacity || '1') > 0.1;
}

export function findSkipButton(root: ParentNode): HTMLElement | null {
  for (const selector of SKIP_BUTTON_SELECTORS) {
    let candidate: Element | null;
    try {
      candidate = root.querySelector(selector);
    } catch {
      continue; // Selector no longer valid in this Chrome version; try the next one.
    }
    if (isClickable(candidate)) return candidate;
  }
  return null;
}

function buildCss(): string {
  const hide = [...PLAYER_OVERLAY_SELECTORS, ...PAGE_AD_SELECTORS];
  const collapse = PAGE_AD_SPACER_SELECTORS;
  return [
    `${hide.join(',\n')} {\n  display: none !important;\n}`,
    // Collapsing rather than hiding keeps the surrounding grid from reflowing oddly.
    `${collapse.join(',\n')} {\n  display: none !important;\n}`,
  ].join('\n\n');
}

let styleElement: HTMLStyleElement | null = null;
let observer: ReturnType<typeof createBoundedObserver> | null = null;
let navigation: ReturnType<typeof createNavigationWatcher> | null = null;
let throttle = new SkipThrottle();
let adWasShowing = false;
let skipsPerformed = 0;
let running = false;

function applyStyles(): void {
  if (!styleElement || !styleElement.isConnected) {
    styleElement = document.createElement('style');
    styleElement.id = STYLE_ID;
    (document.head ?? document.documentElement).appendChild(styleElement);
  }
  styleElement.textContent = buildCss();
}

function removeStyles(): void {
  styleElement?.remove();
  styleElement = null;
}

/** One pass of the player state machine. Cheap: a handful of selector lookups. */
function tick(): void {
  if (!running) return;

  const player = document.querySelector(PLAYER_SELECTOR);
  if (!player) {
    // Player not built yet (or we are on a non-watch page); keep watching the document.
    attachObserver();
    return;
  }

  const adShowing = player.classList.contains(AD_SHOWING_CLASS);
  if (!adShowing) {
    if (adWasShowing) {
      throttle.endBreak();
      log.debug('ad break ended');
    }
    adWasShowing = false;
    attachObserver(player);
    return;
  }

  adWasShowing = true;
  const button = findSkipButton(player);
  if (!button) return; // Unskippable ad, or the button has not appeared yet.

  const now = Date.now();
  if (!throttle.canClick(now)) return;

  try {
    button.click();
    throttle.recordClick(now);
    skipsPerformed += 1;
    log.debug('pressed skip', { clicksThisBreak: throttle.clicksInCurrentBreak });
  } catch (error) {
    log.debug('skip click failed', error);
  }
}

/**
 * Watches the player subtree when it exists, and only falls back to the whole document
 * while waiting for the player to be created. Observing YouTube's full DOM permanently
 * would be a real performance cost.
 */
function attachObserver(player?: Element): void {
  if (!observer) return;
  if (player) {
    observer.observe(player, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class'],
    });
    return;
  }
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

export function startYouTubeProtection(): void {
  if (running) return;
  running = true;
  throttle = new SkipThrottle();
  adWasShowing = false;

  applyStyles();

  observer = createBoundedObserver(tick);
  attachObserver(document.querySelector(PLAYER_SELECTOR) ?? undefined);

  navigation = createNavigationWatcher(() => {
    // New page: the old player node is gone, so re-point the observer and reset state.
    throttle.endBreak();
    adWasShowing = false;
    applyStyles();
    attachObserver(document.querySelector(PLAYER_SELECTOR) ?? undefined);
  });
  navigation.start();

  log.info('YouTube protection active');
}

export function stopYouTubeProtection(): void {
  if (!running) return;
  running = false;
  observer?.disconnect();
  observer = null;
  navigation?.stop();
  navigation = null;
  removeStyles();
  log.info('YouTube protection stopped');
}

export function isYouTubeProtectionActive(): boolean {
  return running;
}

export function youTubeSkipCount(): number {
  return skipsPerformed;
}
