import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Catalog, GenreShelf, Library, Source, SourceError, SourceRegistry } from '../../src/engine/index.ts';
import type { ChapterPages, Series, SeriesSummary, SourceTarget } from '../../src/engine/index.ts';
import type { Glance } from '../../src/engine/source/Source.ts';
import { makeIO, MemoryStore } from './helpers.ts';

/** A site whose series pages are glanced at (the test answers for them) and whose whole series is always refused. */
class GlancedSource extends Source {
  readonly id = 'glanced';
  readonly name = 'Glanced';
  readonly languages = ['en'];
  readonly reading = { mode: 'scroll', rtl: false } as const;
  override readonly betterCovers: boolean;
  /** Each page that was glanced at, in the order they were. */
  readonly pages: string[] = [];
  answer: (url: string) => Promise<Glance> = async () => ({ cover: null, genres: ['Seinen'] });

  constructor(betterCovers: boolean) {
    super(makeIO({}).io);
    this.betterCovers = betterCovers;
  }

  resolve(input: string): SourceTarget | null {
    return input.startsWith('https://glanced.test/') ? { kind: 'series', url: input } : null;
  }

  protected homeIn(): string {
    return 'https://glanced.test/';
  }

  protected searchIn(query: string): string {
    return `https://glanced.test/?q=${query}`;
  }

  async getSeries(url: string): Promise<Series> {
    throw new SourceError('no_chapters', 'No chapters found on the series page.', { url });
  }

  override async glance(url: string): Promise<Glance> {
    this.pages.push(url);
    return this.answer(url);
  }

  async getList(): Promise<SeriesSummary[]> {
    return [];
  }

  async getChapter(): Promise<ChapterPages> {
    return { pages: [] };
  }
}

function setup(betterCovers: boolean) {
  const source = new GlancedSource(betterCovers);
  const store = new MemoryStore();
  const library = new Library(store);
  const catalog = new Catalog(new SourceRegistry([source]), library, () => 0, undefined, undefined, new GenreShelf(store));
  return { source, library, catalog };
}

const urlOf = (n: number): string => `https://glanced.test/series/${n}`;
const tick = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

/** Lets every page being read answer, and those that waited for a place begin and answer in their turn. */
async function drain(gates: Array<() => void>): Promise<void> {
  for (let round = 0; round < 12; round++) {
    await tick();
    for (const release of gates.splice(0)) release();
  }
}

test('the genres of a series are read from its page at a glance: a series whose chapters cannot be made out has them too', async () => {
  for (const betterCovers of [false, true]) {
    const { source, library, catalog } = setup(betterCovers);
    assert.deepEqual(await catalog.genres(urlOf(1)), ['Seinen']);
    assert.deepEqual(source.pages, [urlOf(1)]);
    assert.equal(library.get(urlOf(1)), null, 'looking at a listing never fills the library');
    // Kept: the next ask is not a second reading.
    assert.deepEqual(await catalog.genres(urlOf(1)), ['Seinen']);
    assert.equal(source.pages.length, 1);
  }
});

test('a page that says no genre is an answer too, and is not read again', async () => {
  const { source, catalog } = setup(false);
  source.answer = async () => ({ cover: 'https://glanced.test/cover.jpg', genres: [] });
  assert.deepEqual(await catalog.genres(urlOf(1)), []);
  assert.deepEqual(await catalog.genres(urlOf(1)), []);
  assert.equal(source.pages.length, 1);
});

test('a page asked for by a card and by the filter is read for the filter when the card has left the screen by its turn', async () => {
  const { source, catalog } = setup(true);
  const gates: Array<() => void> = [];
  source.answer = (url) => new Promise((resolve) => gates.push(() => resolve({ cover: `${url}.jpg`, genres: ['Seinen'] })));
  // Three pages are being read, and the fourth waits for its turn: its card asks for the cover, the filter for the genres.
  for (const n of [1, 2, 3]) void catalog.cover(urlOf(n));
  let onScreen = true;
  const cover = catalog.cover(urlOf(4), () => onScreen);
  const genres = catalog.genres(urlOf(4));
  onScreen = false;
  await drain(gates);
  assert.deepEqual(await genres, ['Seinen'], 'the filter still wanted it');
  assert.equal(await cover, `${urlOf(4)}.jpg`);
  assert.deepEqual(source.pages, [1, 2, 3, 4].map(urlOf), 'one reading for both');
});

test('a page nobody wants any more when its turn comes is not read, and is read when it is asked for again', async () => {
  const { source, catalog } = setup(false);
  assert.equal(await catalog.genres(urlOf(1), () => false), null);
  assert.deepEqual(source.pages, []);
  assert.deepEqual(await catalog.genres(urlOf(1)), ['Seinen']);
  assert.deepEqual(source.pages, [urlOf(1)]);
});

test('a page that could not be read gives nothing, is not remembered as having no genres, and is read again when asked for again', async () => {
  const { source, catalog } = setup(false);
  source.answer = async () => {
    throw new SourceError('blocked', 'The site asked for a human check.');
  };
  assert.equal(await catalog.genres(urlOf(1)), null);
  source.answer = async () => ({ cover: null, genres: ['Seinen'] });
  assert.deepEqual(await catalog.genres(urlOf(1)), ['Seinen']);
  assert.equal(source.pages.length, 2);
});

test('the same page asked for twice at once is one reading', async () => {
  const { source, catalog } = setup(false);
  const [first, second] = await Promise.all([catalog.genres(urlOf(1)), catalog.genres(urlOf(1))]);
  assert.deepEqual([first, second], [['Seinen'], ['Seinen']]);
  assert.equal(source.pages.length, 1);
});
