import { useCallback, useEffect, useState, type JSX } from 'react';
import { getExtensionVersion } from '../shared/browser-api';
import { sendMessage } from '../shared/messaging';
import { Icon, Logo } from '../ui/Icon';
import { useSettings } from '../ui/useSettings';
import { useTheme } from '../ui/useTheme';
import { AllowlistPanel } from './components/AllowlistPanel';
import { FiltersPanel } from './components/FiltersPanel';
import { GeneralPanel } from './components/GeneralPanel';
import { PrivacyPanel } from './components/PrivacyPanel';
import type { ExtensionSettings, RulesetInfo, StatisticsSnapshot } from '../shared/types';
import type { IconName } from '../ui/Icon';

type TabId = 'general' | 'allowlist' | 'filters' | 'privacy';

const TABS: { id: TabId; label: string; icon: IconName }[] = [
  { id: 'general', label: 'General', icon: 'settings' },
  { id: 'allowlist', label: 'Allowlist', icon: 'shield-off' },
  { id: 'filters', label: 'Filters', icon: 'filter' },
  { id: 'privacy', label: 'Privacy', icon: 'info' },
];

export function Options(): JSX.Element {
  const { settings, loading, saving, error, update } = useSettings();
  const [rulesets, setRulesets] = useState<RulesetInfo[] | null>(null);
  const [stats, setStats] = useState<StatisticsSnapshot | null>(null);
  const [tab, setTab] = useState<TabId>('general');

  useTheme(settings?.theme ?? 'system');

  const loadRulesets = useCallback(async () => {
    const response = await sendMessage({ type: 'GET_RULESET_INFO' });
    if (response.ok) setRulesets(response.data.rulesets);
  }, []);

  const loadStats = useCallback(async () => {
    const response = await sendMessage({ type: 'GET_STATISTICS' });
    if (response.ok) setStats(response.data);
  }, []);

  useEffect(() => {
    void loadRulesets();
    void loadStats();
  }, [loadRulesets, loadStats]);

  // Ruleset "loaded" state follows the settings, so refresh the list after every change.
  useEffect(() => {
    if (settings) void loadRulesets();
  }, [settings, loadRulesets]);

  const change = useCallback(
    (patch: Partial<ExtensionSettings>) => {
      void update(patch);
    },
    [update],
  );

  const refreshFilters = useCallback(() => {
    void (async () => {
      const response = await sendMessage({ type: 'REFRESH_FILTERS' });
      if (response.ok) setRulesets(response.data.rulesets);
    })();
  }, []);

  const resetStatistics = useCallback(() => {
    void (async () => {
      const response = await sendMessage({ type: 'RESET_STATISTICS' });
      if (response.ok) setStats(response.data);
    })();
  }, []);

  if (loading) {
    return (
      <div className="options options--loading" aria-busy="true">
        <div className="cb-skeleton options__skeleton" />
        <div className="cb-skeleton options__skeleton" />
        <div className="cb-skeleton options__skeleton" />
      </div>
    );
  }

  if (!settings) {
    return (
      <div className="options">
        <p className="panel__error" role="alert">
          {error ?? 'ClearBlock could not load its settings.'}
        </p>
      </div>
    );
  }

  return (
    <div className="options">
      <header className="options__header">
        <span className="options__brand">
          <span className="options__logo">
            <Logo size={26} />
          </span>
          ClearBlock
        </span>
        <span className="options__version">v{getExtensionVersion()}</span>
      </header>

      <div className="options__body">
        <nav className="options__nav" aria-label="Settings sections">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              className="options__nav-item"
              data-selected={tab === entry.id}
              aria-current={tab === entry.id ? 'page' : undefined}
              onClick={() => setTab(entry.id)}
            >
              <Icon name={entry.icon} size={16} />
              <span>{entry.label}</span>
            </button>
          ))}
        </nav>

        <main className="options__content">
          {error ? (
            <p className="panel__error" role="alert">
              {error}
            </p>
          ) : null}

          {tab === 'general' ? (
            <GeneralPanel
              settings={settings}
              stats={stats}
              onChange={change}
              onResetStatistics={resetStatistics}
              saving={saving}
            />
          ) : null}

          {tab === 'allowlist' ? (
            <AllowlistPanel
              domains={settings.allowlistedDomains}
              saving={saving}
              onChange={(allowlistedDomains) => change({ allowlistedDomains })}
            />
          ) : null}

          {tab === 'filters' ? (
            <FiltersPanel
              rulesets={rulesets}
              settings={settings}
              saving={saving}
              onToggleRuleset={(key, value) =>
                change({ [key]: value } as Partial<ExtensionSettings>)
              }
              onSaveSelectors={(customCosmeticSelectors) => change({ customCosmeticSelectors })}
              onRefresh={refreshFilters}
            />
          ) : null}

          {tab === 'privacy' ? <PrivacyPanel /> : null}
        </main>
      </div>
    </div>
  );
}
