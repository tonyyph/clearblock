import { vi } from 'vitest';
import rulesetMetadata from '../../src/rules/metadata.json';
import { DEFAULT_SETTINGS } from '../../src/shared/constants';
import type { ExtensionMessage, ExtensionSettings, SiteStatus } from '../../src/shared/types';

export type RouterOptions = {
  settings?: Partial<ExtensionSettings>;
  siteStatus?: Partial<SiteStatus>;
  statistics?: { totalBlocked?: number; tabBlocked?: number; mode?: 'sampled' | 'accurate' };
};

/**
 * Routes chrome.runtime.sendMessage to canned responses so a UI test exercises the real
 * message protocol rather than a stubbed hook.
 */
export function installMessageRouter(options: RouterOptions = {}) {
  let settings: ExtensionSettings = { ...DEFAULT_SETTINGS, ...options.settings };
  const sent: ExtensionMessage[] = [];

  const siteStatus: SiteStatus = {
    hostname: 'example.com',
    url: 'https://example.com/',
    supported: true,
    globallyEnabled: true,
    siteEnabled: true,
    tabId: 1,
    ...options.siteStatus,
  };

  const statistics = {
    totalBlocked: 1234,
    tabBlocked: 12,
    mode: 'sampled' as const,
    updatedAt: Date.now(),
    ...options.statistics,
  };

  chrome.runtime.sendMessage = vi.fn(async (message: ExtensionMessage) => {
    sent.push(message);
    switch (message.type) {
      case 'GET_SETTINGS':
        return { ok: true, data: settings };
      case 'UPDATE_SETTINGS':
        settings = { ...settings, ...message.payload };
        return { ok: true, data: settings };
      case 'GET_CURRENT_SITE_STATUS':
        return { ok: true, data: siteStatus };
      case 'SET_SITE_ENABLED':
        return {
          ok: true,
          data: { hostname: message.hostname, enabled: message.enabled, reloadSuggested: true },
        };
      case 'GET_STATISTICS':
      case 'RESET_STATISTICS':
        return { ok: true, data: statistics };
      case 'GET_RULESET_INFO':
      case 'REFRESH_FILTERS':
        // Sourced from the generated metadata so this fixture cannot go stale when the
        // bundled filter lists change.
        return {
          ok: true,
          data: { rulesets: rulesetMetadata.map((entry) => ({ ...entry, enabled: true })) },
        };
      case 'OPEN_OPTIONS':
        return { ok: true, data: { opened: true } };
      default:
        return { ok: false, error: 'unhandled' };
    }
  }) as never;

  return {
    sent,
    get settings() {
      return settings;
    },
    sentOf<T extends ExtensionMessage['type']>(type: T) {
      return sent.filter((message) => message.type === type) as Extract<
        ExtensionMessage,
        { type: T }
      >[];
    },
  };
}
