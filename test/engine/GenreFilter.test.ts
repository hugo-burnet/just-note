import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GenreFilter, genreKey, Library, UpdateChecker } from '../../src/engine/index.ts';
import type { LibraryEntry, Series } from '../../src/engine/index.ts';
import { MemoryStore } from './helpers.ts';

const entry = (title: string, genres?: string[]): LibraryEntry => ({ url: `https://site.test/${title}/`, title, cover: null, addedAt: 0, updatedAt: 0, ...(genres ? { genres } : {}) });
const shelf = [entry('a', ['Action', 'Fantasy']), entry('b', ['action', 'Romance']), entry('c', ['Sci-Fi']), entry('d')];
const shown = (filter: GenreFilter): string[] => shelf.filter((one) => filter.matches(one)).map((one) => one.title);

test('genres: two spellings of one genre are one genre', () => {
  assert.equal(genreKey('Sci-Fi'), genreKey('sci fi'));
  assert.equal(genreKey('Comédie'), genreKey('comedie'));
  assert.notEqual(genreKey('Action'), genreKey('Adventure'));
});

test('genres: the shelf lists its genres, the commonest first, under the spelling most use', () => {
  const filter = new GenreFilter(new MemoryStore());
  assert.deepEqual(filter.genres(shelf).map((genre) => [genre.name, genre.count]), [['Action', 2], ['Fantasy', 1], ['Romance', 1], ['Sci-Fi', 1]]);
});

test('genres: a tap keeps a genre, a second leaves it out, a third lets it go', () => {
  const filter = new GenreFilter(new MemoryStore());
  assert.deepEqual(shown(filter), ['a', 'b', 'c', 'd']);
  assert.equal(filter.cycle('ACTION'), 'include');
  assert.deepEqual(shown(filter), ['a', 'b']);
  assert.equal(filter.cycle('action'), 'exclude');
  // A series whose genres are not known yet is not hidden by a genre left out.
  assert.deepEqual(shown(filter), ['c', 'd']);
  assert.equal(filter.cycle('Action'), 'none');
  assert.equal(filter.active, false);
});

test('genres: kept genres must all be there, and none of those left out', () => {
  const filter = new GenreFilter(new MemoryStore());
  filter.set('Action', 'include');
  filter.set('Fantasy', 'include');
  assert.deepEqual(shown(filter), ['a']);
  filter.set('Fantasy', 'none');
  filter.set('Romance', 'exclude');
  assert.deepEqual(shown(filter), ['a']);
  assert.deepEqual(filter.genres(shelf).map((genre) => [genre.name, genre.choice]).slice(0, 3), [['Action', 'include'], ['Fantasy', 'none'], ['Romance', 'exclude']]);
});

test('genres: the choice is remembered, and a genre chosen stays listed when no series has it any more', () => {
  const store = new MemoryStore();
  new GenreFilter(store).set('Horror', 'exclude');
  const again = new GenreFilter(store);
  assert.equal(again.choice('horror'), 'exclude');
  assert.ok(again.genres(shelf).some((genre) => genre.key === 'horror' && genre.count === 0));
  again.clear();
  assert.equal(new GenreFilter(store).active, false);
});

test('library: a series keeps its genres, through a backup too, and one without them is read again at once', async () => {
  const library = new Library(new MemoryStore(), () => 1000);
  const series: Series = { url: 'https://site.test/s/', title: 'S', cover: null, author: '', status: '', genres: ['Action'], description: '', chapters: [] };
  library.save({ url: 'https://site.test/old/', title: 'Old', cover: null });
  library.save(series);
  assert.deepEqual(library.get(series.url)?.genres, ['Action']);
  // A summary (a listing) says nothing of genres: what was known stays.
  library.save({ url: series.url, title: 'S', cover: null });
  assert.deepEqual(library.get(series.url)?.genres, ['Action']);
  const restored = new Library(new MemoryStore());
  restored.importBackup(library.exportBackup());
  assert.deepEqual(restored.get(series.url)?.genres, ['Action']);

  const asked: string[] = [];
  const checker = new UpdateChecker(library, async (url) => {
    asked.push(url);
    return { ...series, url, genres: ['Drama'] };
  }, () => 1000);
  await checker.run();
  assert.deepEqual(asked, ['https://site.test/old/']);
  assert.deepEqual(library.get('https://site.test/old/')?.genres, ['Drama']);
});
