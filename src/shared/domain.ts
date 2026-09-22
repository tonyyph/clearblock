/**
 * Hostname / allowlist helpers.
 *
 * Everything here is pure so it can be unit-tested without a browser. The rules are
 * deliberately conservative: a bad normalisation would either silently disable
 * protection on the wrong site or write a rule Chrome rejects.
 */

/** URL schemes where no extension code can run, so the UI must degrade instead of erroring. */
const UNSUPPORTED_SCHEMES = [
  'chrome:',
  'chrome-extension:',
  'chrome-untrusted:',
  'edge:',
  'extension:',
  'about:',
  'devtools:',
  'view-source:',
  'data:',
  'blob:',
  'filesystem:',
  'javascript:',
];

/** Hosts Chrome blocks extensions from touching regardless of host permissions. */
const RESTRICTED_HOSTS = new Set([
  'chromewebstore.google.com',
  'chrome.google.com',
  'microsoftedge.microsoft.com',
]);

const LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;
const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

/** Extracts the hostname from a full URL. Returns null for anything that is not http(s). */
export function parseHostname(url: string | null | undefined): string | null {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  return parsed.hostname.toLowerCase() || null;
}

/**
 * True when ClearBlock can do nothing useful on this URL: browser pages, the Web Store,
 * the new-tab page, extension pages. Callers use it to show an explanatory empty state
 * instead of a broken toggle.
 */
export function isSystemPage(url: string | null | undefined): boolean {
  if (!url) return true;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  if (UNSUPPORTED_SCHEMES.includes(parsed.protocol)) return true;
  if (parsed.protocol === 'file:') return true;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return true;
  const host = parsed.hostname.toLowerCase();
  if (RESTRICTED_HOSTS.has(host)) return true;
  // chrome.google.com/webstore historically; the whole host is restricted anyway.
  return false;
}

function isIpv4(value: string): boolean {
  const match = IPV4_PATTERN.exec(value);
  if (!match) return false;
  return match.slice(1).every((part) => {
    const n = Number(part);
    return String(n) === String(Number(part)) && n >= 0 && n <= 255;
  });
}

/**
 * Turns user input ("https://WWW.Example.com/path?q=1", "example.com:8443", " example.com ")
 * into a canonical registrable hostname ("example.com"), or null when the input is not a
 * usable domain. `www.` is stripped because the allowlist matches subdomains anyway.
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  if (typeof input !== 'string') return null;
  let value = input.trim().toLowerCase();
  if (!value) return null;

  // Accept a pasted URL as well as a bare hostname.
  if (value.includes('://')) {
    try {
      const parsed = new URL(value);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      value = parsed.hostname;
    } catch {
      return null;
    }
  } else {
    // Strip anything after the authority: path, query, fragment, credentials.
    value = value.split('@').pop() ?? value;
    value = value.split('/')[0] ?? '';
    value = value.split('?')[0] ?? '';
    value = value.split('#')[0] ?? '';
  }

  // Strip a port, but keep IPv6 literals out entirely (DNR conditions need a domain).
  if (value.startsWith('[')) return null;
  const colonIndex = value.indexOf(':');
  if (colonIndex !== -1) value = value.slice(0, colonIndex);

  value = value.replace(/\.+$/, '');
  if (!value) return null;
  if (value.length > 253) return null;
  if (value === 'localhost') return 'localhost';
  if (isIpv4(value)) return value;

  const labels = value.split('.');
  if (labels.length < 2) return null;
  if (!labels.every((label) => LABEL_PATTERN.test(label))) return null;
  // Reject an all-numeric TLD: that is a malformed IP, not a domain.
  const tld = labels[labels.length - 1] ?? '';
  if (/^\d+$/.test(tld)) return null;

  const withoutWww = value.startsWith('www.') ? value.slice(4) : value;
  return withoutWww || null;
}

export function isValidDomain(input: string | null | undefined): boolean {
  return normalizeDomain(input) !== null;
}

/** `www.` insensitive, subdomain-aware: "a.b.example.com" matches an entry of "example.com". */
export function domainMatches(hostname: string, allowlistEntry: string): boolean {
  const host = normalizeDomain(hostname);
  const entry = normalizeDomain(allowlistEntry);
  if (!host || !entry) return false;
  return host === entry || host.endsWith(`.${entry}`);
}

export function isAllowlisted(
  hostname: string | null | undefined,
  allowlist: readonly string[],
): boolean {
  if (!hostname) return false;
  return allowlist.some((entry) => domainMatches(hostname, entry));
}

/** De-duplicates, normalises and sorts an allowlist, dropping invalid entries. */
export function sanitizeAllowlist(entries: readonly unknown[]): string[] {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (typeof entry !== 'string') continue;
    const normalized = normalizeDomain(entry);
    if (normalized) seen.add(normalized);
  }
  return [...seen].sort();
}

/** Display form used in the popup header. */
export function displayHostname(hostname: string | null): string {
  if (!hostname) return 'No site';
  return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
}

export function isYouTubeHost(hostname: string | null | undefined): boolean {
  if (!hostname) return false;
  const host = hostname.toLowerCase();
  return (
    host === 'youtube.com' ||
    host.endsWith('.youtube.com') ||
    host === 'youtube-nocookie.com' ||
    host.endsWith('.youtube-nocookie.com')
  );
}
