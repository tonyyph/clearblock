/**
 * Typed message protocol between popup / options / service worker / content scripts.
 *
 * Rules enforced here:
 *  - every request is validated before a handler sees it (a content script is not trusted);
 *  - every response uses the same `{ ok, data | error }` envelope;
 *  - "message port closed" and "receiving end does not exist" are expected outcomes
 *    (the SW was asleep, the tab navigated away) and resolve to an error value.
 */
import { createLogger } from './logger';
import type {
  ContentMessage,
  ContentState,
  ExtensionMessage,
  MessageResponse,
  MessageResultMap,
} from './types';
import type { ExtensionSettings } from './types';

const log = createLogger('messaging');

const REQUEST_TYPES = new Set<ExtensionMessage['type']>([
  'GET_CURRENT_SITE_STATUS',
  'SET_SITE_ENABLED',
  'GET_STATISTICS',
  'RESET_STATISTICS',
  'GET_SETTINGS',
  'UPDATE_SETTINGS',
  'REFRESH_FILTERS',
  'GET_RULESET_INFO',
  'OPEN_OPTIONS',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** Structural validation of an inbound message. Returns null when the payload is unusable. */
export function parseMessage(value: unknown): ExtensionMessage | null {
  if (!isRecord(value)) return null;
  const type = value.type;
  if (typeof type !== 'string' || !REQUEST_TYPES.has(type as ExtensionMessage['type'])) return null;

  switch (type) {
    case 'SET_SITE_ENABLED': {
      if (typeof value.hostname !== 'string' || typeof value.enabled !== 'boolean') return null;
      return { type, hostname: value.hostname, enabled: value.enabled };
    }
    case 'GET_CURRENT_SITE_STATUS':
    case 'GET_STATISTICS': {
      const tabId = value.tabId;
      if (tabId !== undefined && (typeof tabId !== 'number' || !Number.isInteger(tabId))) {
        return null;
      }
      return tabId === undefined ? { type } : { type, tabId };
    }
    case 'UPDATE_SETTINGS': {
      if (!isRecord(value.payload)) return null;
      // Field-level repair happens in storage.validateSettings. Here we only guarantee
      // the payload is an object, so a malformed message can never reach the merge.
      return { type, payload: value.payload as Partial<ExtensionSettings> };
    }
    case 'RESET_STATISTICS':
    case 'GET_SETTINGS':
    case 'REFRESH_FILTERS':
    case 'GET_RULESET_INFO':
    case 'OPEN_OPTIONS':
      return { type };
    default:
      return null;
  }
}

export function ok<T>(data: T): MessageResponse<T> {
  return { ok: true, data };
}

export function fail<T = never>(error: unknown): MessageResponse<T> {
  const message = error instanceof Error ? error.message : String(error);
  return { ok: false, error: message };
}

type RequestOf<K extends keyof MessageResultMap> = Extract<ExtensionMessage, { type: K }>;

/** Sends a request to the service worker and unwraps the envelope. */
export async function sendMessage<K extends keyof MessageResultMap>(
  message: RequestOf<K>,
): Promise<MessageResponse<MessageResultMap[K]>> {
  try {
    const response = (await chrome.runtime.sendMessage(message)) as
      MessageResponse<MessageResultMap[K]> | undefined;
    const lastError = chrome.runtime.lastError?.message;
    if (lastError) return { ok: false, error: lastError };
    if (!response || typeof response !== 'object' || !('ok' in response)) {
      return { ok: false, error: 'Malformed response from background' };
    }
    return response;
  } catch (error) {
    // Thrown when the service worker is starting up or the port closed early.
    log.debug('sendMessage failed', error);
    return fail(error);
  }
}

/** Sends a message to a specific tab's content script. Never rejects. */
export async function sendToTab(
  tabId: number,
  message: ContentMessage,
): Promise<MessageResponse<ContentState | 'pong'>> {
  try {
    const response = (await chrome.tabs.sendMessage(tabId, message)) as
      MessageResponse<ContentState | 'pong'> | undefined;
    const lastError = chrome.runtime.lastError?.message;
    if (lastError) return { ok: false, error: lastError };
    if (!response) return { ok: false, error: 'No content script in this tab' };
    return response;
  } catch {
    // No content script on this page (system page, or the tab is gone).
    return { ok: false, error: 'No content script in this tab' };
  }
}
