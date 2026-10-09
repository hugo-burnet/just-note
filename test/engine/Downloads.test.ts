import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Downloads } from '../../src/engine/index.ts';
import type { Chapter, ChapterPages, OfflineShelf, Series } from '../../src/engine/index.ts';
import { MemoryStore } from './helpers.ts';

/** A shelf in memory, which can be told to fail on a picture. */
class FakeShelf implements OfflineShelf {
  readonly pictures = new Map<string, number>();
  readonly texts = new Map<string, string>();
  failing = new Set<string>();
  persisted = 0;

  async keepPicture(address: string): Promise<number> {
    if (this.failing.has(address)) throw new Error('403');
    this.pictures.set(address, 1000);
    return 1000;
  }

  async dropPictures(addresses: readonly string[]): Promise<void> {
    for (const address of addresses) this.pictures.delete(address);
  }

  async keepText(key: string, text: string): Promise<void> {
    this.texts.set(key, text);
  }

  async text(key: string): Promise<string | null> {
    return this.texts.get(key) ?? null;
  }

  async dropText(key: string): Promise<void> {
    this.texts.delete(key);
  }

  async persist(): Promise<boolean> {
    this.persisted++;
    return true;
  }
}

const SERIES = 'https://site.test/s/';
const chapter = (n: number): Chapter => ({ url: `${SERIES}c${n}`, key: `c${n}`, number: n, title: `Chapter ${n}`, date: '' });
const series: Series = { url: SERIES, title: 'A series', cover: null, author: '', status: '', genres: [], description: '', chapters: [chapter(1), chapter(2), chapter(3)] };
const picturesOf = (url: string): string[] => [1, 2, 3].map((page) => `${url}/p${page}.jpg`);

function setup(read: (url: string) => Promise<ChapterPages> = async (url) => ({ pages: picturesOf(url) })) {
  const shelf = new FakeShelf();
  const store = new MemoryStore();
  const asked: string[] = [];
  const downloads = new Downloads(store, shelf, (url) => {
    asked.push(url);
    return read(url);
  }, () => 42);
  return { shelf, store, downloads, asked };
}

/** Until the queue is empty. */
async function idle(downloads: Downloads, urls: readonly string[]): Promise<void> {
  for (let i = 0; i < 100 && urls.some((url) => ['queued', 'running'].includes(downloads.state(url)?.status ?? '')); i++) await new Promise((resolve) => setImmediate(resolve));
}

test('downloads: chapters are kept one after the other, pictures, list and series page, and say how they go', async () => {
  const { downloads, shelf, asked } = setup();
  const seen: string[] = [];
  const pendingSeen: number[] = [];
  downloads.subscribe(() => {
    seen.push(downloads.state(chapter(1).url)?.status ?? 'none');
    pendingSeen.push(downloads.pending(SERIES));
  });
  downloads.download(series, [chapter(1), chapter(2)]);
  assert.equal(downloads.state(chapter(2).url)?.status, 'queued');
  assert.equal(downloads.pending(SERIES), 2);
  await idle(downloads, [chapter(1).url, chapter(2).url]);

  assert.deepEqual(asked, [chapter(1).url, chapter(2).url]);
  assert.ok(seen.includes('running') && seen.at(-1) === 'saved');
  assert.deepEqual(downloads.state(chapter(1).url), { status: 'saved', done: 3, total: 3 });
  assert.equal(downloads.pending(SERIES), 0);
  assert.equal(pendingSeen.at(-1), 0, 'the last thing listeners are told is that nothing is coming in any more');
  assert.equal(shelf.pictures.size, 6);
  assert.equal(shelf.persisted, 1, 'the system is asked once to keep the storage');
  assert.deepEqual(await downloads.pages(chapter(2).url), { pages: picturesOf(chapter(2).url) });
  assert.equal((await downloads.series(SERIES))?.title, 'A series');
  assert.deepEqual(downloads.usage(), { chapters: 2, bytes: 6000 });
  assert.deepEqual(downloads.saved(SERIES).map((saved) => [saved.title, saved.pictures, saved.savedAt]), [['Chapter 1', 3, 42], ['Chapter 2', 3, 42]]);
  // Asked again, what is kept is not downloaded again.
  downloads.download(series, [chapter(1)]);
  await idle(downloads, [chapter(1).url]);
  assert.equal(asked.length, 2);
});

