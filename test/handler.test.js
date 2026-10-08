import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createApiHandler } from '../server/handler.js';
import { SITES, siteFor, withExtraHosts } from '../server/hosts.js';

function setup(responder, options = {}) {
  const calls = [];
  const fetch = async (url, init) => {
    calls.push({ url, init });
    return responder(url, init, calls.length);
  };
  const handle = createApiHandler({ fetch, ...options });
  const get = (path, init) => handle(new Request(`http://app.test${path}`, init));
  return { calls, get, handle };
}

const page = (body, init = {}) =>
  new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8' }, ...init });
const image = (type = 'image/jpeg', bytes = [1, 2, 3], headers = {}) =>
  new Response(new Uint8Array(bytes), { headers: { 'content-type': type, ...headers } });
const html = (url, extra = '') => `/api/html?u=${encodeURIComponent(url)}${extra}`;
const img = (url) => `/api/img?u=${encodeURIComponent(url)}`;

test('paths outside /api/ fall through to the caller', async () => {
  const { get } = setup(() => page(''));
  assert.equal(await get('/index.html'), null);
});

test('health check, with hardening headers on every API response', async () => {
  const { get } = setup(() => page(''));
  const res = await get('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true });
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /sandbox/);
});

test('html: fetches with browser-like headers and serves text/plain', async () => {
  const { get, calls } = setup(() => page('<p>hi</p>'));
  const res = await get(html('https://fanfox.net/manga/x/'));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/plain/);
  assert.equal(res.headers.get('x-final-url'), 'https://fanfox.net/manga/x/');
  assert.equal(await res.text(), '<p>hi</p>');
  const { init } = calls[0];
  assert.equal(init.headers.referer, 'https://fanfox.net/');
  assert.match(init.headers['user-agent'], /Mozilla/);
  assert.equal(init.redirect, 'manual');
});

test('html: refuses hosts that are not on the allowlist', async () => {
  const { get, calls } = setup(() => page(''));
  for (const target of [
    'https://example.com/',
    'https://evilfanfox.net/',
    'https://fanfox.net.evil.com/',
    'https://localhost/',
    'https://127.0.0.1/',
    'https://169.254.169.254/latest/meta-data/',
  ]) {
    const res = await get(html(target));
    assert.equal(res.status, 403, target);
    assert.equal((await res.json()).error, 'host_not_allowed', target);
  }
  assert.equal(calls.length, 0);
});

test('html: accepts subdomains of an allowed host', async () => {
  const { get } = setup(() => page('ok'));
  assert.equal((await get(html('https://m.fanfox.net/manga/x/'))).status, 200);
});

test('html: only plain https URLs, http is upgraded', async () => {
  const { get, calls } = setup(() => page('ok'));
  for (const target of ['ftp://fanfox.net/', 'https://user:pw@fanfox.net/', 'https://fanfox.net:8443/', 'nonsense']) {
    const res = await get(html(target));
    assert.equal(res.status, 400, target);
    assert.equal((await res.json()).error, 'bad_url', target);
  }
  assert.equal((await get('/api/html')).status, 400);
  assert.equal(calls.length, 0);

  await get(html('http://fanfox.net/x'));
  assert.equal(calls[0].url, 'https://fanfox.net/x');
});

