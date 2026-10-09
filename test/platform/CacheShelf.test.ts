import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { CacheShelf } from '../../src/platform/webview/CacheShelf.ts';

// Node has no Cache API: this is the part of it the shelf uses, in memory.
class FakeCache {
  readonly entries = new Map<string, Response>();

  async match(key: string | Request): Promise<Response | undefined> {
    return this.entries.get(typeof key === 'string' ? key : key.url)?.clone();
  }

  async put(key: string | Request, response: Response): Promise<void> {
    this.entries.set(typeof key === 'string' ? key : key.url, response);
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((key) => new Request(key));
  }

  async delete(key: string | Request): Promise<boolean> {
    return this.entries.delete(typeof key === 'string' ? key : key.url);
  }
}

const scope = globalThis as { caches?: unknown };

function install(): Map<string, FakeCache> {
  const opened = new Map<string, FakeCache>();
  scope.caches = {
    open: async (name: string) => {
      const cache = opened.get(name) ?? new FakeCache();
      opened.set(name, cache);
      return cache;
    },
  };
  return opened;
}

afterEach(() => {
  delete scope.caches;
});

const PICTURE = 'https://fmcdn.mfcdn.net/store/1.jpg';

test('shelf: a picture is kept once, under the key its reading looks it up by, and let go', async () => {
  const opened = install();
  let asked = 0;
  const shelf = new CacheShelf(async () => {
    asked++;
    return new Response(new Blob(['12345'], { type: 'image/jpeg' }));
  }, (address) => `${address}#key`, 'saved');
  assert.equal(await shelf.keepPicture(PICTURE), 5);
  assert.equal(await shelf.keepPicture(PICTURE), 5);
  assert.equal(asked, 1, 'what is kept is not asked for again');
  assert.equal((await shelf.match(`${PICTURE}#key`))?.headers.get('content-type'), 'image/jpeg');
  await shelf.dropPictures([PICTURE]);
  assert.equal(await shelf.match(`${PICTURE}#key`), undefined);
  assert.equal(opened.get('saved')?.entries.size, 0);
});

test('shelf: texts come back as they were kept, and a picture that cannot be had is an error', async () => {
  install();
  const shelf = new CacheShelf(async () => {
    throw new Error('403');
  }, undefined, 'saved');
  await shelf.keepText('chapter:https://x.test/c1', '{"pages":[]}');
  assert.equal(await shelf.text('chapter:https://x.test/c1'), '{"pages":[]}');
  assert.equal(await shelf.text('chapter:https://x.test/c2'), null);
  await shelf.dropText('chapter:https://x.test/c1');
  assert.equal(await shelf.text('chapter:https://x.test/c1'), null);
  await assert.rejects(() => shelf.keepPicture(PICTURE), /403/);
});
