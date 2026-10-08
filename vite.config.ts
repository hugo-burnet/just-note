import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { devProxy } from './scripts/vite/devProxy.ts';
import { securityPolicy } from './scripts/vite/securityPolicy.ts';
import { serviceWorker } from './scripts/vite/serviceWorker.ts';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// A relative base lets the same build run from any path: GitHub Pages serves a
// project site under /<repository>/, Capacitor serves it from its own origin.
export default defineConfig({
  base: './',
  plugins: [devProxy(), securityPolicy(), serviceWorker('src/sw/main.ts')],
  define: { __APP_VERSION__: JSON.stringify(process.env.APP_VERSION ?? version) },
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    // Fonts and images stay files: no data: URI in a stylesheet, which keeps the
    // security policy of the page short.
    assetsInlineLimit: 0,
    modulePreload: { polyfill: false },
  },
});
