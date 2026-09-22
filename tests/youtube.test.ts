import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_CLICKS_PER_BREAK,
  MIN_CLICK_INTERVAL_MS,
  SkipThrottle,
  findSkipButton,
  isClickable,
  isYouTubeProtectionActive,
  startYouTubeProtection,
  stopYouTubeProtection,
  youTubeSkipCount,
} from '../src/content/youtube/youtube-controller';
import {
  PAGE_AD_SELECTORS,
  PLAYER_OVERLAY_SELECTORS,
  isWatchPath,
} from '../src/content/youtube/youtube-selectors';
import { createNavigationWatcher } from '../src/content/youtube/youtube-navigation';

const fixture = readFileSync(resolve(import.meta.dirname, '../fixtures/youtube-ad.html'), 'utf8');

/** jsdom reports a zero-size box for everything, so visibility has to be faked explicitly. */
function makeVisible(element: Element, width = 90, height = 32): void {
  element.getBoundingClientRect = () =>
    ({ width, height, top: 0, left: 0, right: width, bottom: height, x: 0, y: 0 }) as DOMRect;
}

function byTestId(id: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!element) throw new Error(`fixture is missing [data-testid="${id}"]`);
  return element;
}

beforeEach(() => {
  document.body.innerHTML = fixture;
  makeVisible(byTestId('skip-button'));
});

