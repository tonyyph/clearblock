/**
 * Applies and removes cosmetic hiding.
 *
 * Hiding is done with a single injected stylesheet rather than per-element inline styles:
 *
 *  - it applies at document_start, before first paint, so there is no layout shift and no
 *    flash of an ad that then disappears;
 *  - CSS selectors are live, so elements inserted later are hidden automatically without
 *    any DOM scanning. The MutationObserver therefore only handles the few cases CSS
 *    cannot express (see cosmetic-filter.ts);
 *  - removing one <style> node fully reverts everything when the user pauses ClearBlock.
 */
import { createLogger } from '../shared/logger';
import { PROTECTED_TAGS } from './selectors';

const log = createLogger('hider');

const STYLE_ID = 'clearblock-cosmetic-style';

let styleElement: HTMLStyleElement | null = null;
let hiddenCount = 0;
const processed = new WeakSet<Element>();

function buildCss(selectors: readonly string[]): string {
  if (selectors.length === 0) return '';
  // One rule keeps the stylesheet tiny and lets the engine match the whole group at once.
  return `${selectors.join(',\n')} {\n  display: none !important;\n}\n`;
}

/** Creates or updates the cosmetic stylesheet. Safe to call before <head> exists. */
export function applyStylesheet(selectors: readonly string[]): void {
  const css = buildCss(selectors);
  if (!css) {
    removeStylesheet();
    return;
  }

  if (!styleElement || !styleElement.isConnected) {
    styleElement = document.createElement('style');
    styleElement.id = STYLE_ID;
    styleElement.setAttribute('type', 'text/css');
    // documentElement always exists at document_start; <head> may not.
    (document.head ?? document.documentElement).appendChild(styleElement);
  }
  styleElement.textContent = css;
  log.debug('stylesheet applied', selectors.length, 'selectors');
}

export function removeStylesheet(): void {
  styleElement?.remove();
  styleElement = null;
}

export function getHiddenCount(): number {
  return hiddenCount;
}

export function resetHiddenCount(): void {
  hiddenCount = 0;
}

/** True the first time an element is seen; keeps repeated observer batches cheap. */
export function markProcessed(element: Element): boolean {
  if (processed.has(element)) return false;
  processed.add(element);
  return true;
}

export function countHidden(amount = 1): void {
  hiddenCount += amount;
}

/**
 * Hides one element directly. Used only for the handful of cases the stylesheet cannot
 * express; refuses structural elements so a bad rule can never blank out the page.
 */
export function hideElement(element: Element): boolean {
  if (PROTECTED_TAGS.has(element.tagName)) return false;
  if (!(element instanceof HTMLElement)) return false;
  if (element.dataset.clearblockHidden === '1') return false;

  element.dataset.clearblockHidden = '1';
  element.style.setProperty('display', 'none', 'important');
  hiddenCount += 1;
  return true;
}

/** Reverts everything `hideElement` did. Used when protection is turned off live. */
export function unhideAll(): void {
  const hidden = document.querySelectorAll<HTMLElement>('[data-clearblock-hidden="1"]');
  hidden.forEach((element) => {
    element.style.removeProperty('display');
    delete element.dataset.clearblockHidden;
  });
  hiddenCount = 0;
}

/**
 * Overlay ads commonly lock page scrolling and leave it locked once the overlay itself is
 * hidden. Releasing the lock is only done when we actually hid a viewport-covering fixed
 * element, so normal modals (cookie prompts, site dialogs) are untouched.
 */
export function releaseScrollLock(): void {
  for (const element of [document.documentElement, document.body]) {
    if (!element) continue;
    const overflow = element.style.overflow;
    if (overflow === 'hidden') {
      element.style.removeProperty('overflow');
      log.debug('released scroll lock on', element.tagName);
    }
    if (element.style.position === 'fixed') {
      element.style.removeProperty('position');
    }
  }
}

/** True when the element covers most of the viewport and is pinned to it. */
export function isViewportOverlay(element: Element): boolean {
  const style = getComputedStyle(element);
  if (style.position !== 'fixed' && style.position !== 'sticky') return false;
  const rect = element.getBoundingClientRect();
  const coverage = (rect.width * rect.height) / (window.innerWidth * window.innerHeight || 1);
  return coverage > 0.5;
}
