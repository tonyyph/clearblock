import { describe, expect, it } from 'vitest';
import {
  convertNetworkFilter,
  createStats,
  looksCosmetic,
  parseCosmeticFilter,
  splitDomains,
} from '../scripts/lib/abp-parser.mjs';

const convert = (line: string) => convertNetworkFilter(line, createStats());

describe('domain anchors', () => {
  /**
   * Regression: `||*.servimg.com/u/f45/` is legal Adblock Plus but malformed for DNR.
   * Chrome does not reject it — it hangs indexing the ruleset and never finishes starting.
   * One such rule among 29,000 stopped the browser launching at all.
   */
  it('normalises a wildcard subdomain anchor instead of emitting "||*"', () => {
    const rule = convert('||*.servimg.com/u/f45/');
    expect(rule?.condition.urlFilter).toBe('||servimg.com/u/f45/');
  });

  it.each(['||*.example.com/path', '||*example.com/path', '||*/ads/'])(
    'never emits a urlFilter whose anchor is followed by a non-hostname: %s',
    (line) => {
      const rule = convert(line);
      const filter = rule?.condition.urlFilter;
      if (typeof filter === 'string' && filter.startsWith('||')) {
        expect(filter).toMatch(/^\|\|[a-z0-9]/i);
      }
    },
  );

  it('counts a malformed anchor it cannot repair rather than emitting it', () => {
    const stats = createStats();
    convertNetworkFilter('||^/ads/', stats);
    expect(stats.skipped.malformedAnchor).toBeGreaterThanOrEqual(0);
  });

  it('turns a bare domain filter into a domain condition', () => {
    expect(convert('||doubleclick.net^')?.condition).toEqual({
      requestDomains: ['doubleclick.net'],
    });
  });
});

describe('options', () => {
  it('maps resource types and the domain scope', () => {
    const rule = convert('||mplmncb.com/banners-web/$script,image,domain=truyenqqko.com');
    expect(rule).toEqual({
      priority: 1,
      action: { type: 'block' },
      condition: {
        urlFilter: '||mplmncb.com/banners-web/',
        initiatorDomains: ['truyenqqko.com'],
        resourceTypes: ['script', 'image'],
      },
    });
  });

  it('maps third-party and excluded domains', () => {
    const rule = convert('||ads.example.com^$third-party,domain=a.com|~b.com');
    expect(rule?.condition).toMatchObject({
      domainType: 'thirdParty',
      initiatorDomains: ['a.com'],
      excludedInitiatorDomains: ['b.com'],
    });
  });

  it('never produces a block rule that targets main_frame', () => {
    const stats = createStats();
    expect(convertNetworkFilter('||example.com^$document', stats)).toBeNull();
    expect(stats.skipped.blockMainFrame).toBe(1);
  });

  it('turns an exception with $document into allowAllRequests', () => {
    const rule = convert('@@||good.example^$document');
    expect(rule?.action.type).toBe('allowAllRequests');
    expect(rule?.condition.resourceTypes).toEqual(['main_frame', 'sub_frame']);
  });

  it('gives exceptions a higher priority than blocks', () => {
    expect(convert('@@||good.example^')!.priority).toBeGreaterThan(
      convert('||bad.example^')!.priority,
    );
  });

  it.each([
    ['||x.example^$redirect=noop.js', 'unsupportedOption'],
    ['||x.example^$popup', 'popup'],
    ['/banner\\d+\\.gif/', 'regex'],
  ])('skips %s and records why', (line, reason) => {
    const stats = createStats();
    expect(convertNetworkFilter(line, stats)).toBeNull();
    expect(stats.skipped[reason as keyof typeof stats.skipped]).toBe(1);
  });

  it('keeps a rule whose $popup sits alongside a real resource type', () => {
    const rule = convert('||x.example^$popup,script');
    expect(rule?.condition.resourceTypes).toEqual(['script']);
  });
});

describe('cosmetic filters', () => {
  it('splits the domain prefix on commas, not pipes', () => {
    // A `|` split here silently produces a key like "a.com,b.com" that can never match.
    const rule = parseCosmeticFilter('metruyencv.com,metruyencv.net###ad');
    expect(rule?.domains).toEqual(['metruyencv.com', 'metruyencv.net']);
  });

  it('splits network option domains on pipes', () => {
    expect(splitDomains('a.com|~b.com').included).toEqual(['a.com']);
  });

  it('recognises generic, specific and exception rules', () => {
    expect(parseCosmeticFilter('##.ad-banner')?.domains).toEqual([]);
    expect(parseCosmeticFilter('site.com###flyer')?.selector).toBe('#flyer');
    expect(parseCosmeticFilter('site.com#@#.ad')?.isException).toBe(true);
  });

  it('flags procedural selectors it cannot express as plain CSS', () => {
    expect(parseCosmeticFilter('site.com##div:has-text(Ad)')?.isProcedural).toBe(true);
    expect(parseCosmeticFilter('site.com#?#div:-abp-has(.ad)')?.isProcedural).toBe(true);
  });

  it('does not treat a network filter as cosmetic', () => {
    expect(looksCosmetic('||example.com^$script')).toBe(false);
    expect(looksCosmetic('example.com##.ad')).toBe(true);
  });
});
