import { defineConfig } from 'vite';

// A relative base lets the same build run from any path: GitHub Pages serves a
// project site under /<repository>/, Capacitor serves it from its own origin.
export default defineConfig({
  base: './',
  build: { target: 'es2022', outDir: 'dist', emptyOutDir: true },
});
