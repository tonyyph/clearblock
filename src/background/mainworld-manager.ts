/**
 * Registers the MAIN-world YouTube pruner.
 *
 * The pruner has to run in the page's own JavaScript world to reach YouTube's globals, and
 * a MAIN-world script cannot read chrome.storage to find out whether it should be active.
 * So instead of injecting it unconditionally and letting it decide, the service worker
 * registers it only when it should run and unregisters it otherwise. That is what makes
 * "pause on this site" and the YouTube toggle genuinely switch it off, rather than leaving
 * it running and hoping it behaves.
 */
import { createLogger } from '../shared/logger';
import { isYouTubeHost } from '../shared/domain';
import type { ExtensionSettings } from '../shared/types';

const log = createLogger('mainworld');

const SCRIPT_ID = 'clearblock-youtube-pruner';

const YOUTUBE_MATCHES = [
  '*://*.youtube.com/*',
  '*://youtube.com/*',
  '*://*.youtube-nocookie.com/*',
];

/** Allowlisted YouTube domains become excludeMatches so the pruner is not injected there. */
function excludeMatchesFor(allowlist: readonly string[]): string[] {
  const patterns: string[] = [];
  for (const domain of allowlist) {
    if (!isYouTubeHost(domain)) continue;
    patterns.push(`*://${domain}/*`, `*://*.${domain}/*`);
  }
  return patterns;
}

function shouldInject(settings: ExtensionSettings): boolean {
  if (!settings.enabled || !settings.youtubeProtectionEnabled) return false;
  // A blanket allowlist entry for YouTube itself means the whole module is off.
  return !settings.allowlistedDomains.some((domain) => isYouTubeHost(domain));
}

async function currentRegistration(): Promise<boolean> {
  try {
    const scripts = await chrome.scripting.getRegisteredContentScripts({ ids: [SCRIPT_ID] });
    return scripts.length > 0;
  } catch {
    return false;
  }
}

/** Brings the registration in line with settings. Safe to call on every settings change. */
export async function syncYouTubeInjection(settings: ExtensionSettings): Promise<boolean> {
  const wanted = shouldInject(settings);
  const registered = await currentRegistration();

  if (!wanted) {
    if (registered) {
      try {
        await chrome.scripting.unregisterContentScripts({ ids: [SCRIPT_ID] });
        log.info('YouTube pruner unregistered');
      } catch (error) {
        log.warn('unregister failed', error);
      }
    }
    return false;
  }

  const registration: chrome.scripting.RegisteredContentScript = {
    id: SCRIPT_ID,
    js: ['youtube-pruner.js'],
    matches: YOUTUBE_MATCHES,
    excludeMatches: excludeMatchesFor(settings.allowlistedDomains),
    runAt: 'document_start',
    allFrames: true,
    // MAIN world: the script shares globals with YouTube's player code, which is the only
    // way to intervene before the player reads its ad schedule.
    world: 'MAIN',
    persistAcrossSessions: true,
  };

  try {
    if (registered) await chrome.scripting.updateContentScripts([registration]);
    else await chrome.scripting.registerContentScripts([registration]);
    log.info('YouTube pruner registered');
    return true;
  } catch (error) {
    // Registering can fail if the file is missing or the API is unavailable; the rest of
    // the YouTube module still works, so this must never break initialisation.
    log.error('registerContentScripts failed', error);
    return false;
  }
}
