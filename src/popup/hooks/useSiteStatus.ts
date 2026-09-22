import { useCallback, useEffect, useState } from 'react';
import { sendMessage } from '../../shared/messaging';
import { reloadTab } from '../../shared/browser-api';
import type { SiteStatus } from '../../shared/types';

export type UseSiteStatus = {
  status: SiteStatus | null;
  loading: boolean;
  error: string | null;
  /** True once a toggle has been applied and the page needs a reload to fully take effect. */
  reloadPending: boolean;
  setSiteEnabled: (enabled: boolean) => Promise<void>;
  reloadPage: () => Promise<void>;
  refresh: () => Promise<void>;
};

export function useSiteStatus(): UseSiteStatus {
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadPending, setReloadPending] = useState(false);

  const refresh = useCallback(async () => {
    const response = await sendMessage({ type: 'GET_CURRENT_SITE_STATUS' });
    if (response.ok) {
      setStatus(response.data);
      setError(null);
    } else {
      setError(response.error);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setSiteEnabled = useCallback(
    async (enabled: boolean) => {
      if (!status?.hostname) return;
      const response = await sendMessage({
        type: 'SET_SITE_ENABLED',
        hostname: status.hostname,
        enabled,
      });
      if (!response.ok) {
        setError(response.error);
        return;
      }
      setStatus({ ...status, siteEnabled: enabled });
      // Network rules apply to requests the page has not made yet, so a reload is offered
      // explicitly rather than performed behind the user's back.
      setReloadPending(response.data.reloadSuggested);
    },
    [status],
  );

  const reloadPage = useCallback(async () => {
    if (status?.tabId === null || status?.tabId === undefined) return;
    await reloadTab(status.tabId);
    setReloadPending(false);
    window.close();
  }, [status]);

  return {
    status,
    loading: status === null && error === null,
    error,
    reloadPending,
    setSiteEnabled,
    reloadPage,
    refresh,
  };
}
