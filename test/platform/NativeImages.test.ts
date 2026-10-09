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

test('native images: replacing a captured picture keeps an existing consumer valid until release', async () => {
  const { images, revoked } = setup();
  const first = await images.acquire(url(0));
  await images.keep(url(0), new Blob(['new picture'], { type: 'image/png' }), 'chapter');
  const second = await images.acquire(url(0));
  assert.notEqual(second.src, first.src);
  assert.deepEqual(revoked, []);
  first.release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(revoked, [first.src]);
  second.release();
});

test('native images: a long captured chapter stays readable past the live-image limit with no disk cache', async () => {
  let created = 0;
  const images = new NativeImages(new SiteClient({ get: async () => { throw new Error('synthetic addresses must not reach the network'); } }), {
    get: async () => undefined, put: async () => { throw new Error('quota'); },
  }, { create: () => `blob:test/${++created}`, revoke: () => {} });
  images.beginRendering('chapter');
  const addresses = Array.from({ length: MAX_LIVE_IMAGES + 5 }, (_, id) => `https://m.scan-manga.com/__rendered/chapter/${id}`);
  for (const address of addresses) await images.keep(address, new Blob(['page'], { type: 'image/png' }), 'chapter');
  const first = await images.acquire(addresses[0]!);
  first.release();
  for (const address of addresses.slice(1)) (await images.acquire(address)).release();
  const revisited = await images.acquire(addresses[0]!, true);
  assert.match(revisited.src, /^blob:/);
  assert.notEqual(revisited.src, first.src);
  revisited.release();
});

test('native images: only two captured chapters are retained, and active images survive discarding an older one', async () => {
  const { images, revoked } = setup();
  await images.keep(url(0), new Blob(['first']), 'first');
  const held = await images.acquire(url(0));
  await images.keep(url(1), new Blob(['unseen']), 'first');
  const unseen = await images.source(url(1));
  await images.keep(url(2), new Blob(['second']), 'second');
  await images.keep(url(3), new Blob(['third']), 'third');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(revoked.includes(unseen));
  assert.ok(!revoked.includes(held.src));
  held.release();
});