test('downloads: a chapter that fails is let go whole, said to have failed, and can be tried again', async () => {
  const { downloads, shelf } = setup();
  shelf.failing.add(picturesOf(chapter(1).url)[2] ?? '');
  downloads.download(series, [chapter(1)]);
  await idle(downloads, [chapter(1).url]);
  assert.equal(downloads.state(chapter(1).url)?.status, 'failed');
  assert.equal(downloads.isSaved(chapter(1).url), false);
  assert.equal(await downloads.pages(chapter(1).url), null);
  assert.equal(shelf.pictures.size, 0, 'half a chapter is no use: nothing of it stays');
  shelf.failing.clear();
  downloads.download(series, [chapter(1)]);
  await idle(downloads, [chapter(1).url]);
  assert.equal(downloads.state(chapter(1).url)?.status, 'saved');
});

test('downloads: a chapter whose list cannot be had fails without stopping the next', async () => {
  const { downloads } = setup(async (url) => {
    if (url === chapter(1).url) throw new Error('offline');
    return { pages: picturesOf(url) };
  });
  downloads.download(series, [chapter(1), chapter(2)]);
  await idle(downloads, [chapter(1).url, chapter(2).url]);
  assert.equal(downloads.state(chapter(1).url)?.status, 'failed');
  assert.equal(downloads.state(chapter(2).url)?.status, 'saved');
});

test('downloads: waiting chapters can be taken out of the queue, and kept ones let go, series page and all', async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const { downloads, shelf } = setup(async (url) => {
    await gate;
    return { pages: picturesOf(url) };
  });
  downloads.download(series, [chapter(1), chapter(2), chapter(3)]);
  downloads.cancel([chapter(3).url]);
  assert.equal(downloads.state(chapter(3).url), null);
  release();
  await idle(downloads, [chapter(1).url, chapter(2).url]);
  assert.deepEqual(downloads.saved().map((saved) => saved.key), ['c1', 'c2']);

  await downloads.remove([chapter(1).url]);
  assert.equal(downloads.isSaved(chapter(1).url), false);
  assert.equal(shelf.pictures.size, 3);
  assert.ok(await downloads.series(SERIES), 'the series page stays while a chapter of it does');
  await downloads.removeSeries(SERIES);
  assert.equal(shelf.pictures.size, 0);
  assert.equal(shelf.texts.size, 0);
  assert.deepEqual(downloads.usage(), { chapters: 0, bytes: 0 });
});

test('downloads: where nothing can be kept, nothing is offered', async () => {
  const downloads = new Downloads(new MemoryStore(), null, async () => ({ pages: [] }));
  assert.equal(downloads.available, false);
  downloads.download(series, [chapter(1)]);
  assert.equal(downloads.state(chapter(1).url), null);
  assert.equal(await downloads.pages(chapter(1).url), null);
});

test('downloads: a chapter let go while it comes in is not kept when it ends', async () => {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => (release = resolve));
  const { downloads, shelf } = setup(async (url) => {
    await gate;
    return { pages: picturesOf(url) };
  });
  downloads.download(series, [chapter(1)]);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(downloads.state(chapter(1).url)?.status, 'running');
  await downloads.removeSeries(SERIES);
  release();
  for (let i = 0; i < 20; i++) await new Promise((resolve) => setImmediate(resolve));
  assert.equal(downloads.state(chapter(1).url), null);
  assert.equal(downloads.isSaved(chapter(1).url), false);
  assert.equal(shelf.pictures.size, 0);
});
