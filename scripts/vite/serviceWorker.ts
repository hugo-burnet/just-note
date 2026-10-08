import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';
import { build } from 'esbuild';
import type { Plugin } from 'vite';
import { SHELL_PREFIX } from '../../src/platform/web/cacheNames.ts';

const WORKER = 'sw.js';

function* filesIn(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* filesIn(path);
    else yield path;
  }
}

/**
 * Once Vite has written the app, builds the service worker next to it and tells it
 * which files make up the app and which build this is (the hash of all of them,
 * so a new build never reuses the cache of an old one).
 */
export function serviceWorker(entry: string): Plugin {
  let outDir = '';
  return {
    name: 'just-read:service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const files = [...filesIn(outDir)]
        .map((path) => relative(outDir, path).split(sep).join('/'))
        .filter((file) => file !== WORKER && !file.endsWith('.map'))
        .sort();
      const hash = createHash('sha256');
      for (const file of files) hash.update(file).update(readFileSync(join(outDir, file)));
      await build({
        entryPoints: [entry],
        outfile: join(outDir, WORKER),
        bundle: true,
        format: 'iife',
        target: 'es2022',
        minify: true,
        define: {
          __PRECACHE__: JSON.stringify(files),
          __SHELL__: JSON.stringify(`${SHELL_PREFIX}${hash.digest('hex').slice(0, 10)}`),
        },
      });
    },
  };
}
