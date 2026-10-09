import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Library } from '../../src/engine/index.ts';
import { MemoryStore } from './helpers.ts';

const series = (n: number) => ({ url: `https://site.test/s${n}/`, title: `Series ${n}`, cover: `https://site.test/s${n}.jpg` });

function library(start = 1000) {
  const store = new MemoryStore();
  let clock = start;
  const make = () => new Library(store, () => clock);
  return { store, make, tick: (ms = 1) => (clock += ms) };
}

test('series are listed by how recently they were read', () => {
  const { make, tick } = library();
  const lib = make();
  lib.save(series(1));
  tick();
  lib.save(series(2));
  assert.deepEqual(lib.list().map((e) => e.title), ['Series 2', 'Series 1']);

  tick();
  lib.setPosition(series(1).url, { chapter: 'c', key: 'c001', title: 'Ch.1', page: 3 });
  assert.deepEqual(lib.list().map((e) => e.title), ['Series 1', 'Series 2']);
});

test('saving again refreshes the details but keeps the place and the date added', () => {
  const { make, tick } = library();
  const lib = make();
  lib.save(series(1));
  lib.setPosition(series(1).url, { chapter: 'c', key: 'c002', title: 'Ch.2', page: 5 });
  tick(50);
  lib.save({ ...series(1), title: 'Renamed', cover: null });
  const entry = lib.get(series(1).url);
  assert.equal(entry?.title, 'Renamed');
  assert.equal(entry?.cover, null);
  assert.equal(entry?.addedAt, 1000);
  assert.deepEqual(lib.position(series(1).url), { chapter: 'c', key: 'c002', title: 'Ch.2', page: 5 });
});

test('the number of chapters is kept, and survives a save that does not know it', () => {
  const lib = library().make();
  lib.save({ ...series(1), chapters: [1, 2, 3] });
  assert.equal(lib.get(series(1).url)?.chapterCount, 3);
  lib.save(series(1));
  assert.equal(lib.get(series(1).url)?.chapterCount, 3);
  lib.save({ ...series(1), chapters: [1, 2, 3, 4] });
  assert.equal(lib.get(series(1).url)?.chapterCount, 4);
});

test('a position is ignored for a series that is not in the library', () => {
  const lib = library().make();
  lib.setPosition('https://site.test/unknown/', { chapter: 'c', key: 'c1', title: 't', page: 0 });
  assert.equal(lib.get('https://site.test/unknown/'), null);
  assert.equal(lib.position('https://site.test/unknown/'), null);
});

test('finished chapters are remembered once, per series', () => {
  const lib = library().make();
  lib.save(series(1));
  lib.markRead(series(1).url, 'c001');
  lib.markRead(series(1).url, 'c001');
  lib.markRead(series(1).url, 'c002');
  assert.equal(lib.isRead(series(1).url, 'c001'), true);
  assert.equal(lib.isRead(series(1).url, 'c003'), false);
  assert.equal(lib.isRead(series(2).url, 'c001'), false);
  assert.equal(lib.readCount(series(1).url), 2);
});

test('removing a series forgets its chapters too, clearing forgets everything', () => {
  const lib = library().make();
  lib.save(series(1));
  lib.save(series(2));
  lib.markRead(series(1).url, 'c001');
  lib.remove(series(1).url);
  assert.equal(lib.get(series(1).url), null);
  assert.equal(lib.readCount(series(1).url), 0);
  assert.equal(lib.list().length, 1);
  lib.clear();
  assert.deepEqual(lib.list(), []);
});

test('everything survives a restart', () => {
  const { make } = library();
  const first = make();
  first.save(series(1));
  first.setPosition(series(1).url, { chapter: 'c', key: 'c004', title: 'Ch.4', page: 7 });
  first.markRead(series(1).url, 'c003');

  const second = make();
  assert.equal(second.get(series(1).url)?.position?.page, 7);
  assert.equal(second.isRead(series(1).url, 'c003'), true);
});

test('damaged or unwritable storage does not break the library', () => {
  const store = new MemoryStore();
  store.set('jr:library', '{not json');
  store.set('jr:read', '"a string"');
  const lib = new Library(store);
  assert.deepEqual(lib.list(), []);

  const full = { get: () => null, set: () => { throw new Error('quota'); }, remove: () => {}, keys: () => [] };
  const inMemory = new Library(full);
  inMemory.save(series(1));
  assert.equal(inMemory.list().length, 1);
});
