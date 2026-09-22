import { useMemo, type JSX } from 'react';
import { Icon } from '../../ui/Icon';

/**
 * Permission explanations are keyed by the permission string and rendered from the live
 * manifest, so this page can never drift out of date with what the extension actually asks
 * for. An unexplained permission would show as "not documented", which is a bug.
 */
const PERMISSION_REASONS: Record<string, string> = {
  storage: 'Stores your settings and allowlist on this device. Nothing is synced or uploaded.',
  activeTab:
    'Lets the popup read the address of the tab you are looking at, so it can show the site name and its blocked-request count.',
  declarativeNetRequest:
    'Blocks ad and tracker requests. Chrome applies the rules itself — ClearBlock never sees the URLs being requested.',
  alarms: 'Schedules the periodic clean-up of per-tab counters for tabs you have closed.',
  declarativeNetRequestFeedback:
    'Optional. Only requested if you turn on continuous counting, which needs Chrome to report which rules matched.',
};

const HOST_PERMISSION_REASON =
  'An ad blocker cannot know in advance which sites serve ads, so it needs to be able to filter on any site you visit. ClearBlock uses this access only to apply its filter rules and hide ad elements locally.';

const GUARANTEES = [
  'No browsing history is collected.',
  'No URL, page content or identifier is ever sent to a server.',
  'No analytics, telemetry or crash reporting of any kind.',
  'No data is sold or shared — there is no server to send it to.',
  'Settings and counters live in chrome.storage.local on this device only.',
  'Filter lists are bundled in the extension; nothing is downloaded at runtime.',
];

export function PrivacyPanel(): JSX.Element {
  const manifest = useMemo(() => {
    try {
      return chrome.runtime.getManifest();
    } catch {
      return null;
    }
  }, []);

  const permissions = manifest?.permissions ?? [];
  const optional = manifest?.optional_permissions ?? [];
  const hosts = manifest?.host_permissions ?? [];

  return (
    <section className="panel" aria-labelledby="privacy-heading">
      <header className="panel__header">
        <h2 id="privacy-heading" className="panel__title">
          Privacy
        </h2>
        <p className="panel__subtitle">
          ClearBlock has no backend. There is no account, no network call of its own, and no code
          that could send your data anywhere.
        </p>
      </header>

      <ul className="guarantee__list">
        {GUARANTEES.map((item) => (
          <li key={item} className="guarantee">
            <span className="guarantee__icon" aria-hidden="true">
              <Icon name="check" size={14} />
            </span>
            {item}
          </li>
        ))}
      </ul>

      <div className="panel__divider" />

      <h3 className="panel__subheading">Permissions in use</h3>
      <ul className="permission__list">
        {[...permissions, ...hosts].map((permission) => (
          <li key={permission} className="permission">
            <code className="permission__name">{permission}</code>
            <span className="permission__reason">
              {permission.includes('://') || permission === '<all_urls>'
                ? HOST_PERMISSION_REASON
                : (PERMISSION_REASONS[permission] ?? 'Not documented — please report this.')}
            </span>
          </li>
        ))}
      </ul>

      {optional.length > 0 ? (
        <>
          <h3 className="panel__subheading">Optional permissions</h3>
          <ul className="permission__list">
            {optional.map((permission) => (
              <li key={permission} className="permission">
                <code className="permission__name">{permission}</code>
                <span className="permission__reason">
                  {PERMISSION_REASONS[permission] ?? 'Not documented — please report this.'}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
