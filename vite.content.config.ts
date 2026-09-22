import { resolve } from 'node:path';
import { defineConfig } from 'vite';

/**
 * Build pass 2 — content scripts.
 *
 * MV3 content scripts run as classic scripts in the page's isolated world, so the
 * bundle must be a single self-contained IIFE with no import statements and no
 * code splitting. `emptyOutDir: false` keeps the output of build pass 1.
 */
export default defineConfig({
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  define: {
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    target: 'chrome120',
    sourcemap: false,
    minify: 'oxc',
    lib: {
      entry: resolve(import.meta.dirname, 'src/content/index.ts'),
      name: 'ClearBlockContent',
      formats: ['iife'],
      fileName: () => 'content.js',
    },
    rollupOptions: {
      output: { extend: true, inlineDynamicImports: true },
    },
  },
});
