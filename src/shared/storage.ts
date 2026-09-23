/**
 * The only module that knows the shape of persisted data.
 *
 * Everything read from chrome.storage is treated as untrusted: it may come from an older
 * version of the extension, from a partially-written record, or from a user editing
 * storage by hand. `validateSettings` therefore never throws — it repairs.
 */
import {
  DEFAULT_SETTINGS,
  MAX_TRACKED_TABS,
  STORAGE_KEYS,
  STORAGE_SCHEMA_VERSION,
} from './constants';
import { sanitizeAllowlist } from './domain';
import { createLogger } from './logger';
import { storageGet, storageSet } from './browser-api';
import type { BlockingStatistics, ExtensionSettings, ThemePreference } from './types';

const log = createLogger('storage');

export type StoredSettings = ExtensionSettings & { schemaVersion: number };

export type StoredStatistics = BlockingStatistics & {
  schemaVersion: number;
  lastResetAt: number;
  /** Newest matched-rule timestamp already folded in, so polls never double-count. */
  lastRecordTimestamp: number;
  /**
   * Keys of the records seen at exactly `lastRecordTimestamp`. Chrome reports matched
   * rules with millisecond timestamps, so several records can share the boundary; keeping
   * them lets de-duplication stay exact across service-worker restarts.
   */
  boundaryKeys: string[];
};

const THEMES: ThemePreference[] = ['light', 'dark', 'system'];

const MAX_CUSTOM_SELECTORS = 200;
const MAX_SELECTOR_LENGTH = 300;
const MAX_ALLOWLIST_ENTRIES = 2000;

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function asNonNegativeInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : fallback;
}

/**
 * A custom cosmetic selector is injected into a stylesheet, so it must be a selector and
 * nothing else. Anything containing a brace, an at-rule or a comment is rejected outright,
 * and the selector must actually parse.
 */
