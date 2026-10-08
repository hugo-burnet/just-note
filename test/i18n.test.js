import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { dictionaries, setLanguage, t, tn } from '../public/js/i18n.js';
import { describeError } from '../public/js/ui.js';

const JS_DIR = new URL('../public/js/', import.meta.url);

async function sources(dir = JS_DIR, prefix = '') {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) found.push(...(await sources(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`)));
    else if (entry.name.endsWith('.js')) found.push({ name: prefix + entry.name, text: await readFile(new URL(entry.name, dir), 'utf8') });
  }
  return found;
}

test('both languages define exactly the same keys', () => {
  const en = Object.keys(dictionaries.en).sort();
  const fr = Object.keys(dictionaries.fr).sort();
  assert.deepEqual(fr, en);
});

test('every key used in the code exists', async () => {
  const known = new Set(Object.keys(dictionaries.en));
  const missing = [];
  for (const { name, text } of await sources()) {
    for (const [, key] of text.matchAll(/\bt\(\s*'([\w.]+)'/g)) if (!known.has(key)) missing.push(`${name}: ${key}`);
    for (const [, key] of text.matchAll(/\btn\(\s*'([\w.]+)'/g)) {
      for (const form of ['one', 'other']) if (!known.has(`${key}.${form}`)) missing.push(`${name}: ${key}.${form}`);
    }
  }
  assert.deepEqual(missing, []);
});

test('placeholders match between languages', () => {
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const key of Object.keys(dictionaries.en)) {
    assert.deepEqual(placeholders(dictionaries.fr[key]), placeholders(dictionaries.en[key]), key);
  }
});

test('t() fills placeholders, tn() picks the plural form, unknown keys show themselves', () => {
  setLanguage('en');
  assert.equal(t('home.confirmRemove', { title: 'X' }), 'Remove “X” and its reading progress?');
  assert.equal(tn('series.chapters', 1), '1 chapter');
  assert.equal(tn('series.chapters', 12), '12 chapters');
  assert.equal(t('no.such.key'), 'no.such.key');
  setLanguage('fr');
  assert.equal(tn('series.chapters', 2), '2 chapitres');
  setLanguage('auto');
});

test('every error the app can meet has a readable message in both languages', () => {
  const errors = [
    ...['offline', 'network', 'no_proxy', 'host_not_allowed', 'timeout', 'blocked', 'no_chapters', 'no_pages', 'upstream_unreachable', 'too_many_redirects', 'internal', 'whatever'].map((code) => ({ code, host: 'cdn.example.com' })),
    ...[403, 404, 503, 500].map((upstreamStatus) => ({ code: 'upstream_status', upstreamStatus })),
    new Error('plain error'),
  ];
  for (const language of ['en', 'fr']) {
    setLanguage(language);
    for (const err of errors) {
      const { title, hint } = describeError(err);
      assert.ok(title && hint, `${language} ${err.code}`);
      assert.doesNotMatch(`${title} ${hint}`, /\berror\.\w+|\{\w+\}/, `${language} ${err.code}`);
    }
  }
  setLanguage('en');
  assert.match(describeError({ code: 'host_not_allowed', host: 'cdn.example.com' }).hint, /cdn\.example\.com/);
  assert.match(describeError({ code: 'upstream_status', upstreamStatus: 418 }).title, /418/);
  setLanguage('auto');
});
