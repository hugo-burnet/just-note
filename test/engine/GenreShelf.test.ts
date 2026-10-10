import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GenreShelf } from '../../src/engine/index.ts';
import { MemoryStore } from './helpers.ts';

const A = 'https://x.test/a';
const B = 'https://x.test/b';

test('the genres found for a series are kept from one start to the next', () => {
  const store = new MemoryStore();
  new GenreShelf(store).set(A, ['Action', 'Fantasy']);
  assert.deepEqual(new GenreShelf(store).get(A), ['Action', 'Fantasy']);
  assert.equal(new GenreShelf(store).get(B), undefined);
});

test('a page that said no genre is remembered for this start only: next time it is read again', () => {
  const store = new MemoryStore();
  const shelf = new GenreShelf(store);
  shelf.set(A, []);
  assert.deepEqual(shelf.get(A), [], 'it is an answer, and is not asked for again meanwhile');
  assert.equal(new GenreShelf(store).get(A), undefined, 'but is not kept');
  assert.equal(store.get('jr:genres'), null, 'and nothing was written for it');
});

test('a series that has genres now is no longer one that has none, and the other way round', () => {
  const store = new MemoryStore();
  const shelf = new GenreShelf(store);
  shelf.set(A, []);
  shelf.set(A, ['Drama']);
  assert.deepEqual(new GenreShelf(store).get(A), ['Drama']);
  shelf.set(A, []);
  assert.deepEqual(shelf.get(A), []);
  assert.equal(new GenreShelf(store).get(A), undefined, 'what was kept is let go');
});

test('series an earlier version kept with no genre are read again, and what is not a list of genres is ignored', () => {
  const store = new MemoryStore();
  store.set('jr:genres', JSON.stringify({ [A]: [], [B]: ['Drama'], 'https://x.test/c': 'Drama' }));
  const shelf = new GenreShelf(store);
  assert.equal(shelf.get(A), undefined);
  assert.deepEqual(shelf.get(B), ['Drama']);
  assert.equal(shelf.get('https://x.test/c'), undefined);
  store.set('jr:genres', 'not json');
  assert.equal(new GenreShelf(store).get(B), undefined);
});

test('a few hundred series are kept, the oldest forgotten first', () => {
  const shelf = new GenreShelf(new MemoryStore());
  for (let n = 0; n < 650; n++) shelf.set(`https://x.test/${n}`, ['Action']);
  assert.equal(shelf.get('https://x.test/0'), undefined);
  assert.equal(shelf.get('https://x.test/49'), undefined);
  assert.deepEqual(shelf.get('https://x.test/50'), ['Action']);
  assert.deepEqual(shelf.get('https://x.test/649'), ['Action']);
});