export function isSafeSelector(selector: unknown): selector is string {
  if (typeof selector !== 'string') return false;
  const value = selector.trim();
  if (!value || value.length > MAX_SELECTOR_LENGTH) return false;
  if (/[{}@;]/.test(value)) return false;
  if (value.includes('/*') || value.includes('*/')) return false;
  if (value.includes('<')) return false;
  // The service worker has no DOM, so fall back to a structural check there.
  if (typeof document === 'undefined') {
    return /^[a-zA-Z0-9\s.#_\-[\]="'^$*|~:(),>+]+$/.test(value);
  }
  try {
    // Throws SyntaxError for an invalid selector.
    document.createDocumentFragment().querySelector(value);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeSelectors(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!isSafeSelector(entry)) continue;
    seen.add(entry.trim());
    if (seen.size >= MAX_CUSTOM_SELECTORS) break;
  }
  return [...seen];
}

/** Repairs any value into a complete, in-range settings object. */
export function validateSettings(value: unknown): ExtensionSettings {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const theme = THEMES.includes(raw.theme as ThemePreference)
    ? (raw.theme as ThemePreference)
    : DEFAULT_SETTINGS.theme;

  return {
    enabled: asBoolean(raw.enabled, DEFAULT_SETTINGS.enabled),
    cosmeticFilteringEnabled: asBoolean(
      raw.cosmeticFilteringEnabled,
      DEFAULT_SETTINGS.cosmeticFilteringEnabled,
    ),
    youtubeProtectionEnabled: asBoolean(
      raw.youtubeProtectionEnabled,
      DEFAULT_SETTINGS.youtubeProtectionEnabled,
    ),
    trackerBlockingEnabled: asBoolean(
      raw.trackerBlockingEnabled,
      DEFAULT_SETTINGS.trackerBlockingEnabled,
    ),
    annoyanceBlockingEnabled: asBoolean(
      raw.annoyanceBlockingEnabled,
      DEFAULT_SETTINGS.annoyanceBlockingEnabled,
    ),
    regionalBlockingEnabled: asBoolean(
      raw.regionalBlockingEnabled,
      DEFAULT_SETTINGS.regionalBlockingEnabled,
    ),
    accurateCountingEnabled: asBoolean(
      raw.accurateCountingEnabled,
      DEFAULT_SETTINGS.accurateCountingEnabled,
    ),
    theme,
    allowlistedDomains: sanitizeAllowlist(
      Array.isArray(raw.allowlistedDomains) ? raw.allowlistedDomains : [],
    ).slice(0, MAX_ALLOWLIST_ENTRIES),
    customCosmeticSelectors: sanitizeSelectors(raw.customCosmeticSelectors),
  };
}

/** Caps `blockedByTab` so a long browsing session cannot grow storage without bound. */
export function trimTabCounters(
  blockedByTab: Record<number, number>,
  liveTabIds?: ReadonlySet<number>,
): Record<number, number> {
  const entries = Object.entries(blockedByTab)
    .map(([id, count]) => [Number(id), asNonNegativeInt(count, 0)] as const)
    .filter(([id, count]) => Number.isInteger(id) && id >= 0 && count > 0)
    .filter(([id]) => (liveTabIds ? liveTabIds.has(id) : true));

  // Keep the busiest tabs when we have to drop some: they are the ones a user notices.
  entries.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(entries.slice(0, MAX_TRACKED_TABS));
}

export function validateStatistics(value: unknown): StoredStatistics {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const byTab =
    typeof raw.blockedByTab === 'object' && raw.blockedByTab !== null
      ? (raw.blockedByTab as Record<number, number>)
      : {};
  return {
    schemaVersion: STORAGE_SCHEMA_VERSION,
    totalBlocked: asNonNegativeInt(raw.totalBlocked, 0),
    blockedByTab: trimTabCounters(byTab),
    lastResetAt: asNonNegativeInt(raw.lastResetAt, 0),
    lastRecordTimestamp: asNonNegativeInt(raw.lastRecordTimestamp, 0),
    boundaryKeys: Array.isArray(raw.boundaryKeys)
      ? raw.boundaryKeys.filter((key): key is string => typeof key === 'string').slice(0, 500)
      : [],
  };
}

/**
 * Storage migration. Version 1 is the initial schema, so there is nothing to translate
 * yet; unknown/older records simply fall through `validateSettings`, which fills in
 * defaults for any field the old shape lacked. Future migrations chain here.
 */
export function migrateSettings(value: unknown): StoredSettings {
  const raw = (typeof value === 'object' && value !== null ? value : {}) as Record<string, unknown>;
  const version = asNonNegativeInt(raw.schemaVersion, 0);
  if (version > STORAGE_SCHEMA_VERSION) {
    // Downgrade: a newer build wrote this. Keep what we understand, drop the rest.
    log.warn('settings written by a newer version; reading conservatively');
  }
  return { ...validateSettings(raw), schemaVersion: STORAGE_SCHEMA_VERSION };
}

export async function readSettings(): Promise<ExtensionSettings> {
  const stored = await storageGet<unknown>(STORAGE_KEYS.settings);
  // `schemaVersion` is storage bookkeeping; the rest of the app never sees it.
  return validateSettings(migrateSettings(stored));
}

export async function writeSettings(settings: ExtensionSettings): Promise<ExtensionSettings> {
  const validated = validateSettings(settings);
  await storageSet({
    [STORAGE_KEYS.settings]: { ...validated, schemaVersion: STORAGE_SCHEMA_VERSION },
  });
  return validated;
}

export async function patchSettings(patch: Partial<ExtensionSettings>): Promise<ExtensionSettings> {
  const current = await readSettings();
  return writeSettings({ ...current, ...patch });
}

export async function readStatistics(): Promise<StoredStatistics> {
  const stored = await storageGet<unknown>(STORAGE_KEYS.statistics);
  return validateStatistics(stored);
}

export async function writeStatistics(stats: StoredStatistics): Promise<StoredStatistics> {
  const validated = validateStatistics(stats);
  await storageSet({ [STORAGE_KEYS.statistics]: validated });
  return validated;
}

/** Subscribes to settings changes written by any other extension context. */
export function onSettingsChanged(listener: (settings: ExtensionSettings) => void): () => void {
  const handler = (
    changes: Record<string, chrome.storage.StorageChange>,
    areaName: string,
  ): void => {
    if (areaName !== 'local') return;
    const change = changes[STORAGE_KEYS.settings];
    if (!change) return;
    listener(validateSettings(change.newValue));
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
