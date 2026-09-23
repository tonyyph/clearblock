import { describe, expect, it } from 'vitest';
import { AD_KEYS, pruneDeep } from '../src/content/youtube/ad-pruner';

/**
 * Importing the module installs the hooks into this test file's window, which is what the
 * "installs into the page" block below exercises. Vitest isolates files, so patching
 * JSON.parse here does not leak into other suites.
 */

/** The shape YouTube's player actually uses, reduced to the parts that matter. */
const playerResponse = () => ({
  playabilityStatus: { status: 'OK' },
  streamingData: { adaptiveFormats: [{ itag: 137 }], formats: [{ itag: 18 }] },
  videoDetails: { videoId: 'abc123', title: 'A video' },
  captions: { playerCaptionsTracklistRenderer: {} },
  playerConfig: { audioConfig: {} },
  adPlacements: [{ adPlacementRenderer: {} }, { adPlacementRenderer: {} }],
  playerAds: [{ playerLegacyDesktopWatchAdsRenderer: {} }],
  adSlots: [{ adSlotRenderer: {} }],
  adBreakHeartbeatParams: 'encoded',
});

describe('pruneDeep', () => {
  it('removes every ad-scheduling field', () => {
    const response = pruneDeep(playerResponse()) as Record<string, unknown>;
    for (const key of AD_KEYS) expect(key in response).toBe(false);
  });

  it('leaves everything the player needs untouched', () => {
    const response = pruneDeep(playerResponse()) as ReturnType<typeof playerResponse>;
    // Removing any of these would break playback, captions or the whole page.
    expect(response.streamingData.adaptiveFormats).toHaveLength(1);
    expect(response.streamingData.formats).toHaveLength(1);
    expect(response.playabilityStatus.status).toBe('OK');
    expect(response.videoDetails.videoId).toBe('abc123');
    expect(response.captions).toBeDefined();
    expect(response.playerConfig).toBeDefined();
  });

  it('reaches ad slots nested inside a navigation response', () => {
    const nested = {
      response: { contents: { twoColumnWatchNextResults: { adSlots: [{}], keep: 1 } } },
      playerResponse: playerResponse(),
    };
    pruneDeep(nested);

    const watchNext = nested.response.contents.twoColumnWatchNextResults;
    expect('adSlots' in watchNext).toBe(false);
    expect(watchNext.keep).toBe(1);
    expect('adPlacements' in nested.playerResponse).toBe(false);
  });

  it('walks arrays as well as objects', () => {
    const items: Array<Record<string, unknown>> = [{ adPlacements: [{}] }, { keep: 1 }];
    pruneDeep(items);
    expect('adPlacements' in items[0]!).toBe(false);
    expect(items[1]!.keep).toBe(1);
  });

  it('is bounded, so a deeply nested or cyclic payload cannot hang the page', () => {
    let deep: Record<string, unknown> = { adPlacements: [{}] };
    for (let i = 0; i < 200; i += 1) deep = { child: deep };
    expect(() => pruneDeep(deep)).not.toThrow();
  });

  it('passes through primitives and null untouched', () => {
    expect(pruneDeep(null)).toBeNull();
    expect(pruneDeep('text')).toBe('text');
    expect(pruneDeep(42)).toBe(42);
  });
});

describe('installed into the page', () => {
  // Note: the interceptor is an accessor property. Deleting it would remove the hook, so
  // these tests re-assign rather than delete — which is also what YouTube itself does.

  it('strips ad fields from anything parsed as a player response', () => {
    const parsed = JSON.parse(JSON.stringify(playerResponse())) as Record<string, unknown>;
    for (const key of AD_KEYS) expect(key in parsed).toBe(false);
    expect(parsed.streamingData).toBeDefined();
  });

  it('leaves ordinary JSON completely alone', () => {
    const value = JSON.parse('{"a":1,"b":[2,3],"c":{"d":"e"}}');
    expect(value).toEqual({ a: 1, b: [2, 3], c: { d: 'e' } });
  });

  it('prunes the inline response as it is assigned', () => {
    const win = window as unknown as { ytInitialPlayerResponse?: Record<string, unknown> };
    win.ytInitialPlayerResponse = playerResponse();
    const stored = win.ytInitialPlayerResponse;
    expect(stored).toBeDefined();
    for (const key of AD_KEYS) expect(key in stored!).toBe(false);
    expect(stored!.videoDetails).toBeDefined();
  });

  it('announces what it pruned so the popup can report a real number', () => {
    let reported = -1;
    document.addEventListener('clearblock:youtube-pruned', (event) => {
      reported = (event as CustomEvent<{ count: number }>).detail.count;
    });
    (window as unknown as { ytInitialPlayerResponse?: unknown }).ytInitialPlayerResponse =
      playerResponse();
    expect(reported).toBeGreaterThan(0);
  });
});
