import { describe, expect, it } from 'vitest';
import {
  buildAllowlistRules,
  syncAllowlistRules,
  toggleDomain,
} from '../src/background/allowlist-manager';
import { ALLOWLIST_RULE_PRIORITY, DYNAMIC_RULE_ID_BASE } from '../src/shared/constants';

describe('buildAllowlistRules', () => {
  it('creates one allowAllRequests rule per domain, above every blocking priority', () => {
    const rules = buildAllowlistRules(['example.com', 'news.site']);
    expect(rules).toHaveLength(2);
    for (const rule of rules) {
      expect(rule.action.type).toBe('allowAllRequests');
      expect(rule.priority).toBe(ALLOWLIST_RULE_PRIORITY);
      expect(rule.priority).toBeGreaterThan(1);
      // allowAllRequests is only valid for frame-level resource types.
      expect(rule.condition.resourceTypes).toEqual(['main_frame', 'sub_frame']);
      expect(rule.id).toBeGreaterThanOrEqual(DYNAMIC_RULE_ID_BASE);
    }
  });

  it('assigns unique IDs that cannot collide with static rules', () => {
    const rules = buildAllowlistRules(['a.com', 'b.com', 'c.com']);
    const ids = rules.map((rule) => rule.id);
    expect(new Set(ids).size).toBe(3);
    expect(Math.min(...ids)).toBeGreaterThan(3999);
  });

  it('normalises input and drops invalid domains', () => {
    const rules = buildAllowlistRules([
      'WWW.Example.com',
      'https://b.com/path',
      'not a domain',
      '',
    ]);
    expect(rules.map((rule) => rule.condition.requestDomains?.[0])).toEqual([
      'b.com',
      'example.com',
    ]);
  });

  it('produces no rules for an empty allowlist', () => {
    expect(buildAllowlistRules([])).toEqual([]);
  });
});

describe('toggleDomain', () => {
  it('adds a normalised domain when pausing a site', () => {
    expect(toggleDomain([], 'www.Example.com', false)).toEqual(['example.com']);
  });

  it('removes the domain when re-enabling a site', () => {
    expect(toggleDomain(['example.com', 'other.org'], 'example.com', true)).toEqual(['other.org']);
  });

  it('also removes a parent entry that would keep the site allowlisted', () => {
    // Without this, re-enabling news.example.com would silently do nothing.
    expect(toggleDomain(['example.com'], 'news.example.com', true)).toEqual([]);
  });

  it('is a no-op for an unusable hostname', () => {
    expect(toggleDomain(['example.com'], 'chrome://extensions', false)).toEqual(['example.com']);
  });

  it('never creates duplicates', () => {
    expect(toggleDomain(['example.com'], 'www.example.com', false)).toEqual(['example.com']);
  });
});

describe('syncAllowlistRules', () => {
  it('replaces the dynamic ruleset and reports how many rules are active', async () => {
    chrome.declarativeNetRequest.getDynamicRules = async () =>
      [{ id: DYNAMIC_RULE_ID_BASE }, { id: DYNAMIC_RULE_ID_BASE + 1 }] as never;

    let received: { removeRuleIds?: number[]; addRules?: unknown[] } | null = null;
    chrome.declarativeNetRequest.updateDynamicRules = async (options) => {
      received = options as never;
    };

    const count = await syncAllowlistRules(['example.com']);
    expect(count).toBe(1);
    expect(received!.removeRuleIds).toEqual([DYNAMIC_RULE_ID_BASE, DYNAMIC_RULE_ID_BASE + 1]);
    expect(received!.addRules).toHaveLength(1);
  });

  it('reports zero rather than throwing when Chrome rejects the update', async () => {
    chrome.declarativeNetRequest.updateDynamicRules = async () => {
      throw new Error('quota exceeded');
    };
    await expect(syncAllowlistRules(['example.com'])).resolves.toBe(0);
  });
});
