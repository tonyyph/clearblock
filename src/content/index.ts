/**
 * Content script entry point (runs at document_start in every http(s) frame).
 *
 * Settings are read straight from chrome.storage.local rather than by messaging the
 * service worker. At document_start the worker is usually asleep, and waking it would add
 * tens of milliseconds before the first paint — exactly when the cosmetic stylesheet needs
 * to be in place to avoid a flash of ad content. storage.onChanged then keeps every frame
 * in sync live, so toggling protection takes effect without a reload.
 */
import { isAllowlisted, isYouTubeHost } from '../shared/domain';
import { createLogger } from '../shared/logger';
import { readSettings } from '../shared/storage';
import { STORAGE_KEYS } from '../shared/constants';
import { validateSettings } from '../shared/storage';
import type { ContentState, ExtensionSettings, MessageResponse } from '../shared/types';
import {
  cosmeticHiddenCount,
  isCosmeticFilteringActive,
  startCosmeticFiltering,
  stopCosmeticFiltering,
} from './cosmetic-filter';
import {
  isYouTubeProtectionActive,
  startYouTubeProtection,
  stopYouTubeProtection,
} from './youtube/youtube-controller';

const log = createLogger('content');

/**
 * The allowlist is a property of the page the user is looking at, not of whatever
 * third-party frame happens to be embedded in it. `ancestorOrigins` gives the top-level
 * origin even for a cross-origin frame, where `top.location` would throw.
 */
function topLevelHostname(): string {
  try {
    const ancestors = location.ancestorOrigins;
    if (ancestors && ancestors.length > 0) {
      const topOrigin = ancestors[ancestors.length - 1];
      if (topOrigin) return new URL(topOrigin).hostname;
    }
  } catch {
    // Fall through to this frame's own hostname.
  }
  return location.hostname;
}

const pageHostname = topLevelHostname();
const frameHostname = location.hostname;

function shouldRunCosmetic(settings: ExtensionSettings): boolean {
  if (!settings.enabled || !settings.cosmeticFilteringEnabled) return false;
  return !isAllowlisted(pageHostname, settings.allowlistedDomains);
}

function shouldRunYouTube(settings: ExtensionSettings): boolean {
  if (!settings.enabled || !settings.youtubeProtectionEnabled) return false;
  if (!isYouTubeHost(frameHostname)) return false;
  return !isAllowlisted(pageHostname, settings.allowlistedDomains);
}

function apply(settings: ExtensionSettings): void {
  if (shouldRunCosmetic(settings)) {
    startCosmeticFiltering({
      hostname: frameHostname,
      customSelectors: settings.customCosmeticSelectors,
    });
  } else if (isCosmeticFilteringActive()) {
    stopCosmeticFiltering();
  }

  if (shouldRunYouTube(settings)) {
    startYouTubeProtection();
  } else if (isYouTubeProtectionActive()) {
    stopYouTubeProtection();
  }
}

function buildState(): ContentState {
  return {
    hostname: frameHostname,
    active: isCosmeticFilteringActive() || isYouTubeProtectionActive(),
    hiddenElements: cosmeticHiddenCount(),
    youtubeActive: isYouTubeProtectionActive(),
  };
}

function registerMessageHandler(): void {
  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (typeof message !== 'object' || message === null || !('type' in message)) {
      sendResponse({ ok: false, error: 'Invalid message' } satisfies MessageResponse<never>);
      return false;
    }
    const type = (message as { type: unknown }).type;
    if (type === 'PING') {
      sendResponse({ ok: true, data: 'pong' } satisfies MessageResponse<'pong'>);
      return false;
    }
    if (type === 'GET_CONTENT_STATE') {
      sendResponse({ ok: true, data: buildState() } satisfies MessageResponse<ContentState>);
      return false;
    }
    sendResponse({ ok: false, error: 'Unsupported message' } satisfies MessageResponse<never>);
    return false;
  });
}

function watchSettings(): void {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    const change = changes[STORAGE_KEYS.settings];
    if (!change) return;
    try {
      apply(validateSettings(change.newValue));
    } catch (error) {
      log.warn('failed to apply settings change', error);
    }
  });
}

async function boot(): Promise<void> {
  try {
    const settings = await readSettings();
    apply(settings);
    registerMessageHandler();
    watchSettings();
  } catch (error) {
    // Typically "Extension context invalidated" right after an update/reload. The page is
    // left completely untouched rather than half-filtered.
    log.warn('content script boot failed', error);
  }
}

void boot();
