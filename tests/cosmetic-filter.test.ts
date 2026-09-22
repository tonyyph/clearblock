import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  cosmeticHiddenCount,
  isCosmeticFilteringActive,
  startCosmeticFiltering,
  stopCosmeticFiltering,
} from '../src/content/cosmetic-filter';
import { GENERIC_SELECTORS, selectorsForHostname } from '../src/content/selectors';

/** The same fixture a human can open in Chrome, so the tests cannot drift from the demo. */
const fixture = readFileSync(resolve(import.meta.dirname, '../fixtures/test-page.html'), 'utf8');
const fixtureBody = /<body>([\s\S]*)<script>/.exec(fixture)?.[1] ?? '';

const AD_TESTIDS = [
  'ad-banner',
  'ad-token',
  'advertisement',
  'ad-slot',
  'sticky-ad',
  'gpt-ad',
  'data-ad-slot',
  'aria-ad',
  'adsbygoogle',
  'taboola',
];

const SAFE_TESTIDS = [
  'header',
  'shadow',
  'adapter',
  'gradient',
  'download',
  'badge',
  'adaptive',
  'broadcast',
  'add-to-cart',
  'readable',
];

const selector = GENERIC_SELECTORS.join(',');

function byTestId(id: string): Element {
  const element = document.querySelector(`[data-testid="${id}"]`);
  if (!element) throw new Error(`fixture is missing [data-testid="${id}"]`);
  return element;
}

beforeEach(() => {
  document.body.innerHTML = fixtureBody;
});

afterEach(() => {
  stopCosmeticFiltering();
  document.body.innerHTML = '';
});

describe('generic selector list', () => {
  it.each(AD_TESTIDS)('matches the ad element %s', (id) => {
    expect(byTestId(id).matches(selector)).toBe(true);
  });

  it.each(SAFE_TESTIDS)('does not match the look-alike element %s', (id) => {
    expect(byTestId(id).matches(selector)).toBe(false);
  });

  it('never uses a substring class match', () => {
    // `[class*="ad"]` is the classic false-positive machine; it must not appear.
    for (const entry of GENERIC_SELECTORS) {
      expect(entry).not.toMatch(/\[class\*=/);
      expect(entry).not.toMatch(/\[id\*=/);
    }
  });
});

describe('domain-specific selectors', () => {
  it('returns rules for the domain and its subdomains only', () => {
    expect(selectorsForHostname('www.reddit.com')).toContain('shreddit-ad-post');
    expect(selectorsForHostname('reddit.com')).toContain('shreddit-ad-post');
    expect(selectorsForHostname('notreddit.com')).toEqual([]);
    expect(selectorsForHostname('example.com')).toEqual([]);
  });
});

describe('startCosmeticFiltering', () => {
  it('injects exactly one stylesheet containing the ad selectors', () => {
    startCosmeticFiltering({ hostname: 'example.com', customSelectors: [] });

    const styles = document.querySelectorAll('#clearblock-cosmetic-style');
    expect(styles).toHaveLength(1);
    const css = styles[0]?.textContent ?? '';
    expect(css).toContain('.ad-banner');
    expect(css).toContain('display: none !important');
  });

  it('does not add a second stylesheet when started twice', () => {
    startCosmeticFiltering({ hostname: 'example.com', customSelectors: [] });
    startCosmeticFiltering({ hostname: 'example.com', customSelectors: [] });
    expect(document.querySelectorAll('#clearblock-cosmetic-style')).toHaveLength(1);
  });

  it('includes validated custom selectors', () => {
    startCosmeticFiltering({ hostname: 'example.com', customSelectors: ['.my-own-promo'] });
    expect(document.querySelector('#clearblock-cosmetic-style')?.textContent).toContain(
      '.my-own-promo',
    );
  });

  it('counts the ad elements already on the page', () => {
    startCosmeticFiltering({ hostname: 'example.com', customSelectors: [] });
    expect(cosmeticHiddenCount()).toBeGreaterThanOrEqual(AD_TESTIDS.length);
  });

  it('reports itself as active and then inactive', () => {
    expect(isCosmeticFilteringActive()).toBe(false);
    startCosmeticFiltering({ hostname: 'example.com', customSelectors: [] });
    expect(isCosmeticFilteringActive()).toBe(true);
    stopCosmeticFiltering();
    expect(isCosmeticFilteringActive()).toBe(false);
  });
});

describe('dynamically inserted elements', () => {
  it('notices a new ad node through the observer', async () => {
    startCosmeticFiltering({ hostname: 'example.com', customSelectors: [] });
    const before = cosmeticHiddenCount();

    const ad = document.createElement('div');
    ad.className = 'ad-banner';
    document.body.appendChild(ad);

    const safe = document.createElement('div');
    safe.className = 'headline';
    document.body.appendChild(safe);

    await new Promise((done) => setTimeout(done, 300));

    // The new ad was counted; the look-alike element was not.
    expect(cosmeticHiddenCount()).toBe(before + 1);
    expect(safe.matches(selector)).toBe(false);
  });
});

describe('stopCosmeticFiltering', () => {
  it('removes the stylesheet so the page is fully restored', () => {
    startCosmeticFiltering({ hostname: 'example.com', customSelectors: [] });
    stopCosmeticFiltering();
    expect(document.querySelector('#clearblock-cosmetic-style')).toBeNull();
  });

  it('is safe to call when filtering was never started', () => {
    expect(() => stopCosmeticFiltering()).not.toThrow();
  });
});
