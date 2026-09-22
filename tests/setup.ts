import '@testing-library/jest-dom/vitest';
import { beforeEach } from 'vitest';
import { installChromeMock } from './helpers/chrome-mock';

// jsdom does not implement matchMedia, which the theme hook relies on.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

// Every test file starts with a clean, isolated chrome.* surface.
beforeEach(() => {
  installChromeMock();
});
