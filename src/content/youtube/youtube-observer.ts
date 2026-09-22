/**
 * A single, bounded MutationObserver helper.
 *
 * Everything YouTube-related shares one observer instance: mutations are coalesced behind
 * one timer, the callback receives no per-node data (the controller re-queries the small
 * set of selectors it cares about), and the observer is scoped to the player subtree when
 * one exists rather than the whole document.
 */
import { createLogger } from '../../shared/logger';

const log = createLogger('yt-observer');

const DEFAULT_DELAY_MS = 250;

export type BoundedObserver = {
  observe: (target: Node, options?: MutationObserverInit) => void;
  disconnect: () => void;
  isObserving: () => boolean;
};

export function createBoundedObserver(
  onBatch: () => void,
  delayMs: number = DEFAULT_DELAY_MS,
): BoundedObserver {
  let observer: MutationObserver | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let currentTarget: Node | null = null;

  const flush = (): void => {
    timer = null;
    try {
      onBatch();
    } catch (error) {
      // A stale selector must never throw into the page.
      log.debug('batch handler failed', error);
    }
  };

  const schedule = (): void => {
    if (timer !== null) return;
    timer = setTimeout(flush, delayMs);
  };

  return {
    observe(target, options = { childList: true, subtree: true }) {
      if (currentTarget === target && observer) return;
      observer?.disconnect();
      observer = new MutationObserver(schedule);
      observer.observe(target, options);
      currentTarget = target;
      // Run once immediately so state that already exists is handled.
      schedule();
    },
    disconnect() {
      observer?.disconnect();
      observer = null;
      currentTarget = null;
      if (timer !== null) {
        clearTimeout(timer);
        timer = null;
      }
    },
    isObserving() {
      return observer !== null;
    },
  };
}
