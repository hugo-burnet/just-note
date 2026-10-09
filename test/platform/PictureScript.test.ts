import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BLOB_HOOK, pictureScript } from '../../src/platform/native/pictureScript.ts';
import { blobOf, picture, PretendReader, SCREEN, SELECTOR, TOKEN } from './pretendReader.ts';

test('script: pictures that come in as the page is scrolled are all there, in the order of the page, before it reads them', async () => {
  const reader = new PretendReader([picture(1, 0), picture(2, 1500), picture(3, 3000), picture(4, 4500)]);
  for (const n of [1, 2, 3, 4]) reader.blobs.set(`blob:https://m.example.test/${n}`, blobOf(`page ${n}`));
  await reader.run(pictureScript(SELECTOR));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.deepEqual(reader.heard.map((one) => one.bytes), ['page 1', 'page 2', 'page 3', 'page 4']);
  assert.ok(reader.heard.every((one) => one.type === 'image/jpeg'));
  assert.ok(reader.selectors.every((selector) => selector === SELECTOR), 'the selector is the one given, quotes and all');
});

test('script: a reader that scrolls inside a box of its own is scrolled there, not just the page', async () => {
  const reader = new PretendReader([picture(1, 0), picture(2, 2000), picture(3, 4000)]);
  reader.inner = { scrollHeight: 6000, clientHeight: SCREEN, scrollTop: 0, overflow: 'auto' };
  for (const n of [1, 2, 3]) reader.blobs.set(`blob:https://m.example.test/${n}`, blobOf(`page ${n}`));
  await reader.run(pictureScript(SELECTOR));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.deepEqual(reader.heard.map((one) => one.bytes), ['page 1', 'page 2', 'page 3']);
  assert.ok(reader.inner.scrollTop >= 4000, `the box was scrolled to ${reader.inner.scrollTop}`);
});

test('script: a long page gets the time it takes to scroll through it, a screen at a time', async () => {
  const reader = new PretendReader([picture(1, 0), picture(2, 50_000), picture(3, 118_000)]);
  reader.height = 120_000;
  for (const n of [1, 2, 3]) reader.blobs.set(`blob:https://m.example.test/${n}`, blobOf(`page ${n}`));
  await reader.run(pictureScript(SELECTOR));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.equal(reader.heard.length, 3);
  assert.ok(reader.clock > 45_000, `${reader.clock} ms: longer than the time a short page is given`);
});

test('script: with no places given the pictures that came are all there is to go by, and a late one is missed', async () => {
  const blind = new PretendReader([picture(1, 0), picture(2, 1500), picture(3, 3000), { ...picture(4, 0), insertAt: 99_999 }]);
  for (const n of [1, 2, 3]) blind.blobs.set(`blob:https://m.example.test/${n}`, blobOf(`page ${n}`));
  await blind.run(pictureScript(SELECTOR));
  assert.equal(blind.heard.length, 3);
});

test('script: it says how far it has got, only ever up, from the scrolling to the last picture read', async () => {
  const reader = new PretendReader([picture(1, 0), picture(2, 1500), picture(3, 3000), picture(4, 4500)]);
  for (const n of [1, 2, 3, 4]) reader.blobs.set(`blob:https://m.example.test/${n}`, blobOf(`page ${n}`));
  await reader.run(pictureScript(SELECTOR));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  const { progress } = reader;
  assert.ok(progress.length >= 4, progress.join(' '));
  assert.deepEqual(progress, [...progress].sort((a, b) => a - b), 'never back');
  assert.equal(new Set(progress).size, progress.length, 'never twice the same');
  assert.ok(progress.some((percent) => percent < 85), 'the scrolling is the first part');
  assert.equal(progress.at(-1), 100);
});

test('script: a picture the hook did not keep is asked for by its address, and when the page let go of that too, it is drawn', async () => {
  const reader = new PretendReader([picture(1, 0), picture(2, 0), picture(3, 0)]);
  reader.blobs.set('blob:https://m.example.test/1', blobOf('page 1'));
  reader.served.set('blob:https://m.example.test/2', blobOf('page 2', 'image/png'));
  await reader.run(pictureScript(SELECTOR));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.deepEqual(reader.heard, [
    { type: 'image/jpeg', bytes: 'page 1' },
    { type: 'image/png', bytes: 'page 2' },
    { type: 'image/jpeg', bytes: 'drawn' },
  ]);
  // The first needed no request: the hook had it.
  assert.deepEqual(reader.fetched, ['blob:https://m.example.test/2', 'blob:https://m.example.test/3']);
});

test('script: a picture that never loads is a failure that says how many did, not a chapter with a page missing', async () => {
  const reader = new PretendReader([picture(1, 0), { ...picture(2, 0, 99_999) }]);
  reader.blobs.set('blob:https://m.example.test/1', blobOf('page 1'));
  await reader.run(pictureScript(SELECTOR));
  assert.deepEqual(reader.outcome, [`fail ${TOKEN} A picture did not load (1 of 2).`]);
  assert.deepEqual(reader.heard, []);
});

test('script: a page with no picture at all ends after a while, with nothing to give', async () => {
  const reader = new PretendReader([]);
  await reader.run(pictureScript(SELECTOR));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.deepEqual(reader.heard, []);
  assert.ok(reader.clock >= 12_000 && reader.clock < 20_000, `${reader.clock} ms`);
});

test('hook: the blobs the page makes are kept by address, once, and nothing else is', () => {
  const made: unknown[] = [];
  class PretendURL {
    static createObjectURL(object: unknown): string {
      made.push(object);
      return `blob:https://m.example.test/${made.length}`;
    }
  }
  const window: { __justReadBlobs?: Map<string, Blob> } = {};
  const install = (): void => void new Function('window', 'URL', 'Blob', BLOB_HOOK)(window, PretendURL, Blob);
  install();
  install();
  const blob = blobOf('bytes');
  assert.equal(PretendURL.createObjectURL(blob), 'blob:https://m.example.test/1');
  assert.equal(PretendURL.createObjectURL({ not: 'a blob' }), 'blob:https://m.example.test/2');
  assert.deepEqual([...(window.__justReadBlobs ?? new Map()).keys()], ['blob:https://m.example.test/1']);
  assert.equal(window.__justReadBlobs?.get('blob:https://m.example.test/1'), blob);
  // Installed twice, the page's own call still reaches the original once.
  assert.equal(made.length, 2);
});
