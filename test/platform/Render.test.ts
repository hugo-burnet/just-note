import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HostPolicy } from '../../proxy/HostPolicy.ts';
import { TransportError } from '../../src/engine/index.ts';
import { ChallengeGate } from '../../src/platform/native/ChallengeGate.ts';
import { CredentialJar } from '../../src/platform/native/CredentialJar.ts';
import { NativeImages } from '../../src/platform/native/NativeImages.ts';
import { NativeTransport } from '../../src/platform/native/NativeTransport.ts';
import type { CapturedPicture, FetchedPage } from '../../src/platform/native/PageFetcher.ts';
import { SiteClient } from '../../src/platform/native/SiteClient.ts';
import { FakeBlobs, FakeFetcher, FakeHttp, MemoryStore, page, picture, settle } from './fakes.ts';

const CHAPTER = 'https://m.scan-manga.com/lecture-en-ligne/Lantern-Keeper-Chapitre-3-FR_130013.html';
const SELECTOR = 'img[src^="blob:"]';
const DIALOG = { statusLabel: 'Checking…', readingLabel: 'Loading the chapter…', cancelLabel: 'Cancel' };
// Three bytes (1, 2, 3), as the WebView hands a picture over: base64, with the type the page gave or none.
const captured = (type = 'image/jpeg'): CapturedPicture => ({ type, data: 'AQID' });

/** The stores outlive a transport, as the Cache API does the app. */
function stores() {
  return { pages: new MemoryStore(), pictures: new MemoryStore() };
}

function setup(shown: (url: string) => Partial<FetchedPage>, kept = stores()) {
  const http = new FakeHttp(() => page('<html>', 200));
  const fetcher = new FakeFetcher((url) => ({ html: '<html>read', url, userAgent: 'webview', cookies: 'cf_clearance=ok', ...shown(url) }));
  const jar = new CredentialJar();
  const client = new SiteClient(http, new HostPolicy(), jar);
  const gate = new ChallengeGate(client, jar, fetcher, () => DIALOG);
  const blobs = new FakeBlobs();
  const transport = new NativeTransport(gate, kept.pages, new NativeImages(gate, kept.pictures, blobs), gate);
  return { http, fetcher, transport, blobs, kept, gate };
}

test('render: the WebView is told what to collect and what to say, and the pictures it built are named as the site\'s own', async () => {
  const { transport, fetcher, http } = setup(() => ({ pictures: [captured(), captured('image/png')] }));
  const rendered = await transport.render?.(CHAPTER, { pictures: SELECTOR });
  assert.deepEqual(fetcher.asked, [{ url: CHAPTER, options: { ...DIALOG, pictures: SELECTOR } }]);
  assert.equal(rendered?.text, '<html>read');
  assert.equal(rendered?.url, CHAPTER);
  const addresses = rendered?.pictures ?? [];
  assert.equal(addresses.length, 2);
  addresses.forEach((address, index) => assert.match(address, new RegExp(`^https://m\\.scan-manga\\.com/__rendered/[0-9a-f]{8}/${index + 1}$`)));
  assert.equal(http.asked.length, 0);
});

test('render: what is not a picture fails the chapter instead of being shown as one', async () => {
  const { transport } = setup(() => ({ pictures: [captured(), captured('text/html')] }));
  await assert.rejects(() => transport.render?.(CHAPTER, { pictures: SELECTOR }) ?? Promise.resolve(), (error: unknown) => error instanceof TransportError && error.code === 'not_an_image');
});

test('render: pictures with no type are told from their bytes, and each is shown from the store with no request', async () => {
  const png = { type: '', data: Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2]).toString('base64') };
  const { transport, http, blobs } = setup(() => ({ pictures: [captured(), png] }));
  const rendered = await transport.render?.(CHAPTER, { pictures: SELECTOR });
  const [first, second] = rendered?.pictures ?? [];
  assert.equal(await transport.imageSource(first ?? ''), 'blob:test/1');
  assert.equal(await transport.imageSource(second ?? ''), 'blob:test/2');
  assert.deepEqual(blobs.created.map((blob) => blob.type), ['image/jpeg', 'image/png']);
  assert.equal(http.asked.length, 0);
});

