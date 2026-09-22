/**
 * Blocked-request counting.
 *
 * MV3 has no "onBlocked" event. The only supported way to learn what DNR blocked is
 * `chrome.declarativeNetRequest.getMatchedRules()`, which has two hard constraints:
 *
 *   1. Chrome retains matched-rule records for a limited window (5 minutes today).
 *   2. Without the `declarativeNetRequestFeedback` permission, the call is only allowed
 *      for a tab the extension has activeTab access to, and calls made outside a user
 *      gesture are quota-limited (20 per 10 minutes).
 *
 * So ClearBlock offers two honest modes and always labels which one produced a number:
 *
 *   sampled  (default) - we read matched rules for the active tab when the user opens the
 *                        popup. That is a real measurement, but it only covers activity in
 *                        the retention window, so totals under-count. Shown as "estimate".
 *   accurate (opt-in)  - the user grants `declarativeNetRequestFeedback` in Options; a
 *                        1-minute alarm then polls every tab, well inside the retention
 *                        window, so nothing is missed.
 *
 * Numbers are never synthesised. If we did not observe it, we do not count it.
 */
import { MATCHED_RULES_RETENTION_MS } from '../shared/constants';
import { createLogger } from '../shared/logger';
import { readStatistics, trimTabCounters, writeStatistics } from '../shared/storage';
import type { StoredStatistics } from '../shared/storage';
import type { CountingMode, StatisticsSnapshot } from '../shared/types';

const log = createLogger('stats');

type MatchedRuleRecord = {
  rule: { ruleId: number; rulesetId: string };
  tabId: number;
  timeStamp: number;
};

/** In-memory mirror of the persisted counters; storage stays the source of truth. */
let cache: StoredStatistics | null = null;
let pendingWrite: Promise<unknown> | null = null;

async function load(): Promise<StoredStatistics> {
  if (!cache) cache = await readStatistics();
  return cache;
}

async function persist(next: StoredStatistics): Promise<void> {
  cache = next;
  // Coalesce concurrent writes so a burst of polls cannot interleave.
  pendingWrite = (pendingWrite ?? Promise.resolve()).then(() => writeStatistics(next));
  await pendingWrite;
}

function recordKey(record: MatchedRuleRecord): string {
  return `${record.tabId}:${record.rule.rulesetId}:${record.rule.ruleId}:${record.timeStamp}`;
}

/**
 * Folds a batch of matched-rule records into the counters, skipping anything already
 * counted. De-duplication uses the newest timestamp seen plus the set of keys sitting
 * exactly on that boundary, which stays exact across service-worker restarts.
 */
export function foldRecords(
  stats: StoredStatistics,
  records: readonly MatchedRuleRecord[],
): StoredStatistics {
  if (records.length === 0) return stats;

  const boundary = new Set(stats.boundaryKeys);
  let { lastRecordTimestamp, totalBlocked } = stats;
  const blockedByTab: Record<number, number> = { ...stats.blockedByTab };
  let newBoundary = boundary;
  let counted = 0;

  const sorted = [...records].sort((a, b) => a.timeStamp - b.timeStamp);

  for (const record of sorted) {
    if (record.timeStamp < lastRecordTimestamp) continue;
    const key = recordKey(record);
    if (record.timeStamp === lastRecordTimestamp && boundary.has(key)) continue;

    if (record.timeStamp > lastRecordTimestamp) {
      lastRecordTimestamp = record.timeStamp;
      newBoundary = new Set<string>();
    }
    newBoundary.add(key);
    boundary.add(key);

    totalBlocked += 1;
    counted += 1;
    // tabId is -1 for requests not attributable to a tab (e.g. a service worker fetch).
    if (record.tabId >= 0) {
      blockedByTab[record.tabId] = (blockedByTab[record.tabId] ?? 0) + 1;
    }
  }

  if (counted === 0) return stats;

  return {
    ...stats,
    totalBlocked,
    blockedByTab: trimTabCounters(blockedByTab),
    lastRecordTimestamp,
    boundaryKeys: [...newBoundary],
  };
}

async function getMatchedRules(
  filter: chrome.declarativeNetRequest.MatchedRulesFilter,
): Promise<MatchedRuleRecord[]> {
  try {
    const result = await chrome.declarativeNetRequest.getMatchedRules(filter);
    return (result?.rulesMatchedInfo ?? []) as MatchedRuleRecord[];
  } catch (error) {
    // Expected when activeTab has not been granted for this tab, or the quota is spent.
    log.debug('getMatchedRules unavailable', error);
    return [];
  }
}

/** Reads matched rules for one tab. Valid under activeTab, e.g. when the popup opens. */
export async function sampleTab(tabId: number): Promise<void> {
  const records = await getMatchedRules({
    tabId,
    minTimeStamp: Date.now() - MATCHED_RULES_RETENTION_MS,
  });
  const stats = await load();
  const next = foldRecords(stats, records);
  if (next !== stats) await persist(next);
}

/** Reads matched rules across all tabs. Requires the optional feedback permission. */
export async function pollAllTabs(): Promise<void> {
  const records = await getMatchedRules({
    minTimeStamp: Date.now() - MATCHED_RULES_RETENTION_MS,
  });
  const stats = await load();
  const next = foldRecords(stats, records);
  if (next !== stats) await persist(next);
}

export async function getSnapshot(
  tabId: number | null,
  mode: CountingMode,
): Promise<StatisticsSnapshot> {
  const stats = await load();
  return {
    totalBlocked: stats.totalBlocked,
    tabBlocked: tabId === null ? 0 : (stats.blockedByTab[tabId] ?? 0),
    mode,
    updatedAt: stats.lastRecordTimestamp,
  };
}

/** Drops a tab's counter — called when the tab closes or navigates to a new page. */
export async function forgetTab(tabId: number): Promise<void> {
  const stats = await load();
  if (!(tabId in stats.blockedByTab)) return;
  const blockedByTab = { ...stats.blockedByTab };
  delete blockedByTab[tabId];
  await persist({ ...stats, blockedByTab });
}

/** Removes counters for tabs that no longer exist. Runs on the maintenance alarm. */
export async function pruneClosedTabs(): Promise<void> {
  const stats = await load();
  if (Object.keys(stats.blockedByTab).length === 0) return;
  let liveTabIds: Set<number>;
  try {
    const tabs = await chrome.tabs.query({});
    liveTabIds = new Set(tabs.map((tab) => tab.id).filter((id): id is number => id !== undefined));
  } catch (error) {
    log.warn('tabs.query failed during prune', error);
    return;
  }
  const blockedByTab = trimTabCounters(stats.blockedByTab, liveTabIds);
  if (Object.keys(blockedByTab).length === Object.keys(stats.blockedByTab).length) return;
  await persist({ ...stats, blockedByTab });
}

export async function resetStatistics(mode: CountingMode): Promise<StatisticsSnapshot> {
  const stats = await load();
  await persist({
    ...stats,
    totalBlocked: 0,
    blockedByTab: {},
    lastResetAt: Date.now(),
    // The de-duplication cursor is deliberately preserved: resetting the counter must not
    // re-count records that are still inside Chrome's retention window.
  });
  return getSnapshot(null, mode);
}

/** Test seam: forces the next read to go back to storage. */
export function invalidateCache(): void {
  cache = null;
}