afterEach(() => {
  stopYouTubeProtection();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('SkipThrottle', () => {
  it('enforces a cooldown between clicks', () => {
    const throttle = new SkipThrottle();
    expect(throttle.canClick(1000)).toBe(true);
    throttle.recordClick(1000);
    expect(throttle.canClick(1000 + MIN_CLICK_INTERVAL_MS - 1)).toBe(false);
    expect(throttle.canClick(1000 + MIN_CLICK_INTERVAL_MS)).toBe(true);
  });

  it('caps the number of clicks within one ad break', () => {
    const throttle = new SkipThrottle();
    let now = 10_000;
    for (let i = 0; i < MAX_CLICKS_PER_BREAK; i += 1) {
      expect(throttle.canClick(now)).toBe(true);
      throttle.recordClick(now);
      now += MIN_CLICK_INTERVAL_MS;
    }
    expect(throttle.canClick(now)).toBe(false);
  });

  it('restores the budget when the ad break ends', () => {
    const throttle = new SkipThrottle();
    let now = 10_000;
    for (let i = 0; i < MAX_CLICKS_PER_BREAK; i += 1) {
      throttle.recordClick(now);
      now += MIN_CLICK_INTERVAL_MS;
    }
    expect(throttle.canClick(now)).toBe(false);
    throttle.endBreak();
    expect(throttle.canClick(now)).toBe(true);
  });

  it('keeps a hard ceiling across many breaks, so no click loop is possible', () => {
    const throttle = new SkipThrottle();
    let now = 10_000;
    let clicks = 0;
    for (let i = 0; i < 200; i += 1) {
      throttle.endBreak();
      if (throttle.canClick(now)) {
        throttle.recordClick(now);
        clicks += 1;
      }
      now += MIN_CLICK_INTERVAL_MS;
    }
    expect(clicks).toBeLessThanOrEqual(20 * 3);
  });
});

describe('isClickable', () => {
  it('accepts a visible, enabled button', () => {
    expect(isClickable(byTestId('skip-button'))).toBe(true);
  });

  it.each([
    ['disabled', (el: HTMLElement) => el.setAttribute('disabled', '')],
    ['aria-disabled', (el: HTMLElement) => el.setAttribute('aria-disabled', 'true')],
    ['aria-hidden', (el: HTMLElement) => el.setAttribute('aria-hidden', 'true')],
    ['display:none', (el: HTMLElement) => (el.style.display = 'none')],
    ['visibility:hidden', (el: HTMLElement) => (el.style.visibility = 'hidden')],
    ['opacity:0', (el: HTMLElement) => (el.style.opacity = '0')],
    ['zero size', (el: HTMLElement) => makeVisible(el, 0, 0)],
  ])('rejects a button that is %s', (_label, mutate) => {
    const button = byTestId('skip-button');
    mutate(button);
    expect(isClickable(button)).toBe(false);
  });

  it('rejects null and non-elements', () => {
    expect(isClickable(null)).toBe(false);
  });
});

describe('findSkipButton', () => {
  it('finds the modern skip button inside the player', () => {
    const player = document.getElementById('movie_player')!;
    expect(findSkipButton(player)).toBe(byTestId('skip-button'));
  });

  it('returns null when the skip button is not yet visible', () => {
    byTestId('skip-button').style.display = 'none';
    expect(findSkipButton(document.getElementById('movie_player')!)).toBeNull();
  });

  it('returns null rather than throwing when the markup has changed entirely', () => {
    document.body.innerHTML = '<div id="movie_player" class="ad-showing"></div>';
    expect(findSkipButton(document.getElementById('movie_player')!)).toBeNull();
  });
});

describe('startYouTubeProtection', () => {
  it('injects a stylesheet hiding the ad surfaces but not the player controls', () => {
    startYouTubeProtection();
    const css = document.getElementById('clearblock-youtube-style')?.textContent ?? '';

    for (const entry of [...PLAYER_OVERLAY_SELECTORS, ...PAGE_AD_SELECTORS]) {
      expect(css).toContain(entry);
    }
    // Nothing that would disturb playback may be targeted, as a substring of the CSS...
    for (const forbidden of [
      '.ytp-chrome-bottom',
      '.ytp-play-button',
      '.ytp-fullscreen-button',
      '.ytp-subtitles-button',
      '.ytp-progress-bar',
      '.ytp-ad-skip-button',
      '.video-ads',
    ]) {
      expect(css).not.toContain(forbidden);
    }
    // ...and not as a whole selector either.
    const targeted = [...PLAYER_OVERLAY_SELECTORS, ...PAGE_AD_SELECTORS];
    for (const forbidden of ['video', '.html5-video-player', '#movie_player', 'ytd-app']) {
      expect(targeted).not.toContain(forbidden);
    }
  });

  it('presses the skip button once while an ad is showing', async () => {
    const button = byTestId('skip-button');
    const click = vi.spyOn(button, 'click');

    startYouTubeProtection();
    await new Promise((done) => setTimeout(done, 400));

    expect(click).toHaveBeenCalledTimes(1);
    expect(youTubeSkipCount()).toBeGreaterThan(0);
  });

  it('does not press anything when the player is not showing an ad', async () => {
    document.getElementById('movie_player')!.classList.remove('ad-showing');
    const click = vi.spyOn(byTestId('skip-button'), 'click');

    startYouTubeProtection();
    await new Promise((done) => setTimeout(done, 400));

    expect(click).not.toHaveBeenCalled();
  });

  it('never clicks repeatedly inside the cooldown window', async () => {
    const button = byTestId('skip-button');
    const click = vi.spyOn(button, 'click');

    startYouTubeProtection();
    // Force many observer batches in quick succession.
    for (let i = 0; i < 20; i += 1) {
      document.getElementById('movie_player')!.appendChild(document.createElement('span'));
    }
    await new Promise((done) => setTimeout(done, 500));

    expect(click.mock.calls.length).toBeLessThanOrEqual(1);
  });

  it('leaves playback state completely alone', async () => {
    const video = byTestId('video') as HTMLVideoElement;
    video.playbackRate = 1;
    video.muted = false;

    startYouTubeProtection();
    await new Promise((done) => setTimeout(done, 400));

    expect(video.playbackRate).toBe(1);
    expect(video.muted).toBe(false);
    expect(video.currentTime).toBe(0);
    // Controls, captions and fullscreen are untouched.
    expect(byTestId('controls').isConnected).toBe(true);
    expect(byTestId('captions-button').isConnected).toBe(true);
    expect(byTestId('fullscreen-button').isConnected).toBe(true);
  });

  it('tracks its own running state and cleans up on stop', () => {
    expect(isYouTubeProtectionActive()).toBe(false);
    startYouTubeProtection();
    expect(isYouTubeProtectionActive()).toBe(true);
    stopYouTubeProtection();
    expect(isYouTubeProtectionActive()).toBe(false);
    expect(document.getElementById('clearblock-youtube-style')).toBeNull();
  });

  it('does not throw when the player element never appears', async () => {
    document.body.innerHTML = '<div id="page-manager"></div>';
    expect(() => startYouTubeProtection()).not.toThrow();
    await new Promise((done) => setTimeout(done, 300));
  });
});

describe('isWatchPath', () => {
  it.each(['/watch', '/embed/abc', '/live/abc', '/shorts/abc'])('recognises %s', (path) => {
    expect(isWatchPath(path)).toBe(true);
  });

  it.each(['/', '/feed/subscriptions', '/results'])('does not treat %s as a watch page', (path) => {
    expect(isWatchPath(path)).toBe(false);
  });
});

describe('createNavigationWatcher', () => {
  it('fires on YouTube SPA navigation events and ignores a repeated URL', async () => {
    const seen: string[] = [];
    const watcher = createNavigationWatcher((url) => seen.push(url.pathname));
    watcher.start();

    document.dispatchEvent(new Event('yt-navigate-finish'));
    await new Promise((done) => setTimeout(done, 10));
    expect(seen).toEqual([]); // same URL — nothing to do

    history.pushState({}, '', '/watch?v=abc');
    document.dispatchEvent(new Event('yt-navigate-finish'));
    await new Promise((done) => setTimeout(done, 10));
    expect(seen).toEqual(['/watch']);

    watcher.stop();
    history.pushState({}, '', '/watch?v=def');
    document.dispatchEvent(new Event('yt-navigate-finish'));
    await new Promise((done) => setTimeout(done, 10));
    expect(seen).toEqual(['/watch']); // stopped watchers must not fire
  });
});
