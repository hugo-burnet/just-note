import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const MAX_LINES = 300;
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'test-output', '.git', '.wrangler']);
// Written by npm, cannot be split.
const SKIPPED_FILES = new Set(['package-lock.json']);
const CHECKED_EXTENSIONS = new Set(['.ts', '.js', '.mjs', '.css', '.html', '.md', '.json', '.yml', '.toml', '.svg', '.webmanifest']);

function* sourceFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) yield* sourceFiles(path);
    } else if (!SKIPPED_FILES.has(entry.name) && CHECKED_EXTENSIONS.has(extname(entry.name))) {
      yield path;
    }
  }
}

test(`no hand-written file is longer than ${MAX_LINES} lines`, () => {
  const tooLong: string[] = [];
  for (const file of sourceFiles(ROOT)) {
    const lines = readFileSync(file, 'utf8').trimEnd().split('\n').length;
    if (lines > MAX_LINES) tooLong.push(`${relative(ROOT, file)} (${lines} lines)`);
  }
  assert.deepEqual(tooLong, []);
});
