/**
 * ClearBlock service worker.
 *
 * MV3 service workers are suspended aggressively, so nothing here may assume that
 * module-level state survived since the last event. `ensureReady()` rebuilds everything
 * from chrome.storage on every wake-up; memory is only ever a cache.
 */
import {
  MAINTENANCE_ALARM_NAME,
  MAINTENANCE_ALARM_PERIOD_MINUTES,
  STATS_ALARM_NAME,
  STATS_ALARM_PERIOD_MINUTES,
} from '../shared/constants';
import { isAllowlisted, isSystemPage, parseHostname } from '../shared/domain';
import { createLogger } from '../shared/logger';
import { fail, ok, parseMessage } from '../shared/messaging';
import { getActiveTab, getTab, hasPermission } from '../shared/browser-api';
import { patchSettings, readSettings, writeSettings } from '../shared/storage';
import type {
  CountingMode,
  ExtensionMessage,
  ExtensionSettings,
  MessageResponse,
  SiteStatus,
} from '../shared/types';
import { syncAllowlistRules, toggleDomain } from './allowlist-manager';
import { getRulesetInfo, syncRulesets } from './rule-manager';
import {
  forgetTab,
  getSnapshot,
  pollAllTabs,
  pruneClosedTabs,
  resetStatistics,
  sampleTab,
} from './statistics-manager';
import { clearBadge, updateBadge } from './badge';

const log = createLogger('sw');

let readyPromise: Promise<ExtensionSettings> | null = null;

/** Idempotent boot: settings -> rulesets -> allowlist -> alarms. Safe to call on any event. */
function ensureReady(): Promise<ExtensionSettings> {
  if (!readyPromise) {
    readyPromise = (async () => {
      const settings = await readSettings();
      await syncRulesets(settings);
      await syncAllowlistRules(settings.allowlistedDomains);
      await syncAlarms(settings);
      return settings;
    })().catch((error) => {
      log.error('initialisation failed', error);
      readyPromise = null;
      throw error;
    });
  }
  return readyPromise;
}

async function countingMode(settings: ExtensionSettings): Promise<CountingMode> {
  if (!settings.accurateCountingEnabled) return 'sampled';
  return (await hasPermission('declarativeNetRequestFeedback')) ? 'accurate' : 'sampled';
}

async function syncAlarms(settings: ExtensionSettings): Promise<void> {
  await chrome.alarms.create(MAINTENANCE_ALARM_NAME, {
    periodInMinutes: MAINTENANCE_ALARM_PERIOD_MINUTES,
  });

  const mode = await countingMode(settings);
  if (mode === 'accurate') {
    await chrome.alarms.create(STATS_ALARM_NAME, {
      periodInMinutes: STATS_ALARM_PERIOD_MINUTES,
    });
  } else {
    await chrome.alarms.clear(STATS_ALARM_NAME);
  }
}

async function buildSiteStatus(
  settings: ExtensionSettings,
  tabId: number | undefined,
): Promise<SiteStatus> {
  const tab = tabId === undefined ? await getActiveTab() : await getTab(tabId);
  const url = tab?.url ?? null;
  const supported = !isSystemPage(url);
  const hostname = supported ? parseHostname(url) : null;

  return {
    hostname,
    url: supported ? url : null,
    supported: supported && hostname !== null,
    globallyEnabled: settings.enabled,
    siteEnabled: hostname ? !isAllowlisted(hostname, settings.allowlistedDomains) : false,
    tabId: tab?.id ?? null,
  };
}

async function refreshBadgeForTab(tabId: number, settings: ExtensionSettings): Promise<void> {
  const tab = await getTab(tabId);
  if (!tab?.url || isSystemPage(tab.url)) {
    await clearBadge(tabId);
    return;
  }
  const hostname = parseHostname(tab.url);
  const paused =
    !settings.enabled ||
    (hostname !== null && isAllowlisted(hostname, settings.allowlistedDomains));
  const mode = await countingMode(settings);
  const snapshot = await getSnapshot(tabId, mode);
  await updateBadge(tabId, {
    paused,
    count: snapshot.tabBlocked,
    showCount: mode === 'accurate',
  });
}

/* ------------------------------------------------------------------ *
 * Message handling
 * ------------------------------------------------------------------ */

