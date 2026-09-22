/**
 * SPA navigation tracking for YouTube.
 *
 * YouTube never reloads the document, so everything else in the module has to be told when
 * the page identity changes. We listen to the events YouTube actually fires plus the
 * History API ones — no polling, because a short interval on every YouTube tab is exactly
 * the kind of cost an ad blocker must not add.
 */
import { createLogger } from '../../shared/logger';

const log = createLogger('yt-nav');

export type NavigationListener = (url: URL) => void;

const YT_EVENTS = ['yt-navigate-finish', 'yt-page-data-updated'] as const;
const WINDOW_EVENTS = ['popstate', 'hashchange'] as const;

export type NavigationWatcher = {
  start: () => void;
  stop: () => void;
  currentUrl: () => URL;
};

export function createNavigationWatcher(listener: NavigationListener): NavigationWatcher {
  let lastHref = location.href;
  let started = false;

  const emit = (): void => {
    if (location.href === lastHref) return;
    lastHref = location.href;
    try {
      const url = new URL(location.href);
      log.debug('navigated', url.pathname);
      listener(url);
    } catch (error) {
      log.debug('navigation parse failed', error);
    }
  };

  const handler = (): void => {
    // YouTube fires its events before the new DOM is committed; defer one task so the
    // player element for the new page exists by the time listeners run.
    setTimeout(emit, 0);
  };

  return {
    start() {
      if (started) return;
      started = true;
      for (const event of YT_EVENTS) document.addEventListener(event, handler, true);
      for (const event of WINDOW_EVENTS) window.addEventListener(event, handler);
    },
    stop() {
      if (!started) return;
      started = false;
      for (const event of YT_EVENTS) document.removeEventListener(event, handler, true);
      for (const event of WINDOW_EVENTS) window.removeEventListener(event, handler);
    },
    currentUrl() {
      return new URL(location.href);
    },
  };
}
