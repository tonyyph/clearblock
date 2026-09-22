/**
 * Owns the *dynamic* declarativeNetRequest rules that implement the allowlist.
 *
 * One `allowAllRequests` rule per allowlisted domain, at a priority above every blocking
 * rule. `allowAllRequests` only accepts main_frame/sub_frame conditions: matching the
 * frame exempts that frame *and all subresources loaded inside it*, which is exactly the
 * "pause on this site" semantics we want.
 */
import { ALLOWLIST_RULE_PRIORITY, DYNAMIC_RULE_ID_BASE } from '../shared/constants';
import { normalizeDomain, sanitizeAllowlist } from '../shared/domain';
import { createLogger } from '../shared/logger';

const log = createLogger('allowlist');

export type AllowlistRule = chrome.declarativeNetRequest.Rule;

/** Deterministic rules for an allowlist. Exported for unit tests. */
export function buildAllowlistRules(domains: readonly string[]): AllowlistRule[] {
  return sanitizeAllowlist(domains).map((domain, index) => ({
    id: DYNAMIC_RULE_ID_BASE + index,
    priority: ALLOWLIST_RULE_PRIORITY,
    action: { type: 'allowAllRequests' as chrome.declarativeNetRequest.RuleActionType },
    condition: {
      // Matches the domain and its subdomains, mirroring `domainMatches` in shared/domain.
      requestDomains: [domain],
      resourceTypes: ['main_frame', 'sub_frame'] as chrome.declarativeNetRequest.ResourceType[],
    },
  }));
}

async function getCurrentDynamicRuleIds(): Promise<number[]> {
  try {
    const rules = await chrome.declarativeNetRequest.getDynamicRules();
    return rules.map((rule) => rule.id);
  } catch (error) {
    log.error('getDynamicRules failed', error);
    return [];
  }
}

/**
 * Replaces the dynamic ruleset with the rules for `domains`.
 *
 * Every dynamic rule this extension creates lives at or above DYNAMIC_RULE_ID_BASE, so
 * removing "all current dynamic rules" can never touch a static rule.
 */
export async function syncAllowlistRules(domains: readonly string[]): Promise<number> {
  const addRules = buildAllowlistRules(domains);
  const removeRuleIds = await getCurrentDynamicRuleIds();

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds, addRules });
    log.info('allowlist rules synced', { count: addRules.length });
    return addRules.length;
  } catch (error) {
    log.error('updateDynamicRules failed', error);
    return 0;
  }
}

/** Adds or removes a hostname, returning the new allowlist. Input is never trusted. */
export function toggleDomain(
  allowlist: readonly string[],
  hostname: string,
  siteEnabled: boolean,
): string[] {
  const domain = normalizeDomain(hostname);
  if (!domain) return sanitizeAllowlist(allowlist);

  const current = sanitizeAllowlist(allowlist);
  if (siteEnabled) {
    // Re-enabling protection: drop the entry *and* any parent entry that covers this host,
    // otherwise the toggle would appear to do nothing.
    return current.filter((entry) => entry !== domain && !domain.endsWith(`.${entry}`));
  }
  return sanitizeAllowlist([...current, domain]);
}
