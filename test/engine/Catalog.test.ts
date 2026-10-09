import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Catalog, CoverShelf, Library, Source, SourceRegistry } from '../../src/engine/index.ts';
import type { ChapterPages, Series, SeriesSummary, SourceTarget } from '../../src/engine/index.ts';
import type { ChapterOptions } from '../../src/engine/source/Source.ts';
import { makeIO, MemoryStore } from './helpers.ts';

class StubSource extends Source {
  readonly id = 'stub';
  readonly name = 'Stub';
  readonly languages = ['en'];
  readonly reading = { mode: 'scroll', rtl: false } as const;
  readonly calls = { series: 0, chapter: 0, list: 0 };
  override readonly betterCovers = true;
  /** What the pages of series were asked for their covers, and how the test answers. */
  readonly coversAsked: string[] = [];
  coverAnswer: (url: string) => Promise<string | null> = async (url) => `${url}/cover.jpg`;
  /** What each chapter was asked with. */
  readonly chapterCalls: Array<{ background: boolean }> = [];
  failNext = false;

  resolve(input: string): SourceTarget | null {
    return input.startsWith('https://stub.test/') ? { kind: 'series', url: input } : null;
  }

  protected homeIn(): string {
    return 'https://stub.test/';
  }

  protected searchIn(query: string): string {
    return `https://stub.test/search?q=${query}`;
  }

  async getSeries(url: string): Promise<Series> {
    this.calls.series++;
    if (this.failNext) {
      this.failNext = false;
      throw new Error('boom');
    }
    return { url, title: 'Stub series', cover: null, author: '', status: '', genres: [], description: '', chapters: [] };
  }

  override async coverOf(url: string): Promise<string | null> {
    this.coversAsked.push(url);
    return this.coverAnswer(url);
  }

  async getList(): Promise<SeriesSummary[]> {
    this.calls.list++;
    return [];
  }

  async getChapter(_url: string, options: ChapterOptions = {}): Promise<ChapterPages> {
    this.calls.chapter++;
    this.chapterCalls.push({ background: options.background === true });
    if (this.failNext) {
      this.failNext = false;
      throw new Error('boom');
    }
    return { pages: ['https://stub.test/1.jpg'] };
  }
}

function setup() {
  const source = new StubSource(makeIO({}).io);
  const library = new Library(new MemoryStore());
  let clock = 0;
  const catalog = new Catalog(new SourceRegistry([source]), library, () => clock);
  return { source, library, catalog, advance: (ms: number) => (clock += ms) };
}

const URL_1 = 'https://stub.test/series/1';

test('answers are remembered for a few minutes, then asked again', async () => {
  const { source, catalog, advance } = setup();
  await catalog.series(URL_1);
  await catalog.series(URL_1);
  await catalog.chapter(URL_1);
  await catalog.chapter(URL_1);
  assert.deepEqual([source.calls.series, source.calls.chapter], [1, 1]);

  advance(6 * 60_000);
  await catalog.series(URL_1);
  assert.equal(source.calls.series, 2);
});

test('a chapter read ahead is told so, and is the answer when the chapter is asked for in the meantime', async () => {
  const { source, catalog } = setup();
  const ahead = catalog.chapter(URL_1, { background: true });
  const asked = catalog.chapter(URL_1);
  assert.deepEqual(await Promise.all([ahead, asked]), [{ pages: ['https://stub.test/1.jpg'] }, { pages: ['https://stub.test/1.jpg'] }]);
  assert.deepEqual(source.chapterCalls, [{ background: true }]);
});

test('a chapter read ahead that failed is not remembered: the next ask reads it again, not in the background', async () => {
  const { source, catalog } = setup();
  source.failNext = true;
  await assert.rejects(() => catalog.chapter(URL_1, { background: true }), { message: 'boom' });
  assert.equal((await catalog.chapter(URL_1)).pages.length, 1);
  assert.deepEqual(source.chapterCalls, [{ background: true }, { background: false }]);
});

test('a better cover is asked of the source once, kept for the next start, and never puts the series in the library', async () => {
  const store = new MemoryStore();
  const source = new StubSource(makeIO({}).io);
  const library = new Library(new MemoryStore());
  const catalog = new Catalog(new SourceRegistry([source]), library, Date.now, new CoverShelf(store));
  assert.equal(await catalog.cover(URL_1), `${URL_1}/cover.jpg`);
  assert.equal(await catalog.cover(URL_1), `${URL_1}/cover.jpg`);
  assert.deepEqual(source.coversAsked, [URL_1]);
  assert.deepEqual(library.list(), []);

  const later = new Catalog(new SourceRegistry([source]), library, Date.now, new CoverShelf(store));
  assert.equal(await later.cover(URL_1), `${URL_1}/cover.jpg`);
  assert.equal(source.coversAsked.length, 1);
});

test('better covers are asked for a few at a time, and one asked for twice at once is asked once', async () => {
  const { source, catalog } = setup();
  const open: Array<() => void> = [];
  source.coverAnswer = (url) => new Promise((resolve) => open.push(() => resolve(`${url}.jpg`)));
  const urls = [1, 2, 3, 4, 5].map((n) => `https://stub.test/series/${n}`);
  const answers = urls.map((url) => catalog.cover(url));
  const again = catalog.cover(urls[0] ?? '');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(source.coversAsked.length, 3);
  open[0]?.();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(source.coversAsked.length, 4);
  for (const release of open) release();
  await new Promise((resolve) => setImmediate(resolve));
  open[4]?.();
  assert.equal(await again, `${urls[0]}.jpg`);
  assert.deepEqual(await Promise.all(answers), urls.map((url) => `${url}.jpg`));
  assert.equal(source.coversAsked.length, 5);
});

