/** Identifiers of the static declarativeNetRequest rulesets shipped with the extension. */
export type RulesetId = 'ads' | 'trackers' | 'annoyances';

export type ThemePreference = 'light' | 'dark' | 'system';

export type ExtensionSettings = {
  enabled: boolean;
  cosmeticFilteringEnabled: boolean;
  youtubeProtectionEnabled: boolean;
  trackerBlockingEnabled: boolean;
  annoyanceBlockingEnabled: boolean;
  /** Opt-in: use declarativeNetRequestFeedback for continuous (non-sampled) counting. */
  accurateCountingEnabled: boolean;
  theme: ThemePreference;
  allowlistedDomains: string[];
  /** User-supplied cosmetic selectors, applied on top of the built-in list. */
  customCosmeticSelectors: string[];
};

export type BlockingStatistics = {
  totalBlocked: number;
  blockedByTab: Record<number, number>;
};

/** How a statistics value was obtained — surfaced in the UI so numbers are never oversold. */
export type CountingMode = 'sampled' | 'accurate';

export type StatisticsSnapshot = {
  totalBlocked: number;
  tabBlocked: number;
  mode: CountingMode;
  /** Wall-clock ms of the newest matched-rule record we have folded into the counters. */
  updatedAt: number;
};

export type RulesetInfo = {
  id: RulesetId;
  enabled: boolean;
  ruleCount: number;
  /** ISO date the bundled list was last edited (baked in at build time). */
  updatedAt: string;
  description: string;
};

export type SiteStatus = {
  /** null when the tab is a browser/system page ClearBlock cannot touch. */
  hostname: string | null;
  url: string | null;
  supported: boolean;
  /** Global protection switch. */
  globallyEnabled: boolean;
  /** False when this hostname is allowlisted. */
  siteEnabled: boolean;
  tabId: number | null;
};

/* ------------------------------------------------------------------ *
 * Message protocol
 * ------------------------------------------------------------------ */

export type ExtensionMessage =
  | { type: 'GET_CURRENT_SITE_STATUS'; tabId?: number }
  | { type: 'SET_SITE_ENABLED'; hostname: string; enabled: boolean }
  | { type: 'GET_STATISTICS'; tabId?: number }
  | { type: 'RESET_STATISTICS' }
  | { type: 'GET_SETTINGS' }
  | { type: 'UPDATE_SETTINGS'; payload: Partial<ExtensionSettings> }
  | { type: 'REFRESH_FILTERS' }
  | { type: 'GET_RULESET_INFO' }
  | { type: 'OPEN_OPTIONS' };

/** Messages the background sends *to* a content script. */
export type ContentMessage = { type: 'PING' } | { type: 'GET_CONTENT_STATE' };

export type ContentState = {
  hostname: string;
  active: boolean;
  hiddenElements: number;
  youtubeActive: boolean;
};

export type MessageResponse<T> = { ok: true; data: T } | { ok: false; error: string };

/** Maps every request message to the payload its handler resolves with. */
export type MessageResultMap = {
  GET_CURRENT_SITE_STATUS: SiteStatus;
  SET_SITE_ENABLED: { hostname: string; enabled: boolean; reloadSuggested: boolean };
  GET_STATISTICS: StatisticsSnapshot;
  RESET_STATISTICS: StatisticsSnapshot;
  GET_SETTINGS: ExtensionSettings;
  UPDATE_SETTINGS: ExtensionSettings;
  REFRESH_FILTERS: { rulesets: RulesetInfo[] };
  GET_RULESET_INFO: { rulesets: RulesetInfo[] };
  OPEN_OPTIONS: { opened: boolean };
};
