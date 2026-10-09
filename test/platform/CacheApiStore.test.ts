import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { CacheApiStore } from '../../src/platform/native/ResponseStore.ts';

// Node has no Cache API: this is the part of it the store uses, in memory.
class FakeCache {
  readonly entries = new Map<string, Response>();

  async match(key: string): Promise<Response | undefined> {
    return this.entries.get(key)?.clone();
  }

  async put(key: string, response: Response): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, response);
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((key) => new Request(key));
  }

  async delete(request: Request): Promise<boolean> {
    return this.entries.delete(request.url);
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

const A = 'https://fanfox.net/a';
const B = 'https://fanfox.net/b';
const C = 'https://fanfox.net/c';
const D = 'https://fanfox.net/d';

test('cache store: what was put comes back, under the name it was given', async () => {
  const opened = install();
  const store = new CacheApiStore('jr-api', 5);
  await store.put(A, new Response('first'));
  assert.equal(await (await store.get(A))?.text(), 'first');
  assert.equal(await store.get(B), undefined);
  assert.deepEqual([...opened.keys()], ['jr-api']);
});

test('cache store: past the limit the oldest go first, and putting again makes an answer the newest', async () => {
  const opened = install();
  const store = new CacheApiStore('jr-img', 2);
  await store.put(A, new Response('a'));
  await store.put(B, new Response('b'));
  await store.put(A, new Response('a again'));
  await store.put(C, new Response('c'));
  assert.deepEqual([...(opened.get('jr-img')?.entries.keys() ?? [])], [A, C]);
  await store.put(D, new Response('d'));
  assert.deepEqual([...(opened.get('jr-img')?.entries.keys() ?? [])], [C, D]);
});

test('cache store: a cache that cannot be had costs the offline copy, never the reading', async () => {
  const store = new CacheApiStore('jr-api', 5);
  assert.equal(await store.get(A), undefined);
  await assert.doesNotReject(store.put(A, new Response('x')));
  scope.caches = {
    open: async () => {
      throw new Error('storage blocked');
    },
  };
  assert.equal(await store.get(A), undefined);
  await assert.doesNotReject(store.put(A, new Response('x')));
});
