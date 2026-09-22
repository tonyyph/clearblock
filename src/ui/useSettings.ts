import { useCallback, useEffect, useState } from 'react';
import { sendMessage } from '../shared/messaging';
import { onSettingsChanged } from '../shared/storage';
import type { ExtensionSettings } from '../shared/types';

export type UseSettings = {
  settings: ExtensionSettings | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  update: (patch: Partial<ExtensionSettings>) => Promise<void>;
  reload: () => Promise<void>;
};

/**
 * Settings state for an extension page. Writes go through the service worker so that rule
 * synchronisation happens in one place; reads also subscribe to storage changes so two
 * open pages never drift apart.
 */
export function useSettings(): UseSettings {
  const [settings, setSettings] = useState<ExtensionSettings | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    const response = await sendMessage({ type: 'GET_SETTINGS' });
    if (response.ok) {
      setSettings(response.data);
      setError(null);
    } else {
      setError(response.error);
    }
  }, []);

  useEffect(() => {
    void reload();
    return onSettingsChanged(setSettings);
  }, [reload]);

  const update = useCallback(async (patch: Partial<ExtensionSettings>) => {
    setSaving(true);
    const response = await sendMessage({ type: 'UPDATE_SETTINGS', payload: patch });
    setSaving(false);
    if (response.ok) {
      setSettings(response.data);
      setError(null);
    } else {
      setError(response.error);
    }
  }, []);

  return {
    settings,
    loading: settings === null && error === null,
    saving,
    error,
    update,
    reload,
  };
}
