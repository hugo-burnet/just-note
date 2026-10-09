import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, Settings } from '../../src/engine/index.ts';
import type { SettingsValues } from '../../src/engine/index.ts';
import { MemoryStore } from './helpers.ts';

test('starts from the defaults', () => {
  assert.deepEqual(new Settings(new MemoryStore()).get(), DEFAULT_SETTINGS);
});

test('what the platform says differs from the engine is the default, what the user chose wins', () => {
  const store = new MemoryStore();
  const settings = new Settings(store, { lang: 'fr' });
  assert.equal(settings.get().lang, 'fr');
  settings.set({ lang: 'en' });
  assert.equal(settings.get().lang, 'en');
  assert.equal(new Settings(store, { lang: 'fr' }).get().lang, 'en');
});

test('the proxy address an older version saved is forgotten, and the rest of what it saved stays', () => {
  const store = new MemoryStore();
  store.set('jr:settings', JSON.stringify({ proxyBase: 'https://proxy.example', theme: 'dark' }));
  const reloaded = new Settings(store);
  assert.equal('proxyBase' in reloaded.get(), false);
  assert.equal(reloaded.get().theme, 'dark');
});

test('reading is left to the site until the user chooses', () => {
  const settings = new Settings(new MemoryStore());
  assert.equal(settings.get().mode, 'auto');
  assert.equal(settings.get().direction, 'auto');
  settings.set({ mode: 'paged', direction: 'rtl' });
  assert.equal(settings.get().mode, 'paged');
  assert.equal(settings.get().direction, 'rtl');
  settings.set({ mode: 'auto', direction: 'auto' });
  assert.equal(settings.get().mode, 'auto', 'Auto can be chosen again');
  assert.equal(settings.get().direction, 'auto');
});

test('series follow the language of the app until the user chooses another', () => {
  const store = new MemoryStore();
  const settings = new Settings(store);
  assert.equal(settings.get().seriesLang, 'auto');
  settings.set({ seriesLang: 'fr' });
  assert.equal(new Settings(store).get().seriesLang, 'fr');
  store.set('jr:settings', JSON.stringify({ seriesLang: 'klingon', lang: 'fr' }));
  const reloaded = new Settings(store);
  assert.equal(reloaded.get().seriesLang, 'auto', 'a language that is none of the known ones is forgotten');
  assert.equal(reloaded.get().lang, 'fr');
});

test('the yes or no of an earlier version becomes a direction, and the old key goes', () => {
  for (const [rtl, direction] of [[true, 'rtl'], [false, 'ltr']] as const) {
    const store = new MemoryStore();
    store.set('jr:settings', JSON.stringify({ rtl, mode: 'scroll', theme: 'light' }));
    const settings = new Settings(store);
    assert.equal(settings.get().direction, direction, `rtl: ${rtl}`);
    assert.equal(settings.get().mode, 'scroll', 'the rest of what was saved stays');
    assert.equal(settings.get().theme, 'light');
    assert.ok(!('rtl' in settings.get()), 'rtl is no setting any more');

    settings.set({ lang: 'fr' });
    const stored = JSON.parse(String(store.get('jr:settings'))) as Record<string, unknown>;
    assert.ok(!('rtl' in stored), 'and it is not written back');
    assert.equal(stored.direction, direction, 'what the old key said is kept, as a direction');
    assert.equal(new Settings(store).get().direction, direction);
  }
  const both = new MemoryStore();
  both.set('jr:settings', JSON.stringify({ rtl: true, direction: 'ltr' }));
  assert.equal(new Settings(both).get().direction, 'ltr', 'a direction already chosen wins over the old key');
});

test('a reading choice that is not one is forgotten, and the site decides again', () => {
  const store = new MemoryStore();
  store.set('jr:settings', JSON.stringify({ mode: 'sideways', direction: 'up', theme: 'dark' }));
  const settings = new Settings(store);
  assert.equal(settings.get().mode, 'auto');
  assert.equal(settings.get().direction, 'auto');
  assert.equal(settings.get().theme, 'dark');
});

test('changes are kept and announced, until someone stops listening', () => {
  const store = new MemoryStore();
  const settings = new Settings(store);
  const heard: SettingsValues[] = [];
  const stop = settings.subscribe((values) => heard.push(values));

  settings.set({ theme: 'dark', direction: 'ltr' });
  assert.equal(heard.length, 1);
  assert.equal(heard[0]?.theme, 'dark');
  assert.equal(new Settings(store).get().theme, 'dark');
  assert.equal(new Settings(store).get().mode, DEFAULT_SETTINGS.mode, 'untouched settings keep their default');

  stop();
  settings.set({ lang: 'fr' });
  assert.equal(heard.length, 1);
});

test('damaged storage falls back to the defaults', () => {
  const store = new MemoryStore();
  store.set('jr:settings', 'oops');
  assert.deepEqual(new Settings(store).get(), DEFAULT_SETTINGS);
});

test('a storage that refuses writes still lets the session change settings', () => {
  const refusing = { get: () => null, set: () => { throw new Error('quota'); }, remove: () => {}, keys: () => [] };
  const settings = new Settings(refusing);
  settings.set({ mode: 'paged' });
  assert.equal(settings.get().mode, 'paged');
});
