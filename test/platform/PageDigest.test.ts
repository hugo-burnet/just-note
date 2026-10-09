import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digest } from '../../src/platform/native/PageDigest.ts';

const BODY = [
  '<html><head><title>Made-up reader</title></head><body>',
  '<a href="/series/lantern">Lantern</a> <a href="/series/lantern">again</a> <a href=\'/series/ember\'>Ember</a>',
  '<img src="https://cdn.example.test/cover/lantern.jpg" data-src="https://cdn.example.test/cover/ember.png">',
  '<script>var pages = ["https:\\/\\/img.example.test\\/c1\\/001.webp?t=1","https:\\/\\/img.example.test\\/c1\\/002.webp"];</script>',
  '</body></html>',
].join('\n');

const source = { via: 'phone', status: 200, url: 'https://m.example.test/?po', body: BODY } as const;

test('digest: says how the page was reached, and what it is', () => {
  const report = digest(source);
  assert.match(report, /^Just Read page report\nvia: the phone's own network\n/);
  assert.match(report, /own network answered: 200\naddress: https:\/\/m\.example\.test\/\?po\nsize: \d+ characters\n/);
  assert.match(digest({ ...source, via: 'webview', status: 403 }), /via: a WebView.*\n.*answered: 403/);
});

test('digest: the links and the files are listed once, in order', () => {
  const report = digest(source);
  assert.match(report, /--- links \(2\)\n\/series\/ember\n\/series\/lantern\n--- sources \(2\)\n/);
  assert.match(report, /https:\/\/cdn\.example\.test\/cover\/ember\.png\nhttps:\/\/cdn\.example\.test\/cover\/lantern\.jpg\n/);
});

test('digest: the pictures a script names are found, with their slashes put right', () => {
  const report = digest(source);
  assert.match(report, /--- pictures named \(4\)\n/);
  assert.match(report, /^https:\/\/img\.example\.test\/c1\/001\.webp\?t=1$/m);
  assert.match(report, /^https:\/\/img\.example\.test\/c1\/002\.webp$/m);
});

test('digest: the markup is folded and cut after the lines asked for', () => {
  const long = digest({ ...source, body: `${'a'.repeat(500)}\nsecond\nthird` }, 4);
  const markup = long.split('\n').slice(long.split('\n').findIndex((line) => line.startsWith('--- body')) + 1);
  assert.deepEqual(markup, ['a'.repeat(220), 'a'.repeat(220), 'a'.repeat(60), 'second']);
  assert.match(long, /--- body, first 4 lines \(folded at 220\)/);
});

test('digest: an empty page still gives a report', () => {
  const report = digest({ ...source, body: '' });
  assert.match(report, /size: 0 characters/);
  assert.match(report, /--- links \(0\)\n--- sources \(0\)\n--- pictures named \(0\)\n--- body/);
});
