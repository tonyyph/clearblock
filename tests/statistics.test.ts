import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  foldRecords,
  getSnapshot,
  forgetTab,
  invalidateCache,
  pollAllTabs,
  pruneClosedTabs,
  resetStatistics,
  sampleTab,
} from '../src/background/statistics-manager';
import { validateStatistics } from '../src/shared/storage';

type Record_ = { rule: { ruleId: number; rulesetId: string }; tabId: number; timeStamp: number };

const record = (ruleId: number, tabId: number, timeStamp: number): Record_ => ({
  rule: { ruleId, rulesetId: 'ads' },
  tabId,
  timeStamp,
});

const empty = () => validateStatistics(undefined);

describe('foldRecords', () => {
  it('counts each record once, per tab and in total', () => {
    const result = foldRecords(empty(), [record(1, 5, 100), record(2, 5, 101), record(3, 9, 102)]);
    expect(result.totalBlocked).toBe(3);
    expect(result.blockedByTab).toEqual({ 5: 2, 9: 1 });
  });

  it('never double-counts a record seen in a previous poll', () => {
    const first = foldRecords(empty(), [record(1, 5, 100), record(2, 5, 101)]);
    // Chrome keeps returning the same records for the whole retention window.
    const second = foldRecords(first, [record(1, 5, 100), record(2, 5, 101), record(3, 5, 102)]);
    expect(second.totalBlocked).toBe(3);
    expect(second.blockedByTab).toEqual({ 5: 3 });
  });

  it('handles several records sharing the newest timestamp', () => {
    const first = foldRecords(empty(), [record(1, 5, 100), record(2, 5, 100)]);
    expect(first.totalBlocked).toBe(2);
    expect(first.boundaryKeys).toHaveLength(2);

    // A later poll returns the same boundary pair plus one more at the same millisecond.
    const second = foldRecords(first, [record(1, 5, 100), record(2, 5, 100), record(3, 5, 100)]);
    expect(second.totalBlocked).toBe(3);
  });

  it('counts tab-less requests in the total only', () => {
    const result = foldRecords(empty(), [record(1, -1, 100)]);
    expect(result.totalBlocked).toBe(1);
    expect(result.blockedByTab).toEqual({});
  });

  it('is order-independent', () => {
    const forward = foldRecords(empty(), [record(1, 5, 100), record(2, 5, 200)]);
    const backward = foldRecords(empty(), [record(2, 5, 200), record(1, 5, 100)]);
    expect(forward.totalBlocked).toBe(backward.totalBlocked);
  });

  it('returns the same object when there is nothing new, so no write happens', () => {
    const base = foldRecords(empty(), [record(1, 5, 100)]);
    expect(foldRecords(base, [])).toBe(base);
    expect(foldRecords(base, [record(1, 5, 100)])).toBe(base);
  });
});

describe('statistics manager against chrome.storage', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
    invalidateCache();
  });

  it('samples one tab and reports both counters', async () => {
    chrome.declarativeNetRequest.getMatchedRules = vi.fn(async () => ({
      rulesMatchedInfo: [record(1, 3, 100), record(2, 3, 101)],
    })) as never;

    await sampleTab(3);
    await expect(getSnapshot(3, 'sampled')).resolves.toMatchObject({
      tabBlocked: 2,
      totalBlocked: 2,
      mode: 'sampled',
    });
  });

  it('treats an unavailable getMatchedRules as zero, never as an error', async () => {
    chrome.declarativeNetRequest.getMatchedRules = vi.fn(async () => {
      throw new Error('activeTab not granted');
    }) as never;

    await expect(sampleTab(3)).resolves.toBeUndefined();
    await expect(getSnapshot(3, 'sampled')).resolves.toMatchObject({ tabBlocked: 0 });
  });

  it('drops a tab counter when the tab is closed', async () => {
    chrome.declarativeNetRequest.getMatchedRules = vi.fn(async () => ({
      rulesMatchedInfo: [record(1, 3, 100)],
    })) as never;
    await pollAllTabs();
    await forgetTab(3);
    await expect(getSnapshot(3, 'accurate')).resolves.toMatchObject({
      tabBlocked: 0,
      totalBlocked: 1, // the lifetime total is not rewritten by a tab closing
    });
  });

  it('prunes counters for tabs that no longer exist', async () => {
    chrome.declarativeNetRequest.getMatchedRules = vi.fn(async () => ({
      rulesMatchedInfo: [record(1, 3, 100), record(2, 8, 101)],
    })) as never;
    await pollAllTabs();
    chrome.tabs.query = vi.fn(async () => [{ id: 8 }]) as never;

    await pruneClosedTabs();
    await expect(getSnapshot(3, 'accurate')).resolves.toMatchObject({ tabBlocked: 0 });
    await expect(getSnapshot(8, 'accurate')).resolves.toMatchObject({ tabBlocked: 1 });
  });

  it('resets counters without re-counting records still inside the retention window', async () => {
    chrome.declarativeNetRequest.getMatchedRules = vi.fn(async () => ({
      rulesMatchedInfo: [record(1, 3, 100)],
    })) as never;

    await pollAllTabs();
    await resetStatistics('accurate');
    await pollAllTabs(); // the same record is still being reported by Chrome

    await expect(getSnapshot(3, 'accurate')).resolves.toMatchObject({
      totalBlocked: 0,
      tabBlocked: 0,
    });
  });
});
