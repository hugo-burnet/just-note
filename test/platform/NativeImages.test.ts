import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_LIVE_IMAGES, NativeImages } from '../../src/platform/native/NativeImages.ts';
import { SiteClient } from '../../src/platform/native/SiteClient.ts';

const url = (id: number) => `https://fmcdn.mfcdn.net/review/${id}.jpg`;

function setup() {
  const revoked: string[] = [];
  const stored = new Map<string, Response>();
  let downloads = 0, created = 0;
  const client = new SiteClient({ get: async () => {
    downloads++;
    return { status: 200, headers: { 'content-type': 'image/jpeg' }, body: 'AQID' };
  } });
  const images = new NativeImages(client, {
    get: async (key) => stored.get(key)?.clone(),
    put: async (key, response) => { stored.set(key, response); },
  }, { create: () => `blob:test/${++created}`, revoke: (src) => revoked.push(src) });
  return { images, revoked, downloads: () => downloads };
}

test('native images: more than 120 active consumers keep every address until it is released', async () => {
  const { images, revoked } = setup();
  const held = await Promise.all(Array.from({ length: MAX_LIVE_IMAGES + 1 }, (_, id) => images.acquire(url(id))));
  assert.deepEqual(revoked, []);
  held[0]?.release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(revoked, [held[0]?.src]);
  for (const resource of held) resource.release();
});

test('native images: two consumers of the same address protect it independently', async () => {
  const { images, revoked, downloads } = setup();
  const first = await images.acquire(url(0)), second = await images.acquire(url(0));
  assert.equal(first.src, second.src);
  assert.equal(downloads(), 1);
  first.release();
  for (let id = 1; id <= MAX_LIVE_IMAGES + 5; id++) await images.source(url(id));
  assert.ok(!revoked.includes(first.src));
  const third = await images.acquire(url(0));
  assert.equal(third.src, second.src);
  third.release();
  second.release();
});

test('native images: retry downloads again and keeps the previous consumer\'s blob valid', async () => {
  const { images, revoked, downloads } = setup();
  const previous = await images.acquire(url(0));
  const retried = await images.acquire(url(0), true);
  assert.equal(downloads(), 2);
  assert.notEqual(retried.src, previous.src);
  assert.equal(revoked.length, 0);
  previous.release();
  previous.release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(revoked, [previous.src]);
  assert.ok(!revoked.includes(retried.src));
  retried.release();
});

test('native images: an unavailable persistent cache does not prevent a download', async () => {
  const images = new NativeImages(new SiteClient({ get: async () => ({ status: 200, headers: { 'content-type': 'image/png' }, body: 'AQID' }) }), {
    get: async () => { throw new Error('blocked'); },
    put: async () => { throw new Error('full'); },
  }, { create: () => 'blob:test/valid', revoke: () => {} });
  const resource = await images.acquire(url(0));
  assert.equal(resource.src, 'blob:test/valid');
  resource.release();
});
