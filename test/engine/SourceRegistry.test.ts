import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractUrl, FanFoxSource, SourceRegistry, WebtoonSource } from '../../src/engine/index.ts';
import { absolute, clean, looksBlocked, mapLimit, secure } from '../../src/engine/text.ts';
import { makeIO } from './helpers.ts';

const { io } = makeIO({});
const registry = new SourceRegistry([new FanFoxSource(io), new WebtoonSource(io)]);

test('extractUrl finds the link in shared text', () => {
  assert.equal(extractUrl('https://fanfox.net/manga/x/'), 'https://fanfox.net/manga/x/');
  assert.equal(extractUrl('  Look at this one https://fanfox.net/manga/x/c001/1.html (so good) '), 'https://fanfox.net/manga/x/c001/1.html');
  assert.equal(extractUrl('fanfox.net/manga/x/'), 'https://fanfox.net/manga/x/');
  assert.equal(extractUrl('hello there'), null);
  assert.equal(extractUrl(''), null);
  assert.equal(extractUrl(null), null);
});

test('the registry hands a link to the source that knows it', () => {
  const fox = registry.resolve('Read this: https://m.fanfox.net/manga/x/c012/3.html');
  assert.equal(fox?.source.id, 'fanfox');
  assert.equal(fox?.kind, 'chapter');
  assert.equal(fox?.url, 'https://fanfox.net/manga/x/c012/1.html');

  const toon = registry.resolve('https://www.webtoons.com/en/fantasy/lantern-keeper/list?title_no=5001');
  assert.equal(toon?.source.id, 'webtoon');
  assert.equal(toon?.kind, 'series');

  assert.equal(registry.resolve('https://example.com/manga/x/'), null);
  assert.equal(registry.resolve('nothing'), null);
  assert.deepEqual(registry.all().map((s) => s.id), ['fanfox', 'webtoon']);
  assert.equal(registry.byId('webtoon')?.name, 'WEBTOON');
  assert.equal(registry.byId('nope'), null);
});

test('text helpers: clean, absolute, secure, looksBlocked', () => {
  assert.equal(clean('  a \n\t b  '), 'a b');
  assert.equal(clean(null), '');
  assert.equal(absolute('//cdn.example/a.jpg', 'https://site.example/x'), 'https://cdn.example/a.jpg');
  assert.equal(absolute('/a', 'https://site.example/x/y'), 'https://site.example/a');
  assert.equal(absolute('javascript:alert(1)', 'https://site.example/'), null);
  assert.equal(absolute('', 'https://site.example/'), null);
  assert.equal(secure('//cdn.example/a.jpg'), 'https://cdn.example/a.jpg');
  assert.equal(secure('http://cdn.example/a.jpg'), 'https://cdn.example/a.jpg');
  assert.equal(looksBlocked('<title>Just a moment...</title>'), true);
  assert.equal(looksBlocked('<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>'), false);
});

test('mapLimit keeps the order and respects the limit', async () => {
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

test('mapLimit stops starting new work after a failure', async () => {
  const started: number[] = [];
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
