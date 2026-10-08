import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { en } from '../../src/ui/i18n/en.ts';
import { fr } from '../../src/ui/i18n/fr.ts';
import { I18n } from '../../src/ui/i18n/I18n.ts';

// setLanguage() writes the language on the page; a stand-in is all it needs here.
const page = { documentElement: { lang: '' } };
Object.assign(globalThis, { document: page });

let i18n: I18n;
beforeEach(() => {
  i18n = new I18n();
});

const placeholders = (text: string): string[] => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1] ?? '').sort();

test('i18n: auto follows the browser, with English for any language we lack', () => {
  i18n.setLanguage('auto', 'fr-CA');
  assert.equal(i18n.current, 'fr');
  assert.equal(page.documentElement.lang, 'fr');
  i18n.setLanguage('auto', 'de-DE');
  assert.equal(i18n.current, 'en');
  i18n.setLanguage('en', 'fr-FR');
  assert.equal(i18n.current, 'en');
});

test('i18n: values are put into the text', () => {
  i18n.setLanguage('en');
  assert.equal(i18n.t('series.continue', { chapter: 'Ch.002' }), 'Continue · Ch.002');
  i18n.setLanguage('fr');
  assert.match(i18n.t('series.continue', { chapter: 'Ch.002' }), /Ch\.002/);
});

test('i18n: plurals pick one or other, and know the count', () => {
  i18n.setLanguage('en');
  assert.equal(i18n.plural('series.chapters', 1), '1 chapter');
  assert.equal(i18n.plural('series.chapters', 12), '12 chapters');
  assert.equal(i18n.plural('series.chapters', 0), '0 chapters');
});

test('i18n: lookup finds built-up keys, and says so when there is none', () => {
  i18n.setLanguage('en');
  assert.equal(i18n.lookup('error.offline.title'), "You're offline");
  assert.equal(i18n.lookup('error.nothing.title'), undefined);
  assert.equal(i18n.lookup('error.hostNotAllowed.hint', { host: 'cdn.example.com' })?.includes('cdn.example.com'), true);
});

test('i18n: French has every text of English, none empty, with the same values to fill in', () => {
  assert.deepEqual(Object.keys(fr).sort(), Object.keys(en).sort());
  for (const [key, text] of Object.entries(fr)) {
    assert.notEqual(text.trim(), '', key);
    assert.deepEqual(placeholders(text), placeholders(en[key as keyof typeof en]), key);
  }
});
