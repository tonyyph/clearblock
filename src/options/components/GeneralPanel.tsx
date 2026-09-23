import { useState, type JSX } from 'react';
import { Button } from '../../ui/Button';
import { SettingRow } from './SettingRow';
import { ThemePicker } from './ThemePicker';
import type { ExtensionSettings, StatisticsSnapshot } from '../../shared/types';

const FEEDBACK_PERMISSION = 'declarativeNetRequestFeedback';

export function GeneralPanel({
  settings,
  stats,
  onChange,
  onResetStatistics,
  saving,
}: {
  settings: ExtensionSettings;
  stats: StatisticsSnapshot | null;
  onChange: (patch: Partial<ExtensionSettings>) => void;
  onResetStatistics: () => void;
  saving: boolean;
}): JSX.Element {
  const [permissionError, setPermissionError] = useState<string | null>(null);

  /**
   * Continuous counting needs an optional permission. `chrome.permissions.request` must be
   * called from a user gesture, which is why it runs directly in this click handler.
   */
  const setAccurateCounting = async (next: boolean): Promise<void> => {
    setPermissionError(null);
    if (!next) {
      onChange({ accurateCountingEnabled: false });
      try {
        await chrome.permissions.remove({
          permissions: [FEEDBACK_PERMISSION] as chrome.runtime.ManifestPermission[],
        });
      } catch {
        // Revoking is best-effort; the setting is already off.
      }
      return;
    }

    try {
      const granted = await chrome.permissions.request({
        permissions: [FEEDBACK_PERMISSION] as chrome.runtime.ManifestPermission[],
      });
      if (!granted) {
        setPermissionError('Chrome did not grant the permission, so counting stays sampled.');
        return;
      }
      onChange({ accurateCountingEnabled: true });
    } catch (error) {
      setPermissionError(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <section className="panel" aria-labelledby="general-heading">
      <header className="panel__header">
        <h2 id="general-heading" className="panel__title">
          General
        </h2>
        <p className="panel__subtitle">
          Turn individual layers of protection on or off. Changes apply to pages you load from now
          on.
        </p>
      </header>

      <SettingRow
        id="setting-enabled"
        title="Protection"
        description="The master switch. When off, no rules are loaded and no elements are hidden anywhere."
        checked={settings.enabled}
        onChange={(next) => onChange({ enabled: next })}
        disabled={saving}
      />

      <SettingRow
        id="setting-cosmetic"
        title="Cosmetic filtering"
        description="Hides ad slots, banners and overlays that survive network blocking."
        checked={settings.cosmeticFilteringEnabled}
        onChange={(next) => onChange({ cosmeticFilteringEnabled: next })}
        disabled={saving || !settings.enabled}
      />

      <SettingRow
        id="setting-youtube"
        title="YouTube protection"
        description="Removes the ad schedule from YouTube's player response before the player reads it, so in-stream video ads are never scheduled. Also hides feed, sidebar and overlay ads. YouTube changes this from time to time; if playback misbehaves, switch it off here."
        checked={settings.youtubeProtectionEnabled}
        onChange={(next) => onChange({ youtubeProtectionEnabled: next })}
        disabled={saving || !settings.enabled}
      />

      <SettingRow
        id="setting-trackers"
        title="Tracker blocking"
        description="Blocks advertising trackers and identity graphs. General site analytics is left alone."
        checked={settings.trackerBlockingEnabled}
        onChange={(next) => onChange({ trackerBlockingEnabled: next })}
        disabled={saving || !settings.enabled}
      />

      <SettingRow
        id="setting-annoyances"
        title="Annoyance blocking"
        description="Blocks push-notification nags and email-capture popups. Cookie consent banners are deliberately left alone."
        checked={settings.annoyanceBlockingEnabled}
        onChange={(next) => onChange({ annoyanceBlockingEnabled: next })}
        disabled={saving || !settings.enabled}
      />

      <ThemePicker value={settings.theme} onChange={(theme) => onChange({ theme })} />

      <div className="panel__divider" />

      <h3 className="panel__subheading">Statistics</h3>
      <SettingRow
        id="setting-counting"
        title="Continuous counting"
        description="By default Chrome only reports blocked requests for the tab you are looking at, while the popup is open, so totals under-count. Granting one extra permission lets ClearBlock poll every minute for an exact total."
        checked={settings.accurateCountingEnabled}
        onChange={(next) => void setAccurateCounting(next)}
        disabled={saving}
      />
      {permissionError ? (
        <p className="panel__error" role="alert">
          {permissionError}
        </p>
      ) : null}

      <p className="panel__subtitle">
        Current mode: <strong>{stats?.mode === 'accurate' ? 'continuous' : 'sampled'}</strong>.
        Total recorded: <strong>{(stats?.totalBlocked ?? 0).toLocaleString()}</strong>.
      </p>
      <div className="panel__row">
        <Button variant="danger" icon="trash" onClick={onResetStatistics} disabled={saving}>
          Reset counters
        </Button>
      </div>
    </section>
  );
}
