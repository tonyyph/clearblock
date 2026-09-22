import { beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, STORAGE_KEYS, STORAGE_SCHEMA_VERSION } from '../src/shared/constants';
import {
  isSafeSelector,
  migrateSettings,
  patchSettings,
  readSettings,
  sanitizeSelectors,
  trimTabCounters,
  validateSettings,
  validateStatistics,
  writeSettings,
} from '../src/shared/storage';

describe('validateSettings', () => {
  it('returns the defaults for empty or junk input', () => {
    expect(validateSettings(undefined)).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
    expect(validateSettings(42)).toEqual(DEFAULT_SETTINGS);
  });

  it('repairs individual fields instead of throwing', () => {
    const result = validateSettings({
      enabled: 'yes',
      theme: 'neon',
      allowlistedDomains: ['WWW.Example.com', 'bad host', 7],
      customCosmeticSelectors: ['.promo', 'body { color: red }', '@import url(x)'],
      cosmeticFilteringEnabled: false,
    });

    expect(result.enabled).toBe(true); // non-boolean falls back to the default
    expect(result.theme).toBe('system'); // unknown theme falls back
    expect(result.allowlistedDomains).toEqual(['example.com']);
    expect(result.customCosmeticSelectors).toEqual(['.promo']);
    expect(result.cosmeticFilteringEnabled).toBe(false); // a valid value is preserved
  });

  it('keeps a fully valid object intact', () => {
    const settings = { ...DEFAULT_SETTINGS, theme: 'dark' as const, enabled: false };
    expect(validateSettings(settings)).toEqual(settings);
  });
});

describe('migrateSettings', () => {
  it('stamps the current schema version onto legacy records', () => {
    const migrated = migrateSettings({ enabled: false, allowlistedDomains: ['a.com'] });
    expect(migrated.schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
    expect(migrated.enabled).toBe(false);
    expect(migrated.allowlistedDomains).toEqual(['a.com']);
    // Fields the old record did not have are filled from the defaults.
    expect(migrated.youtubeProtectionEnabled).toBe(DEFAULT_SETTINGS.youtubeProtectionEnabled);
  });

  it('reads a record written by a newer version conservatively', () => {
    const migrated = migrateSettings({
      schemaVersion: STORAGE_SCHEMA_VERSION + 5,
      enabled: false,
      somethingFromTheFuture: true,
    });
    expect(migrated.schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
    expect(migrated.enabled).toBe(false);
    expect('somethingFromTheFuture' in migrated).toBe(false);
  });
});

describe('isSafeSelector / sanitizeSelectors', () => {
  it.each(['.promo', '#ad-rail', '[data-ad-slot]', 'div.sponsored > span'])(
    'accepts %s',
    (selector) => {
      expect(isSafeSelector(selector)).toBe(true);
    },
  );

  it.each([
    '',
    '   ',
    'body { display: none }',
    '@import url(https://evil.example)',
    '.a /* comment */',
    '<script>',
    'div;',
    '>>>not a selector',
    42,
    null,
  ])('rejects %s', (selector) => {
    expect(isSafeSelector(selector)).toBe(false);
  });

  it('caps the selector length', () => {
    expect(isSafeSelector(`.${'a'.repeat(400)}`)).toBe(false);
  });

  it('de-duplicates and drops invalid entries', () => {
    expect(sanitizeSelectors(['.a', '.a', 'bad{', '.b'])).toEqual(['.a', '.b']);
    expect(sanitizeSelectors('not an array')).toEqual([]);
  });
});

describe('trimTabCounters', () => {
  it('drops non-positive and malformed counters', () => {
    expect(trimTabCounters({ 1: 5, 2: 0, 3: -4, 4: Number.NaN } as Record<number, number>)).toEqual(
      {
        1: 5,
      },
    );
  });

  it('keeps only live tabs when a live set is supplied', () => {
    expect(trimTabCounters({ 1: 5, 2: 9 }, new Set([2]))).toEqual({ 2: 9 });
  });

  it('caps the number of retained tabs, keeping the busiest', () => {
    const many: Record<number, number> = {};
    for (let i = 0; i < 500; i += 1) many[i] = i + 1;
    const trimmed = trimTabCounters(many);
    expect(Object.keys(trimmed)).toHaveLength(200);
    expect(trimmed[499]).toBe(500);
    expect(trimmed[0]).toBeUndefined();
  });
});

describe('validateStatistics', () => {
  it('repairs junk into a usable record', () => {
    const stats = validateStatistics({ totalBlocked: -3, blockedByTab: 'nope', boundaryKeys: 5 });
    expect(stats).toEqual({
      schemaVersion: STORAGE_SCHEMA_VERSION,
      totalBlocked: 0,
      blockedByTab: {},
      lastResetAt: 0,
      lastRecordTimestamp: 0,
      boundaryKeys: [],
    });
  });
});

describe('settings round-trip through chrome.storage', () => {
  beforeEach(async () => {
    await chrome.storage.local.clear();
  });

  it('persists and reloads settings', async () => {
    await writeSettings({ ...DEFAULT_SETTINGS, enabled: false, allowlistedDomains: ['x.com'] });
    const reloaded = await readSettings();
    expect(reloaded.enabled).toBe(false);
    expect(reloaded.allowlistedDomains).toEqual(['x.com']);
  });

  it('writes the schema version alongside the data', async () => {
    await writeSettings(DEFAULT_SETTINGS);
    const raw = (await chrome.storage.local.get(STORAGE_KEYS.settings))[STORAGE_KEYS.settings];
    expect((raw as { schemaVersion: number }).schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
  });

  it('merges a patch over the stored value', async () => {
    await writeSettings({ ...DEFAULT_SETTINGS, allowlistedDomains: ['keep.me'] });
    const patched = await patchSettings({ theme: 'dark' });
    expect(patched.theme).toBe('dark');
    expect(patched.allowlistedDomains).toEqual(['keep.me']);
  });

  it('survives a corrupted record', async () => {
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: '{{ not json }}' });
    await expect(readSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });
});
