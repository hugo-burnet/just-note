import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CoverShelf } from '../../src/engine/index.ts';
import { MemoryStore } from './helpers.ts';

test('cover shelf: what was found is there at the next start', () => {
  const store = new MemoryStore();
  new CoverShelf(store).set('https://a.test/1', 'https://a.test/1.jpg');
  const later = new CoverShelf(store);
  assert.equal(later.get('https://a.test/1'), 'https://a.test/1.jpg');
  assert.equal(later.get('https://a.test/2'), undefined);
});

test('cover shelf: only the newest few hundred are kept, and one set again counts as new', () => {
  const store = new MemoryStore();
  const shelf = new CoverShelf(store);
  for (let n = 0; n < 450; n++) shelf.set(`https://a.test/${n}`, `https://a.test/${n}.jpg`);
  assert.equal(shelf.get('https://a.test/0'), undefined);
  assert.equal(shelf.get('https://a.test/449'), 'https://a.test/449.jpg');
  assert.equal(Object.keys(JSON.parse(store.get('jr:covers') ?? '{}')).length, 400);

  const again = new CoverShelf(store);
  again.set('https://a.test/50', 'https://a.test/50-new.jpg');
  for (let n = 450; n < 470; n++) again.set(`https://a.test/${n}`, `https://a.test/${n}.jpg`);
  assert.equal(again.get('https://a.test/50'), 'https://a.test/50-new.jpg');
  assert.equal(again.get('https://a.test/51'), undefined);
});

test('cover shelf: a store that holds nonsense, or will not take a write, is no reason to fail', () => {
  const store = new MemoryStore();
  store.set('jr:covers', 'not json');
  const shelf = new CoverShelf(store);
  assert.equal(shelf.get('https://a.test/1'), undefined);
  store.set = () => {
    throw new Error('full');
  };
  shelf.set('https://a.test/1', 'https://a.test/1.jpg');
  assert.equal(shelf.get('https://a.test/1'), 'https://a.test/1.jpg');
});
