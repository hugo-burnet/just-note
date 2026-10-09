import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const ENGINE = fileURLToPath(new URL('../../src/engine/', import.meta.url));

// Anything that reaches for the browser, the network or the disk by itself.
const AMBIENT_GLOBALS = /\b(document|window|localStorage|sessionStorage|navigator|indexedDB|DOMParser|XMLHttpRequest|globalThis)\b|\bfetch\(/;
// Anything outside the engine, except the platform-neutral standard library.
const OUTSIDE_IMPORTS = /from\s+['"](?:node:|\.\.\/)+(?:\.\.\/)*(?:ui|platform)\b|from\s+['"]node:/;

function* engineFiles(directory: string): Generator<string> {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) yield* engineFiles(path);
    else if (entry.name.endsWith('.ts')) yield path;
  }
}

const withoutComments = (code: string): string => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/.*$/gm, '$1');

// "Pure engine": it can run in a browser, in Capacitor or in Node unchanged,
// because everything it needs from outside arrives through the ports.
test('the engine uses no browser, network or storage global and imports nothing outside itself', () => {
  const offenders: string[] = [];
  for (const file of engineFiles(ENGINE)) {
    const code = withoutComments(readFileSync(file, 'utf8'));
    if (AMBIENT_GLOBALS.test(code)) offenders.push(`${relative(ENGINE, file)}: ambient global`);
    if (OUTSIDE_IMPORTS.test(code)) offenders.push(`${relative(ENGINE, file)}: outside import`);
  }
  assert.deepEqual(offenders, []);
});

test('the check itself catches what it is meant to catch', () => {
  assert.ok(AMBIENT_GLOBALS.test('const x = document.title;'));
  assert.ok(AMBIENT_GLOBALS.test('await fetch(url)'));
  assert.ok(AMBIENT_GLOBALS.test('localStorage.getItem("a")'));
  assert.ok(!AMBIENT_GLOBALS.test('const fetched = await this.transport.text(url)'));
  assert.ok(OUTSIDE_IMPORTS.test("import { x } from '../ui/dom.ts'"));
  assert.ok(OUTSIDE_IMPORTS.test("import { readFileSync } from 'node:fs'"));
  assert.ok(!OUTSIDE_IMPORTS.test("import { clean } from '../../text.ts'"));
  assert.equal(withoutComments('a // b\nc /* d */ e').replace(/\s+/g, ' ').trim(), 'a c e');
});
