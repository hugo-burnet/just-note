import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ImageResource, Transport } from '../../src/engine/index.ts';
import { ImageLoader, retried } from '../../src/ui/core/ImageLoader.ts';

test('images: retry keeps blob addresses exact and places the HTTP cache key before any fragment', () => {
  assert.equal(retried('blob:https://app.test/image', 2), 'blob:https://app.test/image');
  assert.equal(retried('data:image/png;base64,AQID', 2), 'data:image/png;base64,AQID');
  assert.equal(retried('https://proxy.test/api/img?u=picture#part', 2), 'https://proxy.test/api/img?u=picture&r=2#part');
  assert.equal(retried('/api/img?u=picture&r=1#part', 2), '/api/img?u=picture&r=2#part');
});

function setup() {
  const pending: Array<(resource: ImageResource) => void> = [];
  const retries: Array<boolean | undefined> = [];
  const released: string[] = [];
  const transport: Transport = {
    text: async () => ({ text: '', url: '' }),
    imageSource: async () => { throw new Error('native images must be acquired'); },
    acquireImage: async (_address, retry) => {
      retries.push(retry);
      return new Promise((resolve) => pending.push(resolve));
    },
  };
  return { loader: new ImageLoader(transport), retries, released, resolve: (index: number, src: string) => pending[index]?.({ src, release: () => released.push(src) }) };
}

test('images: a native retry is requested of the transport without rewriting its blob', async () => {
  const { loader, retries, resolve } = setup();
  const pending = loader.load('https://site.test/picture', 1);
  resolve(0, 'blob:test/valid');
  assert.equal(await pending, 'blob:test/valid');
  assert.deepEqual(retries, [true]);
  loader.destroy();
});

test('images: a request that finishes after destruction releases its resource without displaying it', async () => {
  const { loader, released, resolve } = setup();
  const pending = loader.load('picture');
  loader.destroy();
  resolve(0, 'blob:test/late');
  assert.equal(await pending, null);
  assert.deepEqual(released, ['blob:test/late']);
});

test('images: fast page changes discard late answers and release replaced pictures once', async () => {
  const { loader, released, resolve } = setup();
  const old = loader.load('old'), current = loader.load('current');
  resolve(1, 'blob:test/current');
  assert.equal(await current, 'blob:test/current');
  resolve(0, 'blob:test/old');
  assert.equal(await old, null);
  assert.deepEqual(released, ['blob:test/old']);
  const next = loader.load('next');
  resolve(2, 'blob:test/next');
  assert.equal(await next, 'blob:test/next');
  loader.destroy();
  loader.destroy();
  assert.deepEqual(released, ['blob:test/old', 'blob:test/current', 'blob:test/next']);
});

test('images: scrolling away cancels a pending image while allowing it to load on return', async () => {
  const { loader, released, resolve } = setup();
  const abandoned = loader.load('picture');
  loader.clear();
  const restored = loader.load('picture');
  resolve(0, 'blob:test/abandoned');
  resolve(1, 'blob:test/restored');
  assert.equal(await abandoned, null);
  assert.equal(await restored, 'blob:test/restored');
  assert.deepEqual(released, ['blob:test/abandoned']);
  loader.destroy();
});
