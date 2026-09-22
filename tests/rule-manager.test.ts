import { describe, expect, it, vi } from 'vitest';
import { desiredRulesets, getRulesetInfo, syncRulesets } from '../src/background/rule-manager';
import { DEFAULT_SETTINGS } from '../src/shared/constants';
import metadata from '../src/rules/metadata.json';

describe('desiredRulesets', () => {
  it('enables every list when everything is on', () => {
    expect(desiredRulesets(DEFAULT_SETTINGS)).toEqual(['ads', 'trackers', 'annoyances']);
  });

  it('keeps ads as the baseline and drops the optional lists', () => {
    expect(
      desiredRulesets({
        ...DEFAULT_SETTINGS,
        trackerBlockingEnabled: false,
        annoyanceBlockingEnabled: false,
      }),
    ).toEqual(['ads']);
  });

  it('enables nothing at all when protection is off', () => {
    expect(desiredRulesets({ ...DEFAULT_SETTINGS, enabled: false })).toEqual([]);
  });
});

describe('syncRulesets', () => {
  it('submits only the difference', async () => {
    chrome.declarativeNetRequest.getEnabledRulesets = async () => ['ads', 'trackers'];
    const update = vi.fn(async () => undefined);
    chrome.declarativeNetRequest.updateEnabledRulesets = update as never;

    await syncRulesets({ ...DEFAULT_SETTINGS, trackerBlockingEnabled: false });

    expect(update).toHaveBeenCalledWith({
      enableRulesetIds: ['annoyances'],
      disableRulesetIds: ['trackers'],
    });
  });

  it('does not call Chrome when nothing changed', async () => {
    chrome.declarativeNetRequest.getEnabledRulesets = async () => ['ads', 'trackers', 'annoyances'];
    const update = vi.fn(async () => undefined);
    chrome.declarativeNetRequest.updateEnabledRulesets = update as never;

    await syncRulesets(DEFAULT_SETTINGS);
    expect(update).not.toHaveBeenCalled();
  });
});

describe('getRulesetInfo', () => {
  it('reports the bundled rule counts and which lists Chrome has loaded', async () => {
    chrome.declarativeNetRequest.getEnabledRulesets = async () => ['ads'];
    const info = await getRulesetInfo();

    expect(info.map((entry) => entry.id)).toEqual(['ads', 'trackers', 'annoyances']);
    expect(info.find((entry) => entry.id === 'ads')?.enabled).toBe(true);
    expect(info.find((entry) => entry.id === 'trackers')?.enabled).toBe(false);
    for (const entry of info) {
      const source = metadata.find((item) => item.id === entry.id);
      expect(entry.ruleCount).toBe(source?.ruleCount);
      expect(entry.ruleCount).toBeGreaterThan(0);
    }
  });
});
