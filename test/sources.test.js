import assert from 'node:assert/strict';
import { test } from 'node:test';
import { absolute, clean, looksBlocked, mapLimit } from '../public/js/sources/common.js';
import { extractUrl, resolve, sourceById, sources } from '../public/js/sources/index.js';

test('extractUrl: finds the link in shared text', () => {
  assert.equal(extractUrl('https://fanfox.net/manga/x/'), 'https://fanfox.net/manga/x/');
  assert.equal(extractUrl('  Look at this one https://fanfox.net/manga/x/c001/1.html (so good) '), 'https://fanfox.net/manga/x/c001/1.html');
  assert.equal(extractUrl('fanfox.net/manga/x/'), 'https://fanfox.net/manga/x/');
  assert.equal(extractUrl('hello there'), null);
  assert.equal(extractUrl(''), null);
  assert.equal(extractUrl(null), null);
});

test('resolve: hands a link to the source that knows it', () => {
  const hit = resolve('Read this: https://m.fanfox.net/manga/x/c012/3.html');
  assert.equal(hit.source, sourceById('fanfox'));
  assert.equal(hit.kind, 'chapter');
  assert.equal(hit.url, 'https://fanfox.net/manga/x/c012/1.html');
  assert.equal(resolve('https://example.com/manga/x/'), null);
  assert.equal(resolve('nothing'), null);
  assert.ok(sources.length >= 1);
});

test('common: clean, absolute, looksBlocked', () => {
  assert.equal(clean('  a \n\t b  '), 'a b');
  assert.equal(clean(null), '');
  assert.equal(absolute('//cdn.example/a.jpg', 'https://site.example/x'), 'https://cdn.example/a.jpg');
  assert.equal(absolute('/a', 'https://site.example/x/y'), 'https://site.example/a');
  assert.equal(absolute('javascript:alert(1)', 'https://site.example/'), null);
  assert.equal(absolute('', 'https://site.example/'), null);
  assert.equal(looksBlocked('<title>Just a moment...</title>'), true);
  assert.equal(looksBlocked('<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>'), false);
});

test('mapLimit: keeps order, respects the limit', async () => {
  let inFlight = 0;
  let peak = 0;
  const out = await mapLimit([5, 4, 3, 2, 1, 0], 2, async (n) => {
    inFlight++;
    peak = Math.max(peak, inFlight);
    await new Promise((resolve) => setTimeout(resolve, n));
    inFlight--;
    return n * 2;
  });
  assert.deepEqual(out, [10, 8, 6, 4, 2, 0]);
  assert.equal(peak, 2);
});

test('mapLimit: stops starting new work after a failure', async () => {
  const started = [];
  await assert.rejects(
    () =>
      mapLimit([1, 2, 3, 4, 5, 6, 7, 8], 2, async (n) => {
        started.push(n);
        await new Promise((resolve) => setTimeout(resolve, 2));
        if (n === 2) throw new Error('boom');
      }),
    /boom/,
  );
  await new Promise((resolve) => setTimeout(resolve, 30));
  assert.ok(started.length < 8, `started ${started.length}`);
});
