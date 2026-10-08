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
  const settings = new Settings(store, { proxyBase: 'https://proxy.example' });
  assert.equal(settings.get().proxyBase, 'https://proxy.example');
  settings.set({ proxyBase: '' });
  assert.equal(settings.get().proxyBase, '', 'an empty address is a choice too: same origin');
  assert.equal(new Settings(store, { proxyBase: 'https://proxy.example' }).get().proxyBase, '');
});

test('changes are kept and announced, until someone stops listening', () => {
  const store = new MemoryStore();
  const settings = new Settings(store);
  const heard: SettingsValues[] = [];
  const stop = settings.subscribe((values) => heard.push(values));

  settings.set({ theme: 'dark', rtl: false });
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
  const refusing = { get: () => null, set: () => { throw new Error('quota'); }, remove: () => {} };
  const settings = new Settings(refusing);
  settings.set({ mode: 'paged' });
  assert.equal(settings.get().mode, 'paged');
});