test('render: a chapter read once opens again from what was kept, with no WebView, even in a new transport', async () => {
  const kept = stores();
  const first = setup(() => ({ pictures: [captured(), captured()] }), kept);
  const rendered = await first.transport.render?.(CHAPTER, { pictures: SELECTOR });
  await settle();
  const later = setup(() => ({ pictures: [] }), kept);
  assert.deepEqual(await later.transport.render?.(CHAPTER, { pictures: SELECTOR }), { text: '', url: CHAPTER, pictures: rendered?.pictures });
  assert.equal(later.fetcher.asked.length, 0);
});

test('render: a chapter whose pictures were pushed out of the store is read again', async () => {
  const kept = stores();
  const first = setup(() => ({ pictures: [captured(), captured()] }), kept);
  const rendered = await first.transport.render?.(CHAPTER, { pictures: SELECTOR });
  await settle();
  kept.pictures.kept.delete(`${rendered?.pictures[1]}`);
  const later = setup(() => ({ pictures: [captured()] }), kept);
  assert.equal((await later.transport.render?.(CHAPTER, { pictures: SELECTOR }))?.pictures.length, 1);
  assert.equal(later.fetcher.asked.length, 1);
});

test('render: a page with no picture is not remembered as read', async () => {
  const { transport, fetcher } = setup(() => ({ pictures: [] }));
  assert.deepEqual((await transport.render?.(CHAPTER, { pictures: SELECTOR }))?.pictures, []);
  await settle();
  await transport.render?.(CHAPTER, { pictures: SELECTOR });
  assert.equal(fetcher.asked.length, 2);
});

test('render: the cookie the WebView earned on the way goes with the next requests', async () => {
  const { transport, http } = setup(() => ({ pictures: [captured()] }));
  await transport.render?.(CHAPTER, { pictures: SELECTOR });
  await transport.text('https://m.scan-manga.com/?po');
  assert.equal(http.asked[0]?.headers['Cookie'], 'cf_clearance=ok');
  assert.equal(http.asked[0]?.headers['User-Agent'], 'webview');
});

test('render: a page the WebView could not be passed, or whose pictures did not come, says which', async () => {
  const cancelled = setup(() => ({}));
  cancelled.fetcher.failure = Object.assign(new Error('Cancelled.'), { code: 'cancelled' });
  await assert.rejects(() => cancelled.transport.render?.(CHAPTER, { pictures: SELECTOR }) ?? Promise.resolve(), (error: unknown) => error instanceof TransportError && error.code === 'blocked' && error.host === 'm.scan-manga.com');
  const missing = setup(() => ({}));
  missing.fetcher.failure = Object.assign(new Error('A picture did not load (1 of 2).'), { code: 'pictures' });
  await assert.rejects(() => missing.transport.render?.(CHAPTER, { pictures: SELECTOR }) ?? Promise.resolve(), (error: unknown) => error instanceof TransportError && error.code === 'upstream_unreachable');
});

test('render: it waits for the WebView that is already open, which only one thing at a time can use', async () => {
  const { transport, fetcher } = setup(() => ({ pictures: [captured()] }));
  let release: () => void = () => undefined;
  fetcher.hold = new Promise((resolve) => (release = resolve));
  const first = transport.render?.(CHAPTER, { pictures: SELECTOR });
  const second = transport.render?.(CHAPTER.replace('Chapitre-3-FR_130013', 'Chapitre-4-FR_130014'), { pictures: SELECTOR });
  await settle();
  assert.equal(fetcher.asked.length, 1);
  release();
  await Promise.all([first, second]);
  assert.equal(fetcher.asked.length, 2);
});

test('render: a transport with no WebView has no render, which is how the engine knows', () => {
  const kept = stores();
  const client = new SiteClient(new FakeHttp(() => picture()));
  const transport = new NativeTransport(client, kept.pages, new NativeImages(client, kept.pictures, new FakeBlobs()));
  assert.equal(transport.render, undefined);
});
