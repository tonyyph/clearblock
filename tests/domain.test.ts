import { describe, expect, it } from 'vitest';
import {
  displayHostname,
  domainMatches,
  isAllowlisted,
  isSystemPage,
  isValidDomain,
  isYouTubeHost,
  normalizeDomain,
  parseHostname,
  sanitizeAllowlist,
} from '../src/shared/domain';

describe('parseHostname', () => {
  it('extracts the hostname from an http(s) URL', () => {
    expect(parseHostname('https://www.Example.com/a/b?c=1#d')).toBe('www.example.com');
    expect(parseHostname('http://sub.example.co.uk:8080/')).toBe('sub.example.co.uk');
  });

  it('returns null for non-http schemes and junk', () => {
    expect(parseHostname('chrome://extensions')).toBeNull();
    expect(parseHostname('file:///Users/me/page.html')).toBeNull();
    expect(parseHostname('not a url')).toBeNull();
    expect(parseHostname(undefined)).toBeNull();
    expect(parseHostname('')).toBeNull();
  });
});

describe('isSystemPage', () => {
  it.each([
    'chrome://newtab',
    'chrome-extension://abc/options.html',
    'edge://settings',
    'about:blank',
    'devtools://devtools/bundled/inspector.html',
    'view-source:https://example.com',
    'file:///tmp/x.html',
    'https://chromewebstore.google.com/detail/abc',
    'https://chrome.google.com/webstore/category/extensions',
  ])('treats %s as a system page', (url) => {
    expect(isSystemPage(url)).toBe(true);
  });

  it('treats ordinary pages as usable', () => {
    expect(isSystemPage('https://example.com')).toBe(false);
    expect(isSystemPage('http://localhost:3000/app')).toBe(false);
  });

  it('treats a missing or malformed URL as unusable rather than throwing', () => {
    expect(isSystemPage(undefined)).toBe(true);
    expect(isSystemPage('::::')).toBe(true);
  });
});

describe('normalizeDomain', () => {
  it.each([
    ['Example.COM', 'example.com'],
    ['www.example.com', 'example.com'],
    ['  example.com  ', 'example.com'],
    ['https://www.example.com/path?q=1#f', 'example.com'],
    ['example.com:8443', 'example.com'],
    ['example.com.', 'example.com'],
    ['user:pass@example.com/x', 'example.com'],
    ['sub.example.co.uk', 'sub.example.co.uk'],
    ['xn--80ak6aa92e.com', 'xn--80ak6aa92e.com'],
    ['192.168.1.10', '192.168.1.10'],
    ['localhost', 'localhost'],
  ])('normalises %s to %s', (input, expected) => {
    expect(normalizeDomain(input)).toBe(expected);
  });

  it.each([
    '',
    '   ',
    'com',
    'exa mple.com',
    'example',
    '-example.com',
    'example-.com',
    'exam_ple.com',
    'example.123',
    '999.999.999.999',
    '[2001:db8::1]',
    'ftp://example.com',
    'javascript:alert(1)',
    null,
    undefined,
    42 as unknown as string,
  ])('rejects %s', (input) => {
    expect(normalizeDomain(input as string)).toBeNull();
  });

  it('rejects a label longer than 63 characters', () => {
    expect(normalizeDomain(`${'a'.repeat(64)}.com`)).toBeNull();
    expect(normalizeDomain(`${'a'.repeat(63)}.com`)).toBe(`${'a'.repeat(63)}.com`);
  });
});

describe('isValidDomain', () => {
  it('mirrors normalizeDomain', () => {
    expect(isValidDomain('example.com')).toBe(true);
    expect(isValidDomain('nope')).toBe(false);
  });
});

describe('domainMatches / isAllowlisted', () => {
  it('matches the domain itself and its subdomains', () => {
    expect(domainMatches('example.com', 'example.com')).toBe(true);
    expect(domainMatches('a.b.example.com', 'example.com')).toBe(true);
    expect(domainMatches('www.example.com', 'example.com')).toBe(true);
  });

  it('does not match a look-alike suffix', () => {
    expect(domainMatches('notexample.com', 'example.com')).toBe(false);
    expect(domainMatches('example.com.evil.com', 'example.com')).toBe(false);
    expect(domainMatches('example.company', 'example.com')).toBe(false);
  });

  it('checks a whole allowlist', () => {
    const list = ['example.com', 'news.site'];
    expect(isAllowlisted('shop.example.com', list)).toBe(true);
    expect(isAllowlisted('other.org', list)).toBe(false);
    expect(isAllowlisted(null, list)).toBe(false);
  });
});

describe('sanitizeAllowlist', () => {
  it('normalises, de-duplicates, sorts and drops invalid entries', () => {
    expect(
      sanitizeAllowlist(['WWW.B.com', 'b.com', 'https://a.com/x', 'nope', 42, null, '  c.org ']),
    ).toEqual(['a.com', 'b.com', 'c.org']);
  });
});

describe('displayHostname', () => {
  it('strips www and handles an absent host', () => {
    expect(displayHostname('www.example.com')).toBe('example.com');
    expect(displayHostname(null)).toBe('No site');
  });
});

describe('isYouTubeHost', () => {
  it('recognises YouTube and its no-cookie domain', () => {
    expect(isYouTubeHost('www.youtube.com')).toBe(true);
    expect(isYouTubeHost('m.youtube.com')).toBe(true);
    expect(isYouTubeHost('www.youtube-nocookie.com')).toBe(true);
    expect(isYouTubeHost('notyoutube.com')).toBe(false);
    expect(isYouTubeHost(null)).toBe(false);
  });
});
