import { describe, expect, it } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Options } from '../src/options/Options';
import rulesetMetadata from '../src/rules/metadata.json';
import { installMessageRouter } from './helpers/message-router';

async function openTab(name: RegExp): Promise<void> {
  const user = userEvent.setup();
  await user.click(await screen.findByRole('button', { name }));
}

describe('Options — General', () => {
  it('renders every protection switch', async () => {
    installMessageRouter();
    render(<Options />);

    for (const label of [
      /^Protection$/,
      /cosmetic filtering/i,
      /youtube protection/i,
      /tracker blocking/i,
      /annoyance blocking/i,
    ]) {
      expect(await screen.findByRole('switch', { name: label })).toBeInTheDocument();
    }
  });

  it('persists a toggle through UPDATE_SETTINGS', async () => {
    const router = installMessageRouter();
    const user = userEvent.setup();
    render(<Options />);

    await user.click(await screen.findByRole('switch', { name: /cosmetic filtering/i }));

    await waitFor(() => {
      expect(router.sentOf('UPDATE_SETTINGS')[0]?.payload).toEqual({
        cosmeticFilteringEnabled: false,
      });
    });
    expect(router.settings.cosmeticFilteringEnabled).toBe(false);
  });

  it('changes the theme', async () => {
    const router = installMessageRouter();
    const user = userEvent.setup();
    render(<Options />);

    await user.click(await screen.findByRole('radio', { name: /dark/i }));
    await waitFor(() => expect(router.settings.theme).toBe('dark'));
  });

  it('describes why the default counting mode is a sample', async () => {
    installMessageRouter();
    render(<Options />);
    expect(await screen.findByText(/totals under-count/i)).toBeInTheDocument();
  });
});

describe('Options — Allowlist', () => {
  it('shows an empty state when nothing is allowlisted', async () => {
    installMessageRouter();
    render(<Options />);
    await openTab(/allowlist/i);

    expect(await screen.findByText(/no sites are allowlisted/i)).toBeInTheDocument();
  });

  it('rejects an invalid domain without saving it', async () => {
    const router = installMessageRouter();
    const user = userEvent.setup();
    render(<Options />);
    await openTab(/allowlist/i);

    await user.type(await screen.findByLabelText(/domain to allow/i), 'not a domain');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/valid domain/i);
    expect(router.sentOf('UPDATE_SETTINGS')).toHaveLength(0);
  });

  it('normalises and saves a valid domain', async () => {
    const router = installMessageRouter();
    const user = userEvent.setup();
    render(<Options />);
    await openTab(/allowlist/i);

    await user.type(await screen.findByLabelText(/domain to allow/i), 'https://WWW.Example.com/x');
    await user.click(screen.getByRole('button', { name: /^add$/i }));

    await waitFor(() => {
      expect(router.settings.allowlistedDomains).toEqual(['example.com']);
    });
    const list = await screen.findByRole('list');
    expect(within(list).getByText('example.com')).toBeInTheDocument();
  });

  it('removes a domain', async () => {
    const router = installMessageRouter({
      settings: { allowlistedDomains: ['keep.com', 'remove.com'] },
    });
    const user = userEvent.setup();
    render(<Options />);
    await openTab(/allowlist/i);

    await user.click(
      await screen.findByRole('button', { name: /remove remove\.com from the allowlist/i }),
    );

    await waitFor(() => expect(router.settings.allowlistedDomains).toEqual(['keep.com']));
  });

  it('filters the list with the search box', async () => {
    installMessageRouter({ settings: { allowlistedDomains: ['alpha.com', 'beta.com'] } });
    const user = userEvent.setup();
    render(<Options />);
    await openTab(/allowlist/i);

    await user.type(await screen.findByLabelText(/search allowlist/i), 'alpha');

    const list = screen.getByRole('list');
    expect(within(list).getByText('alpha.com')).toBeInTheDocument();
    expect(within(list).queryByText('beta.com')).not.toBeInTheDocument();
  });
});

describe('Options — Filters', () => {
  it('lists every bundled ruleset with its real rule count', async () => {
    installMessageRouter();
    render(<Options />);
    await openTab(/filters/i);

    expect(await screen.findByText('Ads')).toBeInTheDocument();
    expect(screen.getByText('Vietnamese sites')).toBeInTheDocument();
    for (const entry of rulesetMetadata) {
      expect(entry.ruleCount).toBeGreaterThan(0);
      // The panel formats counts with thousands separators.
      const formatted = entry.ruleCount.toLocaleString('en-US');
      expect(screen.getByText(new RegExp(`${formatted} rules`))).toBeInTheDocument();
    }
  });

  it('rejects a custom selector that is not a selector', async () => {
    const router = installMessageRouter();
    const user = userEvent.setup();
    render(<Options />);
    await openTab(/filters/i);

    await user.type(
      await screen.findByLabelText(/custom cosmetic selectors/i),
      'body {{}display:none}',
    );
    await user.click(screen.getByRole('button', { name: /save selectors/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/not a valid selector/i);
    expect(router.sentOf('UPDATE_SETTINGS')).toHaveLength(0);
  });

  it('saves valid custom selectors', async () => {
    const router = installMessageRouter();
    const user = userEvent.setup();
    render(<Options />);
    await openTab(/filters/i);

    await user.type(await screen.findByLabelText(/custom cosmetic selectors/i), '.my-promo');
    await user.click(screen.getByRole('button', { name: /save selectors/i }));

    await waitFor(() => expect(router.settings.customCosmeticSelectors).toEqual(['.my-promo']));
  });

  it('states that filter lists are bundled, never downloaded', async () => {
    installMessageRouter();
    render(<Options />);
    await openTab(/filters/i);
    expect(await screen.findByText(/never downloaded at runtime/i)).toBeInTheDocument();
  });
});

describe('Options — Privacy', () => {
  it('explains every permission the manifest declares', async () => {
    installMessageRouter();
    render(<Options />);
    await openTab(/privacy/i);

    for (const permission of ['storage', 'activeTab', 'declarativeNetRequest', 'alarms']) {
      expect(await screen.findByText(permission)).toBeInTheDocument();
    }
    expect(screen.getByText('<all_urls>')).toBeInTheDocument();
    expect(screen.queryByText(/not documented/i)).not.toBeInTheDocument();
  });

  it('states the privacy guarantees', async () => {
    installMessageRouter();
    render(<Options />);
    await openTab(/privacy/i);

    expect(await screen.findByText(/no browsing history is collected/i)).toBeInTheDocument();
    expect(screen.getByText(/no analytics, telemetry or crash reporting/i)).toBeInTheDocument();
  });
});
