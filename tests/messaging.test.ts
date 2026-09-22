import { describe, expect, it, vi } from 'vitest';
import { fail, ok, parseMessage, sendMessage, sendToTab } from '../src/shared/messaging';

describe('parseMessage', () => {
  it('accepts every well-formed request', () => {
    expect(parseMessage({ type: 'GET_SETTINGS' })).toEqual({ type: 'GET_SETTINGS' });
    expect(parseMessage({ type: 'GET_STATISTICS', tabId: 7 })).toEqual({
      type: 'GET_STATISTICS',
      tabId: 7,
    });
    expect(parseMessage({ type: 'SET_SITE_ENABLED', hostname: 'a.com', enabled: false })).toEqual({
      type: 'SET_SITE_ENABLED',
      hostname: 'a.com',
      enabled: false,
    });
    expect(parseMessage({ type: 'UPDATE_SETTINGS', payload: { theme: 'dark' } })).toEqual({
      type: 'UPDATE_SETTINGS',
      payload: { theme: 'dark' },
    });
  });

  it.each([
    null,
    undefined,
    'GET_SETTINGS',
    42,
    {},
    { type: 'UNKNOWN' },
    { type: 'SET_SITE_ENABLED' },
    { type: 'SET_SITE_ENABLED', hostname: 'a.com' },
    { type: 'SET_SITE_ENABLED', hostname: 42, enabled: true },
    { type: 'SET_SITE_ENABLED', hostname: 'a.com', enabled: 'yes' },
    { type: 'GET_STATISTICS', tabId: 'one' },
    { type: 'GET_STATISTICS', tabId: 1.5 },
    { type: 'UPDATE_SETTINGS' },
    { type: 'UPDATE_SETTINGS', payload: 'theme=dark' },
  ])('rejects %s', (input) => {
    expect(parseMessage(input)).toBeNull();
  });

  it('never trusts an arbitrary extra field', () => {
    const parsed = parseMessage({ type: 'GET_SETTINGS', evil: 'payload' });
    expect(parsed).toEqual({ type: 'GET_SETTINGS' });
  });
});

describe('response envelope', () => {
  it('wraps success and failure consistently', () => {
    expect(ok(5)).toEqual({ ok: true, data: 5 });
    expect(fail(new Error('boom'))).toEqual({ ok: false, error: 'boom' });
    expect(fail('plain string')).toEqual({ ok: false, error: 'plain string' });
  });
});

describe('sendMessage', () => {
  it('passes a successful response through', async () => {
    chrome.runtime.sendMessage = vi.fn(async () => ({
      ok: true,
      data: { theme: 'dark' },
    })) as never;
    await expect(sendMessage({ type: 'GET_SETTINGS' })).resolves.toEqual({
      ok: true,
      data: { theme: 'dark' },
    });
  });

  it('turns a closed message port into an error value, not a rejection', async () => {
    chrome.runtime.sendMessage = vi.fn(async () => {
      throw new Error('The message port closed before a response was received.');
    }) as never;

    await expect(sendMessage({ type: 'GET_SETTINGS' })).resolves.toEqual({
      ok: false,
      error: 'The message port closed before a response was received.',
    });
  });

  it('reports a malformed response instead of returning it', async () => {
    chrome.runtime.sendMessage = vi.fn(async () => 'surprise') as never;
    const result = await sendMessage({ type: 'GET_SETTINGS' });
    expect(result).toEqual({ ok: false, error: 'Malformed response from background' });
  });

  it('surfaces chrome.runtime.lastError', async () => {
    chrome.runtime.sendMessage = vi.fn(async () => {
      (chrome.runtime as { lastError?: { message: string } }).lastError = {
        message: 'Could not establish connection.',
      };
      return undefined;
    }) as never;

    await expect(sendMessage({ type: 'GET_SETTINGS' })).resolves.toEqual({
      ok: false,
      error: 'Could not establish connection.',
    });
  });
});

describe('sendToTab', () => {
  it('reports a missing content script as a normal outcome', async () => {
    chrome.tabs.sendMessage = vi.fn(async () => {
      throw new Error('Receiving end does not exist.');
    }) as never;

    await expect(sendToTab(1, { type: 'PING' })).resolves.toEqual({
      ok: false,
      error: 'No content script in this tab',
    });
  });

  it('passes a content-script reply through', async () => {
    chrome.tabs.sendMessage = vi.fn(async () => ({ ok: true, data: 'pong' })) as never;
    await expect(sendToTab(1, { type: 'PING' })).resolves.toEqual({ ok: true, data: 'pong' });
  });
});
