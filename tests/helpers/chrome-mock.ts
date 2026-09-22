import { vi } from 'vitest';

type StorageChange = { oldValue?: unknown; newValue?: unknown };
type ChangeListener = (changes: Record<string, StorageChange>, area: string) => void;

export type ChromeMock = ReturnType<typeof createChromeMock>;

/**
 * A small in-memory stand-in for the chrome.* APIs the extension touches. It behaves like
 * the real thing where behaviour matters (async, change events, lastError) and does
 * nothing where it does not.
 */
export function createChromeMock(manifestVersion = '1.0.0') {
  const store = new Map<string, unknown>();
  const changeListeners = new Set<ChangeListener>();
  const grantedPermissions = new Set<string>(['storage', 'activeTab', 'declarativeNetRequest']);

  const local = {
    get: vi.fn(async (key: string | string[] | null) => {
      if (key === null || key === undefined) return Object.fromEntries(store);
      const keys = Array.isArray(key) ? key : [key];
      return Object.fromEntries(keys.map((k) => [k, store.get(k)]));
    }),
    set: vi.fn(async (items: Record<string, unknown>) => {
      const changes: Record<string, StorageChange> = {};
      for (const [key, value] of Object.entries(items)) {
        changes[key] = { oldValue: store.get(key), newValue: value };
        store.set(key, value);
      }
      for (const listener of changeListeners) listener(changes, 'local');
    }),
    remove: vi.fn(async (key: string | string[]) => {
      for (const k of Array.isArray(key) ? key : [key]) store.delete(k);
    }),
    clear: vi.fn(async () => store.clear()),
  };

  const chromeMock = {
    runtime: {
      lastError: undefined as { message: string } | undefined,
      getManifest: vi.fn(() => ({
        version: manifestVersion,
        permissions: ['storage', 'activeTab', 'declarativeNetRequest', 'alarms'],
        optional_permissions: ['declarativeNetRequestFeedback'],
        host_permissions: ['<all_urls>'],
      })),
      sendMessage: vi.fn(async () => ({ ok: true, data: undefined })),
      openOptionsPage: vi.fn(async () => undefined),
      onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
      onInstalled: { addListener: vi.fn() },
      onStartup: { addListener: vi.fn() },
    },
    storage: {
      local,
      onChanged: {
        addListener: vi.fn((listener: ChangeListener) => changeListeners.add(listener)),
        removeListener: vi.fn((listener: ChangeListener) => changeListeners.delete(listener)),
      },
    },
    tabs: {
      query: vi.fn(async () => []),
      get: vi.fn(async () => undefined),
      reload: vi.fn(async () => undefined),
      create: vi.fn(async () => undefined),
      sendMessage: vi.fn(async () => undefined),
      onRemoved: { addListener: vi.fn() },
      onUpdated: { addListener: vi.fn() },
      onActivated: { addListener: vi.fn() },
    },
    action: {
      setBadgeText: vi.fn(async () => undefined),
      setBadgeBackgroundColor: vi.fn(async () => undefined),
    },
    alarms: {
      create: vi.fn(async () => undefined),
      clear: vi.fn(async () => true),
      onAlarm: { addListener: vi.fn() },
    },
    permissions: {
      contains: vi.fn(async ({ permissions }: { permissions: string[] }) =>
        permissions.every((p) => grantedPermissions.has(p)),
      ),
      request: vi.fn(async ({ permissions }: { permissions: string[] }) => {
        permissions.forEach((p) => grantedPermissions.add(p));
        return true;
      }),
      remove: vi.fn(async ({ permissions }: { permissions: string[] }) => {
        permissions.forEach((p) => grantedPermissions.delete(p));
        return true;
      }),
      onAdded: { addListener: vi.fn() },
      onRemoved: { addListener: vi.fn() },
    },
    declarativeNetRequest: {
      getEnabledRulesets: vi.fn(async () => ['ads', 'trackers', 'annoyances']),
      updateEnabledRulesets: vi.fn(async () => undefined),
      getDynamicRules: vi.fn(async () => []),
      updateDynamicRules: vi.fn(async () => undefined),
      getMatchedRules: vi.fn(async () => ({ rulesMatchedInfo: [] })),
    },
    __store: store,
    __grantedPermissions: grantedPermissions,
  };

  return chromeMock;
}

export function installChromeMock(manifestVersion?: string): ChromeMock {
  const mock = createChromeMock(manifestVersion);
  (globalThis as unknown as { chrome: unknown }).chrome = mock;
  return mock;
}