test('a series nobody looks at any more when its turn comes is not asked for, and is when it is looked at again', async () => {
  const { source, catalog } = setup();
  assert.equal(await catalog.cover(URL_1, () => false), null);
  assert.deepEqual(source.coversAsked, []);
  assert.equal(await catalog.cover(URL_1, () => true), `${URL_1}/cover.jpg`);
});

test('a page that cannot be read leaves the cover the listing had, and is tried again next time', async () => {
  const { source, catalog } = setup();
  source.coverAnswer = async () => {
    throw new Error('blocked');
  };
  assert.equal(await catalog.cover(URL_1), null);
  source.coverAnswer = async (url) => `${url}/cover.jpg`;
  assert.equal(await catalog.cover(URL_1), `${URL_1}/cover.jpg`);
  assert.equal(source.coversAsked.length, 2);
});

test('fresh asks the site again', async () => {
  const { source, catalog } = setup();
  await catalog.series(URL_1);
  await catalog.series(URL_1, { fresh: true });
  assert.equal(source.calls.series, 2);
});

test('looking at a series puts it in the library, even from memory', async () => {
  const { library, catalog } = setup();
  await catalog.series(URL_1);
  assert.equal(library.get(URL_1)?.title, 'Stub series');
  library.remove(URL_1);
  await catalog.series(URL_1);
  assert.equal(library.get(URL_1)?.title, 'Stub series');
});

test('failures are not remembered', async () => {
  const { source, catalog } = setup();
  source.failNext = true;
  await assert.rejects(() => catalog.series(URL_1), /boom/);
  assert.equal((await catalog.series(URL_1)).title, 'Stub series');
  assert.equal(source.calls.series, 2);
});

test('a link no source understands is a clear error', async () => {
  const { catalog } = setup();
  await assert.rejects(() => catalog.series('https://elsewhere.test/x'), { code: 'unsupported' });
  await assert.rejects(() => catalog.chapter('https://elsewhere.test/x'), { code: 'unsupported' });
  await assert.rejects(() => catalog.list('https://elsewhere.test/x'), { code: 'unsupported' });
});

/** A site whose chapter links do not name their series: the page does. */
class CompletingSource extends StubSource {
  asked = 0;

  override resolve(input: string): SourceTarget | null {
    if (!input.startsWith('https://completing.test/')) return null;
    return input.includes('/c/') ? { kind: 'chapter', url: input, key: 'c1' } : { kind: 'series', url: input };
  }

  override async complete(target: SourceTarget): Promise<SourceTarget | null> {
    this.asked++;
    return target.url.endsWith('/lost') ? null : { ...target, seriesUrl: 'https://completing.test/series/9' };
  }
}

test('resolve gives a link whole: a chapter that does not name its series is completed, once for a few minutes', async () => {
  const source = new CompletingSource(makeIO({}).io);
  const catalog = new Catalog(new SourceRegistry([source]), new Library(new MemoryStore()));
  const link = await catalog.resolve('https://completing.test/c/1');
  assert.equal(link?.seriesUrl, 'https://completing.test/series/9');
  assert.equal(link?.source, source);
  await catalog.resolve('https://completing.test/c/1');
  assert.equal(source.asked, 1);
});

test('resolve leaves alone what is whole, what nobody knows, and says so when a chapter cannot be completed', async () => {
  const source = new CompletingSource(makeIO({}).io);
  const catalog = new Catalog(new SourceRegistry([source]), new Library(new MemoryStore()));
  assert.equal((await catalog.resolve('https://completing.test/series/1'))?.kind, 'series');
  assert.equal(await catalog.resolve('https://elsewhere.test/'), null);
  assert.equal(await catalog.resolve('https://completing.test/c/lost'), null);
  assert.equal(source.asked, 1, 'only the chapter was asked about');
});

test('a downloaded chapter is read from the device, and a series whose site cannot be had from what was kept of it', async () => {
  const source = new StubSource(makeIO({}).io);
  const kept: Series = { url: URL_1, title: 'Kept', cover: null, author: '', status: '', genres: [], description: '', chapters: [] };
  const saved = {
    pages: async (url: string) => (url === 'https://stub.test/kept/1' ? { pages: ['saved.jpg'] } : null),
    series: async (url: string) => (url === URL_1 ? kept : null),
  };
  const catalog = new Catalog(new SourceRegistry([source]), new Library(new MemoryStore()), () => 0, undefined, saved);
  assert.deepEqual(await catalog.chapter('https://stub.test/kept/1'), { pages: ['saved.jpg'] });
  assert.equal(source.calls.chapter, 0);
  assert.deepEqual(await catalog.chapter('https://stub.test/other/1'), { pages: ['https://stub.test/1.jpg'] });
  // Online, the site's page wins; when it fails, the kept one stands in, and nothing kept is still an error.
  assert.equal((await catalog.series(URL_1)).title, 'Stub series');
  source.failNext = true;
  assert.equal((await catalog.series(URL_1, { fresh: true })).title, 'Kept');
  source.failNext = true;
  await assert.rejects(() => catalog.series('https://stub.test/series/2', { fresh: true }), /boom/);
});
