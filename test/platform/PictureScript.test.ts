import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BLOB_HOOK, pictureScript } from '../../src/platform/native/pictureScript.ts';
import { blobOf, PLACES, picture, PretendReader, SCREEN, SELECTOR, TOKEN } from './pretendReader.ts';

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

test('script: the places the page keeps for its pictures say how many there should be, and the script waits for the last to come', async () => {
  // The fourth only comes in once the script has been at the bottom of the page for a while: the three
  // that are there are loaded and stable long before, and without the places that would be the end of it.
  const late = { ...picture(4, 0), insertAt: 99_999 };
  const reader = new PretendReader([picture(1, 0), picture(2, 1500), picture(3, 3000), late]);
  reader.places = 4;
  for (const n of [1, 2, 3, 4]) reader.blobs.set(`blob:https://m.example.test/${n}`, blobOf(`page ${n}`));
  reader.later(8_000, () => Object.assign(late, { insertAt: 0, loadAt: 0 }));
  await reader.run(pictureScript(SELECTOR, PLACES));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.deepEqual(reader.heard.map((one) => one.bytes), ['page 1', 'page 2', 'page 3', 'page 4']);
  assert.match(reader.notes[0] ?? '', /^pictures 4, places 4, page height \d+$/);

  // Told nothing of the places, the same script goes away with the three that were there.
  const blind = new PretendReader([picture(1, 0), picture(2, 1500), picture(3, 3000), { ...picture(4, 0), insertAt: 99_999 }]);
  for (const n of [1, 2, 3]) blind.blobs.set(`blob:https://m.example.test/${n}`, blobOf(`page ${n}`));
  await blind.run(pictureScript(SELECTOR));
  assert.equal(blind.heard.length, 3);
});

test('script: places that promise more pictures than ever come are waited for a few seconds, then the pictures there are go on', async () => {
  // A page may keep places for more than its pictures (a manga chapter had 44 for 22).
  const reader = new PretendReader([picture(1, 0), picture(2, 0), picture(3, 0)]);
  reader.places = 5;
  for (const n of [1, 2, 3]) reader.blobs.set(`blob:https://m.example.test/${n}`, blobOf(`page ${n}`));
  await reader.run(pictureScript(SELECTOR, PLACES));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.deepEqual(reader.heard.map((one) => one.bytes), ['page 1', 'page 2', 'page 3']);
  assert.match(reader.notes[0] ?? '', /^pictures 3, places 5, page height \d+, fewer pictures than places$/);
  assert.ok(reader.clock >= 8_000 && reader.clock < 15_000, `${reader.clock} ms`);
});

test('script: a page too long to be scrolled in time, with fewer pictures than places, is a failure, not the top of a chapter', async () => {
  const reader = new PretendReader([picture(1, 0), picture(2, 1500)]);
  reader.places = 5;
  reader.height = 2_000_000;
  await reader.run(pictureScript(SELECTOR, PLACES));
  assert.deepEqual(reader.outcome, [`fail ${TOKEN} Only 2 of 5 pages came in time.`]);
  assert.deepEqual(reader.heard, []);
  assert.ok(reader.clock >= 60_000 && reader.clock < 70_000, `${reader.clock} ms`);
});

test('script: a long page gets the time it takes to scroll through it, a screen at a time', async () => {
  const reader = new PretendReader([picture(1, 0), picture(2, 50_000), picture(3, 118_000)]);
  reader.places = 3;
  reader.height = 120_000;
  for (const n of [1, 2, 3]) reader.blobs.set(`blob:https://m.example.test/${n}`, blobOf(`page ${n}`));
  await reader.run(pictureScript(SELECTOR, PLACES));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.equal(reader.heard.length, 3);
  assert.ok(reader.clock > 45_000, `${reader.clock} ms: longer than the time a short page is given`);
});

test('script: places and no picture at all is a failure that says so', async () => {
  const reader = new PretendReader([]);
  reader.places = 4;
  await reader.run(pictureScript(SELECTOR, PLACES));
  assert.deepEqual(reader.outcome, [`fail ${TOKEN} None of the 4 pages came.`]);
});

test('script: the report says what the places are: how many of each kind, where they sit, whether they show and hold a picture', async () => {
  const place = (tagName: string, className: string, parent: unknown, shown: boolean, holds: boolean) => ({
    tagName,
    className,
    parentElement: parent,
    getClientRects: () => (shown ? [{}] : []),
    querySelector: () => (holds ? {} : null),
  });
  const column = { tagName: 'DIV', id: 'scroll', className: '' };
  const dots = { tagName: 'UL', className: 'pager' };
  const reader = new PretendReader([picture(1, 0), picture(2, 0)]);
  reader.placeElements = [
    place('DIV', 'image-container strip first', column, true, true),
    place('DIV', 'image-container strip', column, true, true),
    place('LI', 'dot', dots, false, false),
    place('LI', 'dot', dots, false, false),
  ];
  for (const n of [1, 2]) reader.blobs.set(`blob:https://m.example.test/${n}`, blobOf(`page ${n}`));
  await reader.run(pictureScript(SELECTOR, PLACES));
  assert.equal(
    reader.notes[0],
    'pictures 2, places 4, page height 6000 (1x div.image-container.strip.first in div#scroll with img, 1x div.image-container.strip in div#scroll with img, 2x li.dot in ul.pager hidden), fewer pictures than places',
  );
});

test('script: with no places given, or places that match nothing, the pictures that came are all there is to go by', async () => {
  for (const places of [undefined, PLACES]) {
    const reader = new PretendReader([picture(1, 0), picture(2, 1500)]);
    for (const n of [1, 2]) reader.blobs.set(`blob:https://m.example.test/${n}`, blobOf(`page ${n}`));
    await reader.run(pictureScript(SELECTOR, places));
    assert.deepEqual(reader.outcome, [`done ${TOKEN}`], String(places));
    assert.equal(reader.heard.length, 2);
  }
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
