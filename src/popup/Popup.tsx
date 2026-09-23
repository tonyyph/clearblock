import { useCallback, type JSX } from 'react';
import { ISSUE_REPORT_URL } from '../shared/constants';
import { displayHostname } from '../shared/domain';
import { getExtensionVersion } from '../shared/browser-api';
import { sendMessage } from '../shared/messaging';
import { Button } from '../ui/Button';
import { Icon, Logo } from '../ui/Icon';
import { Toggle } from '../ui/Toggle';
import { useSettings } from '../ui/useSettings';
import { useTheme } from '../ui/useTheme';
import { useSiteStatus } from './hooks/useSiteStatus';
import { useStatistics } from './hooks/useStatistics';
import { ReloadNotice } from './components/ReloadNotice';
import { StatTile } from './components/StatTile';
import { StatusCard, type ProtectionState } from './components/StatusCard';

function resolveState(
  loading: boolean,
  error: string | null,
  supported: boolean,
  globallyEnabled: boolean,
  siteEnabled: boolean,
): ProtectionState {
  if (error) return 'error';
  if (loading) return 'active';
  if (!supported) return 'unsupported';
  return globallyEnabled && siteEnabled ? 'active' : 'paused';
}

export function Popup(): JSX.Element {
  const { settings } = useSettings();
  const { status, loading, error, reloadPending, setSiteEnabled, reloadPage } = useSiteStatus();
  const { stats, contentState } = useStatistics(status?.tabId ?? null);

  useTheme(settings?.theme ?? 'system');

  const supported = status?.supported ?? false;
  const globallyEnabled = status?.globallyEnabled ?? true;
  const siteEnabled = status?.siteEnabled ?? false;
  const protectionOn = supported && globallyEnabled && siteEnabled;
  const state = resolveState(loading, error, supported, globallyEnabled, siteEnabled);

  const openDashboard = useCallback(() => {
    void sendMessage({ type: 'OPEN_OPTIONS' });
  }, []);

  const reportIssue = useCallback(() => {
    void chrome.tabs.create({ url: ISSUE_REPORT_URL });
  }, []);

  const estimate = stats?.mode !== 'accurate';

  return (
    <div className="popup">
      <header className="popup__header">
        <span className="popup__brand">
          <span className="popup__logo">
            <Logo size={22} />
          </span>
          ClearBlock
        </span>
        <span className="popup__version">v{getExtensionVersion()}</span>
      </header>

      <main className="popup__main">
        <StatusCard
          state={state}
          hostname={status?.hostname ? displayHostname(status.hostname) : null}
        />

        {!globallyEnabled && supported ? (
          <p className="popup__warning" role="status">
            Protection is switched off for every site in the dashboard.
          </p>
        ) : null}

        {supported ? (
          <section className="control cb-card">
            <div className="control__text">
              <label className="control__label" htmlFor="site-toggle">
                Block ads on this site
              </label>
              <p className="control__hint" id="site-toggle-description">
                {displayHostname(status?.hostname ?? null)}
              </p>
            </div>
            <Toggle
              id="site-toggle"
              checked={protectionOn}
              disabled={!globallyEnabled}
              label={`Block ads on ${displayHostname(status?.hostname ?? null)}`}
              description={displayHostname(status?.hostname ?? null)}
              onChange={(next) => void setSiteEnabled(next)}
            />
          </section>
        ) : null}

        {reloadPending ? <ReloadNotice onReload={() => void reloadPage()} /> : null}

        <section className="popup__stats" aria-label="Blocking statistics">
          <StatTile
            label="Blocked on this tab"
            value={stats?.tabBlocked ?? null}
            estimate={estimate}
          />
          <StatTile
            label="Blocked in total"
            value={stats?.totalBlocked ?? null}
            estimate={estimate}
          />
        </section>

        {estimate ? (
          <p className="popup__footnote">
            Chrome only lets extensions read blocked-request records for the last few minutes. Turn
            on continuous counting in the dashboard for exact totals.
          </p>
        ) : null}

        {contentState && contentState.youtubeAdsNeutralised > 0 ? (
          <p className="popup__footnote">
            {contentState.youtubeAdsNeutralised} YouTube ad slot
            {contentState.youtubeAdsNeutralised === 1 ? '' : 's'} removed before the player could
            schedule them.
          </p>
        ) : null}

        {contentState && contentState.hiddenElements > 0 ? (
          <p className="popup__footnote">
            {contentState.hiddenElements} ad element
            {contentState.hiddenElements === 1 ? '' : 's'} hidden on this page.
          </p>
        ) : null}

        {error ? (
          <p className="popup__error" role="alert">
            {error}
          </p>
        ) : null}

        <div className="popup__actions">
          {supported ? (
            <Button
              variant="primary"
              block
              icon={protectionOn ? 'pause' : 'play'}
              disabled={!globallyEnabled}
              onClick={() => void setSiteEnabled(!protectionOn)}
            >
              {protectionOn ? 'Pause on this site' : 'Enable on this site'}
            </Button>
          ) : null}
          <Button variant="secondary" block icon="settings" onClick={openDashboard}>
            Open dashboard
          </Button>
          <Button variant="ghost" block icon="flag" onClick={reportIssue}>
            Report an issue
          </Button>
        </div>
      </main>

      <footer className="popup__footer">
        <Icon name="info" size={14} />
        <span>
          ClearBlock never collects or sends your browsing data. Settings stay on this device.
        </span>
      </footer>
    </div>
  );
}
