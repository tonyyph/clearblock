import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * Build pass 3 — the MAIN-world YouTube pruner.
 *
 * It needs its own bundle for the same reason the content script does (a classic script,
 * no imports) and additionally must contain nothing that touches chrome.*, because it runs
 * with the page's own globals rather than in the extension's isolated world.
 */
export default defineConfig({
  resolve: { alias: { '@': resolve(import.meta.dirname, 'src') } },
  define: { __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production') },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome120',
    sourcemap: false,
    minify: 'oxc',
    lib: {
      entry: resolve(import.meta.dirname, 'src/content/youtube/ad-pruner.ts'),
      name: 'ClearBlockYouTubePruner',
      formats: ['iife'],
      fileName: () => 'youtube-pruner.js',
    },
    rollupOptions: { output: { extend: true, inlineDynamicImports: true } },
  },
});
