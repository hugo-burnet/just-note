import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CHECK_EVERY_MS, inBackground, Library, UpdateChecker } from '../../src/engine/index.ts';
import type { Series, TextRequest } from '../../src/engine/index.ts';
import { FakeTransport, MemoryStore } from './helpers.ts';

const URL_A = 'https://site.test/a/';
const URL_B = 'https://site.test/b/';
const chapters = (count: number) => Array.from({ length: count }, (_, n) => ({ url: `c${n + 1}`, key: `c${n + 1}`, number: n + 1, title: `Ch.${n + 1}`, date: '' }));
const series = (url: string, count: number): Series => ({ url, title: url, cover: null, author: '', status: '', genres: [], description: '', chapters: chapters(count) });

function setup() {
  let clock = 1_000_000;
  const library = new Library(new MemoryStore(), () => clock);
  return { library, later: (ms: number) => (clock += ms), now: () => clock };
}

test('library: a series met for the first time has nothing new; chapters that came out since it was opened are new', () => {
  const { library } = setup();
  library.save(series(URL_A, 10));
  assert.equal(library.newChapters(URL_A), 0);
  library.save(series(URL_A, 13));
  assert.equal(library.newChapters(URL_A), 3);
  library.markSeen(URL_A);
  assert.equal(library.newChapters(URL_A), 0);
  // A site that takes chapters down has nothing new to say.
  library.save(series(URL_A, 11));
  assert.equal(library.newChapters(URL_A), 0);
  assert.equal(library.newChapters('https://site.test/unknown/'), 0);
});

test('library: a series saved before new chapters were counted compares with what it had then', () => {
  const store = new MemoryStore();
  store.set(`jr:entry:${URL_A}`, JSON.stringify({ url: URL_A, title: 'A', cover: null, chapterCount: 5, addedAt: 1, updatedAt: 1, generation: 'initial' }));
  const library = new Library(store);
  assert.equal(library.newChapters(URL_A), 0);
  library.save(series(URL_A, 7));
  assert.equal(library.newChapters(URL_A), 2);
});

test('library: what was seen goes with a backup', () => {
  const { library } = setup();
  library.save(series(URL_A, 4));
  library.save(series(URL_A, 6));
  const other = setup().library;
  other.importBackup(library.exportBackup());
  assert.equal(other.newChapters(URL_A), 2);
});

test('updates: the series not checked for a while are read again, and the ones with new chapters are told', async () => {
  const { library, later } = setup();
  library.save(series(URL_A, 3));
  library.save(series(URL_B, 2));
  const counts: Record<string, number> = { [URL_A]: 5, [URL_B]: 2 };
  const asked: string[] = [];
  const checker = new UpdateChecker(library, async (url) => {
    asked.push(url);
    return series(url, counts[url] ?? 0);
  }, () => later(0));

  // Both were just read: nothing is due.
  assert.equal(await checker.run(), 0);
  later(CHECK_EVERY_MS);
  const changed: string[] = [];
  assert.equal(await checker.run((url) => changed.push(url)), 2);
  assert.deepEqual(changed, [URL_A]);
  assert.equal(library.newChapters(URL_A), 2);
  assert.equal(library.newChapters(URL_B), 0);
  // Read again a moment later: not due yet.
  assert.equal(await checker.run(), 0);
  assert.equal(asked.length, 2);
});

test('updates: a site that cannot be read is tried next time, a series removed meanwhile does not come back, and runs do not overlap', async () => {
  const { library, later } = setup();
  library.save(series(URL_A, 3));
  library.save(series(URL_B, 3));
  later(CHECK_EVERY_MS);
  let calls = 0;
  const checker = new UpdateChecker(library, async (url) => {
    calls++;
    if (url === URL_A) throw new Error('offline');
    library.remove(URL_B);
    return series(url, 9);
  }, () => later(0));
  const [first, second] = await Promise.all([checker.run(), checker.run()]);
  assert.equal(first, 0);
  assert.equal(second, 0);
  assert.equal(calls, 2, 'one run for both asks');
  assert.equal(library.get(URL_B), null);
  assert.equal(await checker.run(), 0);
  assert.equal(calls, 3, 'the one that failed is asked again');
});

test('inBackground: every request says nobody is waiting, and the rest of the transport is the same', async () => {
  const transport = new FakeTransport({ '*': 'page' });
  const quiet = inBackground(transport);
  await quiet.text('https://site.test/x', { referer: 'https://site.test/' });
  assert.deepEqual(transport.asked.map((one) => one.request), [{ referer: 'https://site.test/', background: true } satisfies TextRequest]);
  assert.equal(await quiet.imageSource('https://site.test/p.jpg'), 'https://site.test/p.jpg');
  assert.equal(quiet.render, undefined);
});
