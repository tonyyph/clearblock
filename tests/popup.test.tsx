import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Popup } from '../src/popup/Popup';
import { installMessageRouter } from './helpers/message-router';

describe('Popup', () => {
  it('shows the active state with the current hostname', async () => {
    installMessageRouter();
    render(<Popup />);

    expect(await screen.findByText('Protection is active')).toBeInTheDocument();
    expect(screen.getAllByText('example.com').length).toBeGreaterThan(0);
  });

  it('shows both counters and labels them as estimates in sampled mode', async () => {
    installMessageRouter({ statistics: { totalBlocked: 1234, tabBlocked: 12, mode: 'sampled' } });
    render(<Popup />);

    expect(await screen.findByText('1,234')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getAllByText('est.')).toHaveLength(2);
    expect(
      screen.getByText(/only lets extensions read blocked-request records/i),
    ).toBeInTheDocument();
  });

  it('drops the estimate labelling once continuous counting is on', async () => {
    installMessageRouter({ statistics: { mode: 'accurate' } });
    render(<Popup />);

    await screen.findByText('Protection is active');
    expect(screen.queryByText('est.')).not.toBeInTheDocument();
  });

  it('pauses the site through the toggle and then offers a reload', async () => {
    const router = installMessageRouter();
    const user = userEvent.setup();
    render(<Popup />);

    const toggle = await screen.findByRole('switch', { name: /block ads on example\.com/i });
    expect(toggle).toHaveAttribute('aria-checked', 'true');

    await user.click(toggle);

    await waitFor(() => {
      expect(router.sentOf('SET_SITE_ENABLED')[0]).toEqual({
        type: 'SET_SITE_ENABLED',
        hostname: 'example.com',
        enabled: false,
      });
    });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    // ClearBlock asks before reloading instead of doing it silently.
    expect(await screen.findByText(/reload the page to apply/i)).toBeInTheDocument();
  });

  it('is operable from the keyboard', async () => {
    const router = installMessageRouter();
    const user = userEvent.setup();
    render(<Popup />);

    const toggle = await screen.findByRole('switch', { name: /block ads on example\.com/i });
    toggle.focus();
    await user.keyboard('{Enter}');

    await waitFor(() => expect(router.sentOf('SET_SITE_ENABLED')).toHaveLength(1));
  });

  it('shows a paused state when the site is allowlisted', async () => {
    installMessageRouter({ siteStatus: { siteEnabled: false } });
    render(<Popup />);

    expect(await screen.findByText('Protection is paused')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /enable on this site/i })).toBeInTheDocument();
  });

  it('degrades gracefully on a browser page instead of showing a broken toggle', async () => {
    installMessageRouter({
      siteStatus: { hostname: null, url: null, supported: false, tabId: 2 },
    });
    render(<Popup />);

    expect(await screen.findByText('Nothing to protect here')).toBeInTheDocument();
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /pause on this site/i })).not.toBeInTheDocument();
  });

  it('warns when protection is off globally and disables the site toggle', async () => {
    installMessageRouter({ siteStatus: { globallyEnabled: false } });
    render(<Popup />);

    expect(await screen.findByText(/switched off for every site/i)).toBeInTheDocument();
    expect(screen.getByRole('switch')).toBeDisabled();
  });

  it('opens the dashboard through the background', async () => {
    const router = installMessageRouter();
    const user = userEvent.setup();
    render(<Popup />);

    await user.click(await screen.findByRole('button', { name: /open dashboard/i }));
    expect(router.sentOf('OPEN_OPTIONS')).toHaveLength(1);
  });

  it('opens the issue tracker in a new tab', async () => {
    installMessageRouter();
    const create = vi.fn(async () => undefined);
    chrome.tabs.create = create as never;
    const user = userEvent.setup();
    render(<Popup />);

    await user.click(await screen.findByRole('button', { name: /report an issue/i }));
    expect(create).toHaveBeenCalledWith({ url: expect.stringContaining('http') });
  });

  it('always states the privacy guarantee', async () => {
    installMessageRouter();
    render(<Popup />);
    expect(
      await screen.findByText(/never collects or sends your browsing data/i),
    ).toBeInTheDocument();
  });
});
