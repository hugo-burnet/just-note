import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { CacheApiStore } from '../../src/platform/native/ResponseStore.ts';

// Node has no Cache API: this is the part of it the store uses, in memory.
class FakeCache {
  readonly entries = new Map<string, Response>();

  async match(key: string | Request): Promise<Response | undefined> {
    return this.entries.get(typeof key === 'string' ? key : key.url)?.clone();
  }

  async put(key: string, response: Response): Promise<void> {
    this.entries.delete(key);
    this.entries.set(key, response);
  }

  async keys(): Promise<Request[]> {
    return [...this.entries.keys()].map((key) => new Request(key));
  }

  async delete(request: string | Request): Promise<boolean> {
    return this.entries.delete(typeof request === 'string' ? request : request.url);
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

test('cache store: byte limits evict oldest downloads even below the entry limit', async () => {
  const opened = install();
  const store = new CacheApiStore('bytes', 10, 10);
  await store.put(A, new Response('1234', { headers: { 'content-length': '1' } }));
  await store.put(B, new Response('1234'));
  await store.put(C, new Response('12345'));
  assert.deepEqual([...opened.get('bytes')!.entries.keys()], [B, C]);
  assert.equal(await (await store.get(B))?.text(), '1234');
});

test('cache store: an oversized answer stays readable but does not displace useful downloads', async () => {
  const opened = install();
  const store = new CacheApiStore('bytes', 10, 5);
  await store.put(A, new Response('small'));
  const large = new Response('too large');
  await store.put(B, large);
  assert.deepEqual([...opened.get('bytes')!.entries.keys()], [A]);
  assert.equal(await large.text(), 'too large');
});

test('cache store: concurrent stores share one budget and make room before writing', async () => {
  const opened = install();
  const first = new CacheApiStore('shared', 10, 6), second = new CacheApiStore('shared', 10, 6);
  await Promise.all([first.put(A, new Response('aaa')), second.put(B, new Response('bbb')), first.put(C, new Response('ccc'))]);
  assert.deepEqual([...opened.get('shared')!.entries.keys()], [B, C]);
});

test('cache store: old entries without size metadata are included after restarting', async () => {
  const opened = install();
  const store = new CacheApiStore('old', 10, 6);
  const cache = await (scope.caches as { open(name: string): Promise<FakeCache> }).open('old');
  await cache.put(A, new Response('aaaa'));
  await store.put(B, new Response('bbb'));
  assert.deepEqual([...opened.get('old')!.entries.keys()], [B]);
  await new CacheApiStore('old', 10, 6).put(C, new Response('cccc'));
  assert.deepEqual([...opened.get('old')!.entries.keys()], [C]);
});

test('cache store: eviction frees byte quota before the next answer is written', async () => {
  install();
  const cache = await (scope.caches as { open(name: string): Promise<FakeCache> }).open('full');
  const put = cache.put.bind(cache);
  cache.put = async (key, response) => {
    const existing = await Promise.all([...cache.entries.values()].map(async (item) => (await item.clone().arrayBuffer()).byteLength));
    const size = (await response.clone().arrayBuffer()).byteLength;
    if (existing.reduce((a, b) => a + b, size) > 8) throw new Error('quota');
    await put(key, response);
  };
  const store = new CacheApiStore('full', 10, 8);
  for (const key of [A, B, C]) await store.put(key, new Response('1234'));
  assert.deepEqual([...cache.entries.keys()], [B, C]);
  assert.equal(await (await store.get(C))?.text(), '1234');
});
