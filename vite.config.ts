import { resolve } from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Build pass 1 — everything that may be an ES module:
 *   - popup.html / options.html (React UIs)
 *   - the background service worker (declared as `"type": "module"` in the manifest)
 *
 * Content scripts are NOT built here: MV3 content scripts are classic scripts and
 * cannot use ESM imports, so they get their own IIFE build (vite.content.config.ts).
 */
export default defineConfig({
  root: resolve(import.meta.dirname, '.'),
  publicDir: resolve(import.meta.dirname, 'public'),
  plugins: [react()],
  resolve: {
    alias: { '@': resolve(import.meta.dirname, 'src') },
  },
  define: {
    // Content/background code branches on this to silence debug logging in release builds.
    __DEV__: JSON.stringify(process.env.NODE_ENV !== 'production'),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'chrome120',
    sourcemap: false,
    minify: 'oxc',
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, 'popup.html'),
        options: resolve(import.meta.dirname, 'options.html'),
        'service-worker': resolve(import.meta.dirname, 'src/background/service-worker.ts'),
      },
      output: {
        format: 'es',
        entryFileNames: (chunk) =>
          chunk.name === 'service-worker' ? 'service-worker.js' : 'assets/[name]-[hash].js',
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
