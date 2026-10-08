import assert from 'node:assert/strict';
import { test } from 'node:test';
import { body, image, imgPath, page, setup } from './helpers.ts';

test('img: streams raster images with a cache lifetime', async () => {
  const { get, calls } = setup(() => image('image/jpeg', [1, 2, 3], { 'content-length': '3' }));
  const res = await get(imgPath('https://fmcdn.mfcdn.net/store/manga/1/001.jpg'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=604800');
  assert.equal(res.headers.get('content-length'), '3');
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [1, 2, 3]);
  assert.match(calls[0]?.headers.accept ?? '', /image\//);
  assert.equal(calls[0]?.headers.referer, 'https://fanfox.net/');
});

test('img: a CDN of another site gets that site as Referer', async () => {
  const { get, calls } = setup(() => image());
  await get(imgPath('https://webtoon-phinf.pstatic.net/20240101/a/img_1.jpg?type=q90'));
  assert.equal(calls[0]?.headers.referer, 'https://www.webtoons.com/');
  assert.equal(calls[0]?.url, 'https://webtoon-phinf.pstatic.net/20240101/a/img_1.jpg?type=q90');
});

test('img: refuses anything that is not a raster image (SVG included)', async () => {
  for (const type of ['image/svg+xml', 'text/html', 'application/octet-stream', '']) {
    const { get } = setup(() => image(type));
    const res = await get(imgPath('https://fanfox.net/x.jpg'));
    assert.equal(res.status, 502, type);
    assert.equal((await body(res)).error, 'not_an_image', type);
  }
});

test('img: the size cap applies to the declared length and to the bytes streamed', async () => {
  const declared = setup(() => image('image/png', [1], { 'content-length': String(40 * 1024 * 1024) }));
  const refused = await declared.get(imgPath('https://fanfox.net/x.png'));
  assert.equal(refused.status, 502);
  assert.equal((await body(refused)).error, 'too_large');

  const streamed = setup(() => new Response(new Uint8Array(31 * 1024 * 1024), { headers: { 'content-type': 'image/png' } }));
  const res = await streamed.get(imgPath('https://fanfox.net/x.png'));
  assert.equal(res.status, 200);
  await assert.rejects(() => res.arrayBuffer());
});

test('CORS headers only appear when configured', async () => {
  const closed = await setup(() => page('ok')).get('/api/health');
  assert.equal(closed.headers.get('access-control-allow-origin'), null);

  const one = setup(() => page('ok'), { corsOrigin: 'https://me.example' });
  const res = await one.get('/api/health');
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://me.example');
  assert.equal(res.headers.get('access-control-expose-headers'), 'x-final-url');
  assert.match(res.headers.get('vary') ?? '', /origin/i);
  assert.equal((await one.get('/api/health', { method: 'OPTIONS' })).status, 204);

  const any = await setup(() => page('ok'), { corsOrigin: '*' }).get('/api/health');
  assert.equal(any.headers.get('access-control-allow-origin'), '*');
  assert.equal(any.headers.get('vary'), null);
});

test('CORS also covers images, so a page on another origin can cache them', async () => {
  const { get } = setup(() => image(), { corsOrigin: 'https://me.example' });
  const res = await get(imgPath('https://fanfox.net/x.jpg'));
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://me.example');
});

test('only GET is accepted, unknown routes are 404', async () => {
  const { get } = setup(() => page('ok'));
  assert.equal((await get('/api/html', { method: 'POST' })).status, 405);
  assert.equal((await get('/api/nope')).status, 404);
});
