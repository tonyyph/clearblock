/**
 * YouTube ad-slot pruner — runs in the page's MAIN world at document_start.
 *
 * Why this file is different from everything else in src/content: it is injected with
 * `world: "MAIN"`, so it shares globals with YouTube's own code and cannot use any chrome.*
 * API. It is registered and unregistered by the service worker, which is what makes the
 * per-site pause and the YouTube toggle actually switch it off.
 *
 * How YouTube ads are scheduled
 * -----------------------------
 * The media for an ad and the media for the video both come from googlevideo.com, so a
 * network rule cannot separate them — blocking the ad would block the video. What *can* be
 * separated is the schedule. YouTube's player decides what to play from a "player response"
 * object, and the ad breaks live in a handful of well-known fields on it:
 *
 *   adPlacements, playerAds, adSlots, adBreakHeartbeatParams
 *
 * Remove those before the player reads them and there is no ad break to play. This is the
 * same mechanism uBlock Origin, uBlock Origin Lite and AdBlock use.
 *
 * The object arrives by two routes, and both have to be covered:
 *   1. inline on a fresh watch page, assigned to `window.ytInitialPlayerResponse`;
 *   2. as JSON from `youtubei/v1/player` on every in-page navigation after that.
 *
 * What this deliberately does not touch: streamingData, playabilityStatus, videoDetails,
 * captions or anything else the player needs. Only the ad-scheduling keys are removed.
 *
 * This is an arms race. YouTube changes these shapes, and if it ever stitches ads into the
 * media stream server-side, nothing here — or in any other extension — will help.
 */

export const AD_KEYS = ['adPlacements', 'playerAds', 'adSlots', 'adBreakHeartbeatParams'] as const;

/** Cheap pre-check so the JSON.parse hook costs nothing on the vast majority of payloads. */
const MARKERS = AD_KEYS.map((key) => `"${key}"`);

const MAX_DEPTH = 8;

type Dict = Record<string, unknown>;

let prunedCount = 0;

function isDict(value: unknown): value is Dict {
  return typeof value === 'object' && value !== null;
}

/** Removes the ad-scheduling keys wherever they appear. Bounded so it cannot run away. */
export function pruneDeep(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH || !isDict(value)) return value;

  if (Array.isArray(value)) {
    for (const item of value) pruneDeep(item, depth + 1);
    return value;
  }

  for (const key of AD_KEYS) {
    if (key in value) {
      delete value[key];
      prunedCount += 1;
    }
  }
  for (const key of Object.keys(value)) {
    pruneDeep(value[key], depth + 1);
  }
  return value;
}

function report(): void {
  try {
    document.dispatchEvent(
      new CustomEvent('clearblock:youtube-pruned', { detail: { count: prunedCount } }),
    );
  } catch {
    // The page may have torn down; nothing to do.
  }
}

/* 1. The inline player response on a fresh watch page. -------------------- */

function interceptInlineResponse(): void {
  const PROPERTIES = ['ytInitialPlayerResponse', 'ytInitialData'];
  for (const property of PROPERTIES) {
    let stored: unknown;
    try {
      const existing = Reflect.get(window, property);
      if (existing !== undefined) stored = pruneDeep(existing);
      Object.defineProperty(window, property, {
        configurable: true,
        get: () => stored,
        set(next: unknown) {
          // YouTube assigns this from an inline <script>. Pruning in the setter means the
          // player never observes the ad slots at all.
          stored = pruneDeep(next);
          if (prunedCount > 0) report();
        },
      });
    } catch {
      // Another extension already owns the property; leave it alone rather than fight.
    }
  }
}

/* 2. Player responses fetched during in-page navigation. ------------------ */

function interceptJsonParse(): void {
  const original = JSON.parse;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  JSON.parse = function patched(this: unknown, text: string, reviver?: any): unknown {
    const result = original.call(this, text, reviver);
    if (typeof text === 'string' && !MARKERS.some((marker) => text.includes(marker))) {
      return result;
    }
    const before = prunedCount;
    const pruned = pruneDeep(result);
    if (prunedCount > before) report();
    return pruned;
  } as typeof JSON.parse;
}

function interceptResponseJson(): void {
  const original = Response.prototype.json;
  Response.prototype.json = function patched(this: Response): Promise<unknown> {
    return original.call(this).then((body: unknown) => {
      const before = prunedCount;
      const pruned = pruneDeep(body);
      if (prunedCount > before) report();
      return pruned;
    });
  };
}

export function installPruner(): void {
  interceptInlineResponse();
  interceptJsonParse();
  interceptResponseJson();
}

export function prunedFieldCount(): number {
  return prunedCount;
}

installPruner();
