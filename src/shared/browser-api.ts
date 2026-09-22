/**
 * Thin wrappers over the chrome.* APIs.
 *
 * Two jobs: (1) always drain `chrome.runtime.lastError` so Chrome does not print
 * "Unchecked runtime.lastError", and (2) turn expected failures (no such tab, port
 * closed, permission not granted) into values instead of unhandled rejections.
 */
import { createLogger } from './logger';

const log = createLogger('browser');

export function hasChrome(): boolean {
  return typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined';
}

/** Reads and clears lastError. Returns its message, or null when there was none. */
export function takeLastError(): string | null {
  const error = chrome.runtime.lastError;
  return error?.message ?? null;
}

export async function storageGet<T>(key: string): Promise<T | undefined> {
  try {
    const result = await chrome.storage.local.get(key);
    takeLastError();
    return result[key] as T | undefined;
  } catch (error) {
    log.error('storage.get failed', key, error);
    return undefined;
  }
}

export async function storageSet(items: Record<string, unknown>): Promise<boolean> {
  try {
    await chrome.storage.local.set(items);
    const error = takeLastError();
    if (error) {
      log.error('storage.set failed', error);
      return false;
    }
    return true;
  } catch (error) {
    log.error('storage.set threw', error);
    return false;
  }
}

export async function storageRemove(keys: string | string[]): Promise<void> {
  try {
    await chrome.storage.local.remove(keys);
    takeLastError();
  } catch (error) {
    log.error('storage.remove failed', error);
  }
}

export async function getActiveTab(): Promise<chrome.tabs.Tab | null> {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    takeLastError();
    return tab ?? null;
  } catch (error) {
    log.error('tabs.query failed', error);
    return null;
  }
}

export async function getTab(tabId: number): Promise<chrome.tabs.Tab | null> {
  try {
    const tab = await chrome.tabs.get(tabId);
    takeLastError();
    return tab ?? null;
  } catch {
    // The tab was closed between the request and this call; not an error worth logging.
    takeLastError();
    return null;
  }
}

export async function reloadTab(tabId: number): Promise<boolean> {
  try {
    await chrome.tabs.reload(tabId);
    return takeLastError() === null;
  } catch (error) {
    log.warn('tabs.reload failed', error);
    return false;
  }
}

export async function hasPermission(permission: string): Promise<boolean> {
  try {
    const granted = await chrome.permissions.contains({
      permissions: [permission] as chrome.runtime.ManifestPermission[],
    });
    takeLastError();
    return granted;
  } catch {
    takeLastError();
    return false;
  }
}

export function getExtensionVersion(): string {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return '0.0.0';
  }
}
