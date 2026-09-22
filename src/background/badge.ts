/**
 * Toolbar badge.
 *
 * The badge only ever shows something we actually measured:
 *  - "off" when protection is paused for that tab (globally or via the allowlist);
 *  - a blocked count only in accurate counting mode, where the number is continuously
 *    polled. In sampled mode we deliberately show nothing rather than a stale number.
 */
import { createLogger } from '../shared/logger';

const log = createLogger('badge');

const COLOR_PAUSED = '#6B7280';
const COLOR_ACTIVE = '#F97316';

function formatCount(count: number): string {
  if (count <= 0) return '';
  if (count < 1000) return String(count);
  if (count < 10_000) return `${Math.floor(count / 100) / 10}k`;
  return `${Math.floor(count / 1000)}k`;
}

export async function updateBadge(
  tabId: number,
  options: { paused: boolean; count: number; showCount: boolean },
): Promise<void> {
  const text = options.paused ? 'off' : options.showCount ? formatCount(options.count) : '';
  try {
    await chrome.action.setBadgeText({ tabId, text });
    await chrome.action.setBadgeBackgroundColor({
      tabId,
      color: options.paused ? COLOR_PAUSED : COLOR_ACTIVE,
    });
  } catch (error) {
    // The tab closed while we were updating it.
    log.debug('badge update skipped', error);
  }
}

export async function clearBadge(tabId: number): Promise<void> {
  try {
    await chrome.action.setBadgeText({ tabId, text: '' });
  } catch {
    // Tab is gone; nothing to clear.
  }
}
