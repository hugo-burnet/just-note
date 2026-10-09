import assert from 'node:assert/strict';
import { test } from 'node:test';
import { pictureScript } from '../../src/platform/native/pictureScript.ts';
import { blobOf, PLACES, picture, PretendReader, PretendSlot, TOKEN } from './pretendReader.ts';
import type { PretendPicture } from './pretendReader.ts';

// A page that keeps a place for each of its pictures (a div it numbers), before the pictures are there.
const chapter = (tops: readonly number[], latency = 0, height = 6000): PretendReader => {
  const pictures: PretendPicture[] = tops.map((top, index) => picture(index + 1, top, top, latency));
  const reader = new PretendReader(pictures);
  reader.height = height;
  reader.slots = pictures.map((one, index) => new PretendSlot(reader, tops[index] ?? 0, one));
  for (let n = 1; n <= tops.length; n++) reader.blobs.set(`blob:https://m.example.test/${n}`, blobOf(`page ${n}`));
  return reader;
};

test('places: the script goes from place to place, so a page metres long is not scrolled through', async () => {
  const reader = chapter([0, 150_000, 390_000], 300, 400_000);
  await reader.run(pictureScript('img[src^="blob:"]', PLACES));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.deepEqual(reader.heard.map((one) => one.bytes), ['page 1', 'page 2', 'page 3']);
  assert.match(reader.notes[0] ?? '', /^pictures 3, places 3, page height 400000$/);
  assert.ok(reader.clock < 6_000, `${reader.clock} ms`);
  assert.equal(reader.progress.at(-1), 100);
});

test('places: a picture that is slow to come is waited for in its place', async () => {
  const reader = chapter([0, 3000, 6000], 5_000, 9000);
  await reader.run(pictureScript('img[src^="blob:"]', PLACES));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.equal(reader.heard.length, 3);
  assert.ok(reader.clock < 25_000, `${reader.clock} ms`);
});

test('places: a place that stays empty is given up on, and the page is read as any other, with a slow picture still waited for', async () => {
  const reader = chapter([0, 3000, 6000], 0, 9000);
  const slow = reader.pictures[2];
  assert.ok(slow);
  Object.assign(slow, { latency: 9_000 });
  await reader.run(pictureScript('img[src^="blob:"]', PLACES));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.equal(reader.heard.length, 3);
});

test('places: places the page hides are not places', async () => {
  const reader = chapter([0, 1500]);
  reader.slots.push(...Array.from({ length: 3 }, () => new PretendSlot(reader, 0, undefined, true)));
  await reader.run(pictureScript('img[src^="blob:"]', PLACES));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.match(reader.notes[0] ?? '', /^pictures 2, places 2, page height \d+$/);
  assert.ok(reader.clock < 6_000, `${reader.clock} ms`);
});

test('places: places that never hold a picture are scrolled through like any page, then given a few seconds', async () => {
  // A page may keep places for more than its pictures.
  const reader = new PretendReader([picture(1, 0), picture(2, 0), picture(3, 0)]);
  reader.places = 5;
  for (const n of [1, 2, 3]) reader.blobs.set(`blob:https://m.example.test/${n}`, blobOf(`page ${n}`));
  await reader.run(pictureScript('img[src^="blob:"]', PLACES));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.deepEqual(reader.heard.map((one) => one.bytes), ['page 1', 'page 2', 'page 3']);
  assert.match(reader.notes[0] ?? '', /^pictures 3, places 5, page height \d+, fewer pictures than places$/);
  assert.ok(reader.clock >= 20_000 && reader.clock < 30_000, `${reader.clock} ms`);
});

test('places: the last picture, which comes in late, is waited for', async () => {
  const reader = chapter([0, 1500, 3000, 4500]);
  const late = reader.pictures[3];
  assert.ok(late);
  const at = late.insertAt;
  Object.assign(late, { insertAt: 99_999 });
  reader.later(8_000, () => Object.assign(late, { insertAt: at }));
  await reader.run(pictureScript('img[src^="blob:"]', PLACES));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.deepEqual(reader.heard.map((one) => one.bytes), ['page 1', 'page 2', 'page 3', 'page 4']);
});

test('places: a page too long to be scrolled in time, with fewer pictures than places, is a failure, not the top of a chapter', async () => {
  const reader = new PretendReader([picture(1, 0), picture(2, 1500)]);
  reader.places = 5;
  reader.height = 2_000_000;
  await reader.run(pictureScript('img[src^="blob:"]', PLACES));
  assert.deepEqual(reader.outcome, [`fail ${TOKEN} Only 2 of 5 pages came in time.`]);
  assert.deepEqual(reader.heard, []);
  assert.ok(reader.clock >= 60_000 && reader.clock < 70_000, `${reader.clock} ms`);
});

test('places: places and no picture at all is a failure that says so', async () => {
  const reader = new PretendReader([]);
  reader.places = 4;
  await reader.run(pictureScript('img[src^="blob:"]', PLACES));
  assert.deepEqual(reader.outcome, [`fail ${TOKEN} None of the 4 pages came.`]);
});

test('places: places that match nothing leave the pictures that came as all there is to go by', async () => {
  const reader = new PretendReader([picture(1, 0), picture(2, 1500)]);
  for (const n of [1, 2]) reader.blobs.set(`blob:https://m.example.test/${n}`, blobOf(`page ${n}`));
  await reader.run(pictureScript('img[src^="blob:"]', PLACES));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.equal(reader.heard.length, 2);
});

test('places: the report says what they are: how many of each kind, where they sit, whether they show and hold a picture', async () => {
  const place = (tagName: string, className: string, parent: unknown, shown: boolean, holds: boolean) => ({
    tagName,
    className,
    parentElement: parent,
    getClientRects: () => (shown ? [{}] : []),
    matches: () => false,
    scrollIntoView: () => undefined,
    querySelector: () => (holds ? { complete: true, naturalWidth: 800 } : null),
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
  await reader.run(pictureScript('img[src^="blob:"]', PLACES));
  assert.equal(
    reader.notes[0],
    'pictures 2, places 2, page height 6000 (1x div.image-container.strip.first in div#scroll with img, 1x div.image-container.strip in div#scroll with img, 2x li.dot in ul.pager hidden)',
  );
});
