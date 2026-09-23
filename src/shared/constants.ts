import type { ExtensionSettings, RulesetId } from './types';

export const EXTENSION_NAME = 'ClearBlock';

/** Bump when the shape of stored data changes; see `migrateState` in storage.ts. */
export const STORAGE_SCHEMA_VERSION = 1;

export const STORAGE_KEYS = {
  settings: 'clearblock:settings',
  statistics: 'clearblock:statistics',
} as const;

export const RULESET_IDS: readonly RulesetId[] = [
  'ads',
  'trackers',
  'annoyances',
  'regional-vi',
] as const;

/**
 * Static rule IDs are allocated in millions by ruleset (ads 1_000_000+, trackers
 * 2_000_000+, annoyances 3_000_000+, regional 4_000_000+) by scripts/compile-filters.mjs.
 * Dynamic rules sit well below all of them, so the two spaces can never collide.
 */
export const DYNAMIC_RULE_ID_BASE = 100_000;

/** Allowlist rules must outrank every blocking rule. */
export const ALLOWLIST_RULE_PRIORITY = 10_000;

export const DEFAULT_SETTINGS: ExtensionSettings = {
  enabled: true,
  cosmeticFilteringEnabled: true,
  youtubeProtectionEnabled: true,
  trackerBlockingEnabled: true,
  annoyanceBlockingEnabled: true,
  regionalBlockingEnabled: true,
  accurateCountingEnabled: false,
  theme: 'system',
  allowlistedDomains: [],
  customCosmeticSelectors: [],
};

/**
 * Chrome only retains matched-rule records for a short window (5 minutes at time of
 * writing) and `getMatchedRules` is quota-limited when called without a user gesture.
 * Both numbers are documented in README.md under "How blocked counts are measured".
 */
export const MATCHED_RULES_RETENTION_MS = 5 * 60 * 1000;
export const STATS_ALARM_NAME = 'clearblock:stats-poll';
export const STATS_ALARM_PERIOD_MINUTES = 1;
export const MAINTENANCE_ALARM_NAME = 'clearblock:maintenance';
export const MAINTENANCE_ALARM_PERIOD_MINUTES = 60;

/** Cap on per-tab counters retained in storage, so stats can never grow unbounded. */
export const MAX_TRACKED_TABS = 200;

export const ISSUE_REPORT_URL = 'https://github.com/tonyyph/clearblock/issues/new';
