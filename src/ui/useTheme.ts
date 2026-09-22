import { useEffect } from 'react';
import type { ThemePreference } from '../shared/types';

/**
 * Applies the theme preference to <html data-theme>. "system" follows the OS setting and
 * keeps following it while the page stays open.
 */
export function useTheme(preference: ThemePreference): void {
  useEffect(() => {
    const root = document.documentElement;

    if (preference !== 'system') {
      root.dataset.theme = preference;
      return;
    }

    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = (): void => {
      root.dataset.theme = query.matches ? 'dark' : 'light';
    };
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, [preference]);
}
