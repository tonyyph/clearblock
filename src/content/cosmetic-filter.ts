/**
 * Cosmetic filtering controller.
 *
 * The heavy lifting is done by a stylesheet (see element-hider.ts), which is live and
 * needs no scanning. This observer exists only for the things CSS cannot do:
 *
 *   1. counting how many ad elements were hidden, for the popup;
 *   2. collapsing ad containers that are left empty after their contents were blocked;
 *   3. releasing a page scroll-lock left behind by a hidden full-screen overlay ad.
 *
 * Performance rules it follows: one observer per document, mutations batched behind a
 * single rAF/timeout, a hard cap on nodes inspected per batch, and a WeakSet so no
 * element is ever examined twice.
 */
import { createLogger } from '../shared/logger';
import {
  applyStylesheet,
  countHidden,
  getHiddenCount,
  hideElement,
  isViewportOverlay,
  markProcessed,
  releaseScrollLock,
  removeStylesheet,
  resetHiddenCount,
  unhideAll,
} from './element-hider';
import { GENERIC_SELECTORS, PLACEHOLDER_SELECTORS, selectorsForHostname } from './selectors';

const log = createLogger('cosmetic');

/** Upper bound on elements inspected per batch, so a huge DOM insert cannot stall a frame. */
const MAX_NODES_PER_BATCH = 300;
/** Upper bound on the one-off initial count pass. */
const MAX_INITIAL_SCAN = 500;
const BATCH_DELAY_MS = 150;

export type CosmeticConfig = {
  hostname: string;
  customSelectors: readonly string[];
};

let observer: MutationObserver | null = null;
let scheduled = false;
let rafHandle: number | null = null;
let timerHandle: ReturnType<typeof setTimeout> | null = null;
let pending: Element[] = [];
let activeSelector = '';
let placeholderSelector = '';
let running = false;

function buildSelectorList(config: CosmeticConfig): string[] {
  return [
    ...GENERIC_SELECTORS,
    ...selectorsForHostname(config.hostname),
    ...config.customSelectors,
  ];
}

/** An ad container counts as empty when it renders nothing: no text, no visible child box. */
function isEmptyPlaceholder(element: Element): boolean {
  if (element.childElementCount === 0) {
    return (element.textContent ?? '').trim().length === 0;
  }
  const rect = element.getBoundingClientRect();
  if (rect.height > 0 && rect.width > 0) return false;
  return (element.textContent ?? '').trim().length === 0;
}

function inspect(element: Element): void {
  if (!markProcessed(element)) return;

  try {
    if (activeSelector && element.matches(activeSelector)) {
      countHidden();
      // A hidden full-screen overlay often leaves the page unscrollable.
      if (isViewportOverlay(element)) releaseScrollLock();
      return;
    }
    if (
      placeholderSelector &&
      element.matches(placeholderSelector) &&
      isEmptyPlaceholder(element)
    ) {
      hideElement(element);
    }
  } catch (error) {
    // A malformed custom selector must never break the page.
    log.debug('inspect failed', error);
  }
}

function flush(): void {
  scheduled = false;
  rafHandle = null;
  timerHandle = null;
  if (!running) return;

  const batch = pending;
  pending = [];

  let budget = MAX_NODES_PER_BATCH;
  for (const node of batch) {
    if (budget <= 0) break;
    if (!node.isConnected) continue;
    inspect(node);
    budget -= 1;

    // Ad markup is usually inserted as a subtree; check descendants within the same budget.
    if (budget <= 0) break;
    const descendants = node.querySelectorAll('*');
    const limit = Math.min(descendants.length, budget);
    for (let i = 0; i < limit; i += 1) {
      const child = descendants[i];
      if (child) inspect(child);
    }
    budget -= limit;
  }
}

function schedule(): void {
  if (scheduled) return;
  scheduled = true;
  // rAF keeps work off the critical path; the timer is the fallback for background tabs,
  // where rAF never fires (and for environments that do not provide it at all).
  if (typeof requestAnimationFrame === 'function') {
    rafHandle = requestAnimationFrame(() => {
      if (timerHandle !== null) clearTimeout(timerHandle);
      flush();
    });
  }
  timerHandle = setTimeout(() => {
    if (rafHandle !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafHandle);
    }
    flush();
  }, BATCH_DELAY_MS);
}

function onMutations(records: MutationRecord[]): void {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) pending.push(node as Element);
    }
  }
  if (pending.length > 0) schedule();
}

/** One-off pass to count what the stylesheet hid before the observer was attached. */
function initialScan(): void {
  if (!activeSelector) return;
  try {
    const matches = document.querySelectorAll(activeSelector);
    const limit = Math.min(matches.length, MAX_INITIAL_SCAN);
    for (let i = 0; i < limit; i += 1) {
      const element = matches[i];
      if (element && markProcessed(element)) countHidden();
    }
    log.debug('initial scan counted', limit, 'hidden elements');
  } catch (error) {
    log.debug('initial scan failed', error);
  }
}

export function startCosmeticFiltering(config: CosmeticConfig): void {
  const selectors = buildSelectorList(config);
  activeSelector = selectors.join(',');
  placeholderSelector = PLACEHOLDER_SELECTORS.join(',');
  applyStylesheet(selectors);

  if (running) return;
  running = true;
  resetHiddenCount();

  observer = new MutationObserver(onMutations);
  observer.observe(document.documentElement, { childList: true, subtree: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialScan, { once: true });
  } else {
    initialScan();
  }
  log.info('cosmetic filtering active', { selectors: selectors.length });
}

/** Fully reverts cosmetic filtering: stylesheet removed, observer disconnected. */
export function stopCosmeticFiltering(): void {
  running = false;
  observer?.disconnect();
  observer = null;
  if (rafHandle !== null && typeof cancelAnimationFrame === 'function') {
    cancelAnimationFrame(rafHandle);
  }
  if (timerHandle !== null) clearTimeout(timerHandle);
  rafHandle = null;
  timerHandle = null;
  scheduled = false;
  pending = [];
  removeStylesheet();
  unhideAll();
  activeSelector = '';
  log.info('cosmetic filtering stopped');
}

export function isCosmeticFilteringActive(): boolean {
  return running;
}

export function cosmeticHiddenCount(): number {
  return getHiddenCount();
}
