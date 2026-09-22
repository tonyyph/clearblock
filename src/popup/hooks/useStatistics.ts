import { useCallback, useEffect, useState } from 'react';
import { sendMessage, sendToTab } from '../../shared/messaging';
import type { ContentState, StatisticsSnapshot } from '../../shared/types';

export type UseStatistics = {
  stats: StatisticsSnapshot | null;
  contentState: ContentState | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

/**
 * Pulls counters for the active tab.
 *
 * Opening the popup is a user gesture, which is what lets the service worker read matched
 * DNR rules for the active tab without the optional feedback permission. See
 * background/statistics-manager.ts for why the default mode is a sample, not a total.
 */
export function useStatistics(tabId: number | null): UseStatistics {
  const [stats, setStats] = useState<StatisticsSnapshot | null>(null);
  const [contentState, setContentState] = useState<ContentState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const response = await sendMessage(
      tabId === null ? { type: 'GET_STATISTICS' } : { type: 'GET_STATISTICS', tabId },
    );
    if (response.ok) {
      setStats(response.data);
      setError(null);
    } else {
      setError(response.error);
    }

    if (tabId !== null) {
      const content = await sendToTab(tabId, { type: 'GET_CONTENT_STATE' });
      // A missing content script is normal (system page, or the tab has not loaded yet).
      setContentState(content.ok && content.data !== 'pong' ? content.data : null);
    }
  }, [tabId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return {
    stats,
    contentState,
    loading: stats === null && error === null,
    error,
    refresh,
  };
}
