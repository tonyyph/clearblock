/**
 * Owns the *static* declarativeNetRequest rulesets.
 *
 * MV3 gives no API to enumerate the rules inside a static ruleset, so per-ruleset counts
 * come from `src/rules/metadata.json`, which is generated alongside the rule files by
 * `scripts/generate-rules.mjs` and verified by `scripts/validate-rules.mjs`.
 */
import rulesetMetadata from '../rules/metadata.json';
import { RULESET_IDS } from '../shared/constants';
import { createLogger } from '../shared/logger';
import type { ExtensionSettings, RulesetId, RulesetInfo } from '../shared/types';

const log = createLogger('rules');

type RulesetMetadata = {
  id: RulesetId;
  ruleCount: number;
  updatedAt: string;
  description: string;
  source: string;
  homepage: string;
  license: string;
};

const METADATA = rulesetMetadata as RulesetMetadata[];

/** Which static rulesets should be active for the given settings. */
export function desiredRulesets(settings: ExtensionSettings): RulesetId[] {
  if (!settings.enabled) return [];
  const active: RulesetId[] = ['ads'];
  if (settings.trackerBlockingEnabled) active.push('trackers');
  if (settings.annoyanceBlockingEnabled) active.push('annoyances');
  if (settings.regionalBlockingEnabled) active.push('regional-vi');
  return active;
}

export async function getEnabledRulesets(): Promise<RulesetId[]> {
  try {
    const enabled = await chrome.declarativeNetRequest.getEnabledRulesets();
    return enabled.filter((id): id is RulesetId => RULESET_IDS.includes(id as RulesetId));
  } catch (error) {
    log.error('getEnabledRulesets failed', error);
    return [];
  }
}

/**
 * Brings the enabled set in line with settings. Only the difference is submitted:
 * `updateEnabledRulesets` is rate-limited, so no-op writes are worth avoiding.
 */
export async function syncRulesets(settings: ExtensionSettings): Promise<RulesetId[]> {
  const wanted = new Set(desiredRulesets(settings));
  const current = new Set(await getEnabledRulesets());

  const enableRulesetIds = [...wanted].filter((id) => !current.has(id));
  const disableRulesetIds = [...current].filter((id) => !wanted.has(id));

  if (enableRulesetIds.length === 0 && disableRulesetIds.length === 0) {
    return [...wanted];
  }

  try {
    await chrome.declarativeNetRequest.updateEnabledRulesets({
      enableRulesetIds,
      disableRulesetIds,
    });
    log.info('rulesets synced', { enableRulesetIds, disableRulesetIds });
  } catch (error) {
    log.error('updateEnabledRulesets failed', error);
    return [...current];
  }
  return [...wanted];
}

export async function getRulesetInfo(): Promise<RulesetInfo[]> {
  const enabled = new Set(await getEnabledRulesets());
  return METADATA.map((entry) => ({ ...entry, enabled: enabled.has(entry.id) }));
}

export function getBundledRuleCount(): number {
  return METADATA.reduce((total, entry) => total + entry.ruleCount, 0);
}
