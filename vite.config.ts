import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { securityPolicy } from './scripts/vite/securityPolicy.ts';

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string };

// The app's files, which Capacitor puts in the APK and serves from its own origin.
export default defineConfig({
  base: './',
  plugins: [securityPolicy()],
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