test('html: follows redirects and re-checks every hop', async () => {
  const { get, calls } = setup((url, _init, n) =>
    n === 1 ? new Response(null, { status: 302, headers: { location: '/manga/y/' } }) : page('moved'),
  );
  const res = await get(html('https://fanfox.net/manga/x/'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-final-url'), 'https://fanfox.net/manga/y/');
  assert.deepEqual(
    calls.map((c) => c.url),
    ['https://fanfox.net/manga/x/', 'https://fanfox.net/manga/y/'],
  );

  const leaving = setup(() => new Response(null, { status: 301, headers: { location: 'https://example.com/' } }));
  const blocked = await leaving.get(html('https://fanfox.net/'));
  assert.equal(blocked.status, 403);
  assert.equal((await blocked.json()).host, 'example.com');
  assert.equal(leaving.calls.length, 1);
});

test('html: gives up on redirect loops', async () => {
  const { get, calls } = setup(() => new Response(null, { status: 302, headers: { location: '/again' } }));
  const res = await get(html('https://fanfox.net/'));
  assert.equal(res.status, 508);
  assert.equal((await res.json()).error, 'too_many_redirects');
  assert.equal(calls.length, 6);
});

test('html: upstream failures are reported with the upstream status', async () => {
  for (const status of [403, 404, 503]) {
    const { get } = setup(() => page('nope', { status }));
    const res = await get(html('https://fanfox.net/'));
    assert.equal(res.status, 502);
    const body = await res.json();
    assert.equal(body.error, 'upstream_status');
    assert.equal(body.upstreamStatus, status);
  }
});

test('html: timeouts and network errors', async () => {
  const slow = setup(() => {
    throw Object.assign(new Error('slow'), { name: 'TimeoutError' });
  });
  const timeout = await slow.get(html('https://fanfox.net/'));
  assert.equal(timeout.status, 504);
  assert.equal((await timeout.json()).error, 'timeout');

  const down = setup(() => {
    throw new TypeError('fetch failed');
  });
  const unreachable = await down.get(html('https://fanfox.net/'));
  assert.equal(unreachable.status, 502);
  assert.equal((await unreachable.json()).error, 'upstream_unreachable');
});

test('html: decodes the charset the source declares', async () => {
  const { get } = setup(
    () => new Response(new Uint8Array([0x63, 0x61, 0x66, 0xe9]), { headers: { 'content-type': 'text/html; charset=iso-8859-1' } }),
  );
  assert.equal(await (await get(html('https://fanfox.net/'))).text(), 'café');
});

test('html: refuses oversized pages, declared or not', async () => {
  const declared = setup(() => page('x', { headers: { 'content-length': String(6 * 1024 * 1024) } }));
  assert.equal((await declared.get(html('https://fanfox.net/'))).status, 502);

  const undeclared = setup(() => new Response(new Uint8Array(6 * 1024 * 1024)));
  const res = await undeclared.get(html('https://fanfox.net/'));
  assert.equal(res.status, 502);
  assert.equal((await res.json()).error, 'too_large');
});

test('html: a requested Referer is used only when it is an allowed host', async () => {
  const chapter = 'https://fanfox.net/manga/x/c001/1.html';
  const ok = setup(() => page('ok'));
  await ok.get(html('https://fanfox.net/manga/x/c001/chapterfun.ashx?page=1', `&ref=${encodeURIComponent(chapter)}`));
  assert.equal(ok.calls[0].init.headers.referer, chapter);

  const evil = setup(() => page('ok'));
  await evil.get(html('https://fanfox.net/x', `&ref=${encodeURIComponent('https://evil.example/')}`));
  assert.equal(evil.calls[0].init.headers.referer, 'https://fanfox.net/');
});

test('img: streams raster images with a cache lifetime', async () => {
  const { get, calls } = setup(() => image('image/jpeg', [1, 2, 3], { 'content-length': '3' }));
  const res = await get(img('https://fmcdn.mfcdn.net/store/manga/1/001.jpg'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('content-type'), 'image/jpeg');
  assert.equal(res.headers.get('cache-control'), 'public, max-age=604800');
  assert.equal(res.headers.get('content-length'), '3');
  assert.deepEqual([...new Uint8Array(await res.arrayBuffer())], [1, 2, 3]);
  assert.match(calls[0].init.headers.accept, /image\//);
  assert.equal(calls[0].init.headers.referer, 'https://fanfox.net/');
});

test('img: refuses anything that is not a raster image (SVG included)', async () => {
  for (const type of ['image/svg+xml', 'text/html', 'application/octet-stream', '']) {
    const { get } = setup(() => image(type));
    const res = await get(img('https://fanfox.net/x.jpg'));
    assert.equal(res.status, 502, type);
    assert.equal((await res.json()).error, 'not_an_image', type);
  }
});

test('img: size cap applies to the declared length and to the bytes streamed', async () => {
  const declared = setup(() => image('image/png', [1], { 'content-length': String(40 * 1024 * 1024) }));
  const refused = await declared.get(img('https://fanfox.net/x.png'));
  assert.equal(refused.status, 502);
  assert.equal((await refused.json()).error, 'too_large');

  const streamed = setup(() => new Response(new Uint8Array(31 * 1024 * 1024), { headers: { 'content-type': 'image/png' } }));
  const res = await streamed.get(img('https://fanfox.net/x.png'));
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
  assert.match(res.headers.get('vary'), /origin/i);
  assert.equal((await one.get('/api/health', { method: 'OPTIONS' })).status, 204);

  const any = await setup(() => page('ok'), { corsOrigin: '*' }).get('/api/health');
  assert.equal(any.headers.get('access-control-allow-origin'), '*');
  assert.equal(any.headers.get('vary'), null);
});

test('only GET is accepted, unknown routes are 404', async () => {
  const { get } = setup(() => page('ok'));
  assert.equal((await get('/api/html', { method: 'POST' })).status, 405);
  assert.equal((await get('/api/nope')).status, 404);
});

test('hosts: matching is by whole domain label', () => {
  assert.ok(siteFor('fanfox.net'));
  assert.ok(siteFor('M.FanFox.net'));
  assert.ok(siteFor('fmcdn.mfcdn.net'));
  assert.equal(siteFor('evilfanfox.net'), null);
  assert.equal(siteFor('fanfox.net.evil.com'), null);
  assert.equal(siteFor('net'), null);
});

test('hosts: extra hosts must look like real domains', () => {
  const sites = withExtraHosts(SITES, 'cdn.example.com, com, bad host, ,IMG.Example.net');
  assert.ok(siteFor('cdn.example.com', sites));
  assert.ok(siteFor('a.img.example.net', sites));
  assert.equal(siteFor('example.com', sites), null);
  assert.equal(siteFor('other.com', sites), null);
  assert.equal(withExtraHosts(SITES, undefined), SITES);
});
