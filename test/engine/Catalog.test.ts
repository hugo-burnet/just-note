import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Catalog, Library, Source, SourceRegistry } from '../../src/engine/index.ts';
import type { ChapterPages, Series, SeriesSummary, SourceTarget } from '../../src/engine/index.ts';
import { makeIO, MemoryStore } from './helpers.ts';

class StubSource extends Source {
  readonly id = 'stub';
  readonly name = 'Stub';
  readonly languages = ['en'];
  readonly reading = { mode: 'scroll', rtl: false } as const;
  readonly calls = { series: 0, chapter: 0, list: 0 };
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

  async getList(): Promise<SeriesSummary[]> {
    this.calls.list++;
    return [];
  }

  async getChapter(): Promise<ChapterPages> {
    this.calls.chapter++;
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
