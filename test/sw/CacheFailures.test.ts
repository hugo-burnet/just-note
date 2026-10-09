import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CacheBudget } from '../../src/sw/CacheBudget.ts';
import { CacheFirst } from '../../src/sw/CacheFirst.ts';
import { NetworkFirst } from '../../src/sw/NetworkFirst.ts';
import { ProxiedImages } from '../../src/sw/ProxiedImages.ts';

const request = new Request('https://proxy.test/api/img?u=picture');
for (const failure of ['open', 'match', 'put', 'trim']) {
  test(`worker: failed cache ${failure} never loses a successful network response`, async () => {
    const fail = (operation: string): void => { if (operation === failure) throw new Error('storage unavailable'); };
    const cache = {
      match: async () => { fail('match'); return undefined; },
      put: async () => { fail('put'); },
      keys: async () => { fail('trim'); return []; },
      delete: async () => true,
    };
    Object.assign(globalThis, {
      caches: { open: async () => { fail('open'); return cache; } },
      fetch: async () => new Response('fresh', { status: 200 }),
    });
    const strategies = [new NetworkFirst({ cacheName: 'test', budget: new CacheBudget(1) }), new CacheFirst('test', new CacheBudget(1)), new ProxiedImages('test', new CacheBudget(1))];
    for (const strategy of strategies) assert.equal(await (await strategy.handle(request)).text(), 'fresh');
  });
}

test('worker: failed cache writes do not replace a fresh response with an older one', async () => {
  Object.assign(globalThis, {
    caches: { open: async () => ({ put: async () => { throw new Error('quota'); }, match: async () => new Response('stale') }) },
    fetch: async () => new Response('fresh'),
  });
  assert.equal(await (await new NetworkFirst({ cacheName: 'test' }).handle(request)).text(), 'fresh');
});

test('worker: an unavailable cache preserves the underlying network failure', async () => {
  const offline = new TypeError('offline');
  Object.assign(globalThis, {
    caches: { open: async () => { throw new Error('storage blocked'); } },
    fetch: async () => { throw offline; },
  });
  await assert.rejects(new NetworkFirst({ cacheName: 'test' }).handle(request), (error) => error === offline);
});