async function handleMessage(message: ExtensionMessage): Promise<MessageResponse<unknown>> {
  await ensureReady();

  switch (message.type) {
    case 'GET_CURRENT_SITE_STATUS':
      return ok(await buildSiteStatus(await readSettings(), message.tabId));

    case 'SET_SITE_ENABLED': {
      const current = await readSettings();
      const allowlistedDomains = toggleDomain(
        current.allowlistedDomains,
        message.hostname,
        message.enabled,
      );
      const next = await writeSettings({ ...current, allowlistedDomains });
      await syncAllowlistRules(next.allowlistedDomains);
      return ok({
        hostname: message.hostname,
        enabled: message.enabled,
        // The caller decides what to do with this; ClearBlock never reloads silently.
        reloadSuggested: true,
      });
    }

    case 'GET_STATISTICS': {
      const current = await readSettings();
      const mode = await countingMode(current);
      const tabId = message.tabId ?? (await getActiveTab())?.id ?? null;
      // A popup request arrives inside a user gesture, so this sample is quota-free.
      if (tabId !== null) await sampleTab(tabId);
      if (mode === 'accurate') await pollAllTabs();
      return ok(await getSnapshot(tabId, mode));
    }

    case 'RESET_STATISTICS': {
      const mode = await countingMode(await readSettings());
      return ok(await resetStatistics(mode));
    }

    case 'GET_SETTINGS':
      return ok(await readSettings());

    case 'UPDATE_SETTINGS': {
      const next = await patchSettings(message.payload);
      await syncRulesets(next);
      await syncAllowlistRules(next.allowlistedDomains);
      await syncAlarms(next);
      return ok(next);
    }

    case 'REFRESH_FILTERS': {
      const current = await readSettings();
      await syncRulesets(current);
      await syncAllowlistRules(current.allowlistedDomains);
      return ok({ rulesets: await getRulesetInfo() });
    }

    case 'GET_RULESET_INFO':
      return ok({ rulesets: await getRulesetInfo() });

    case 'OPEN_OPTIONS':
      await chrome.runtime.openOptionsPage();
      return ok({ opened: true });

    default: {
      // Exhaustiveness guard: adding a message type without a handler fails typecheck.
      const exhaustive: never = message;
      return fail(`Unhandled message: ${JSON.stringify(exhaustive)}`);
    }
  }
}

chrome.runtime.onMessage.addListener((rawMessage, _sender, sendResponse) => {
  const message = parseMessage(rawMessage);
  if (!message) {
    // Never trust an inbound payload: content scripts and other extensions can send here.
    sendResponse(fail('Invalid message'));
    return false;
  }

  handleMessage(message)
    .then(sendResponse)
    .catch((error) => {
      log.error('handler threw', message.type, error);
      sendResponse(fail(error));
    });

  // Keeps the port open for the async response above.
  return true;
});

/* ------------------------------------------------------------------ *
 * Lifecycle
 * ------------------------------------------------------------------ */

chrome.runtime.onInstalled.addListener((details) => {
  log.info('installed', details.reason);
  void ensureReady();
});

chrome.runtime.onStartup.addListener(() => {
  void ensureReady();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  void forgetTab(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  // A new top-level document means the previous page's counter is no longer meaningful.
  if (changeInfo.url) {
    void forgetTab(tabId);
  }
  if (changeInfo.status === 'complete' || changeInfo.url) {
    void ensureReady().then((settings) => refreshBadgeForTab(tabId, settings));
  }
});

chrome.tabs.onActivated.addListener(({ tabId }) => {
  void ensureReady().then((settings) => refreshBadgeForTab(tabId, settings));
});

chrome.alarms.onAlarm.addListener((alarm) => {
  void (async () => {
    const settings = await ensureReady();
    if (alarm.name === STATS_ALARM_NAME) {
      if ((await countingMode(settings)) === 'accurate') await pollAllTabs();
      return;
    }
    if (alarm.name === MAINTENANCE_ALARM_NAME) {
      await pruneClosedTabs();
    }
  })();
});

chrome.permissions.onAdded.addListener(() => {
  void (async () => {
    readyPromise = null;
    await ensureReady();
  })();
});

chrome.permissions.onRemoved.addListener(() => {
  void (async () => {
    // Losing the feedback permission silently downgrades counting to sampled mode.
    const current = await readSettings();
    if (
      current.accurateCountingEnabled &&
      !(await hasPermission('declarativeNetRequestFeedback'))
    ) {
      await patchSettings({ accurateCountingEnabled: false });
    }
    readyPromise = null;
    await ensureReady();
  })();
});

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName !== 'local') return;
  if (!Object.keys(changes).some((key) => key.endsWith(':settings'))) return;
  void (async () => {
    const settings = await readSettings();
    // Diff-based, so a settings write from any context converges without a write loop.
    await syncRulesets(settings);
    await syncAllowlistRules(settings.allowlistedDomains);
    await syncAlarms(settings);
    const tab = await getActiveTab();
    if (tab?.id !== undefined) await refreshBadgeForTab(tab.id, settings);
  })();
});

// Wake-up path: the worker may have been revived by any event above.
void ensureReady();
