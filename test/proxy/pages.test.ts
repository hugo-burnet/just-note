import assert from 'node:assert/strict';
import { test } from 'node:test';
import { body, htmlPath, page, setup } from './helpers.ts';

test('paths outside /api/ fall through to the caller', async () => {
  const { api } = setup(() => page(''));
  assert.equal(await api.handle(new Request('http://app.test/index.html')), null);
});

test('health check, with hardening headers on every API response', async () => {
  const { get } = setup(() => page(''));
  const res = await get('/api/health');
  assert.equal(res.status, 200);
  assert.deepEqual(await body(res), { ok: true });
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy') ?? '', /sandbox/);
});

test('html: fetches with browser-like headers and serves text/plain', async () => {
  const { get, calls } = setup(() => page('<p>hi</p>'));
  const res = await get(htmlPath('https://fanfox.net/manga/x/'));
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^text\/plain/);
  assert.equal(res.headers.get('x-final-url'), 'https://fanfox.net/manga/x/');
  assert.equal(await res.text(), '<p>hi</p>');
  assert.equal(calls[0]?.headers.referer, 'https://fanfox.net/');
  assert.match(calls[0]?.headers['user-agent'] ?? '', /Mozilla/);
  assert.equal(calls[0]?.redirect, 'manual');
});

test('html: each site gets its own Referer', async () => {
  const { get, calls } = setup(() => page('ok'));
  await get(htmlPath('https://www.webtoons.com/en/'));
  assert.equal(calls[0]?.headers.referer, 'https://www.webtoons.com/');
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
    const res = await get(htmlPath(target));
    assert.equal(res.status, 403, target);
    assert.equal((await body(res)).error, 'host_not_allowed', target);
  }
  assert.equal(calls.length, 0);
});

test('html: accepts subdomains of an allowed host', async () => {
  const { get } = setup(() => page('ok'));
  assert.equal((await get(htmlPath('https://m.fanfox.net/manga/x/'))).status, 200);
});

test('html: only plain https addresses, http is upgraded', async () => {
  const { get, calls } = setup(() => page('ok'));
  for (const target of ['ftp://fanfox.net/', 'https://user:pw@fanfox.net/', 'https://fanfox.net:8443/', 'nonsense']) {
    const res = await get(htmlPath(target));
    assert.equal(res.status, 400, target);
    assert.equal((await body(res)).error, 'bad_url', target);
  }
  assert.equal((await get('/api/html')).status, 400);
  assert.equal(calls.length, 0);

  await get(htmlPath('http://fanfox.net/x'));
  assert.equal(calls[0]?.url, 'https://fanfox.net/x');
});

test('html: follows redirects and re-checks every hop', async () => {
  const { get, calls } = setup((_url, count) =>
    count === 1 ? new Response(null, { status: 302, headers: { location: '/manga/y/' } }) : page('moved'),
  );
  const res = await get(htmlPath('https://fanfox.net/manga/x/'));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('x-final-url'), 'https://fanfox.net/manga/y/');
  assert.deepEqual(calls.map((c) => c.url), ['https://fanfox.net/manga/x/', 'https://fanfox.net/manga/y/']);

  const leaving = setup(() => new Response(null, { status: 301, headers: { location: 'https://example.com/' } }));
  const blocked = await leaving.get(htmlPath('https://fanfox.net/'));
  assert.equal(blocked.status, 403);
  assert.equal((await body(blocked)).host, 'example.com');
  assert.equal(leaving.calls.length, 1);
});

test('html: gives up on redirect loops', async () => {
  const { get, calls } = setup(() => new Response(null, { status: 302, headers: { location: '/again' } }));
  const res = await get(htmlPath('https://fanfox.net/'));
  assert.equal(res.status, 508);
  assert.equal((await body(res)).error, 'too_many_redirects');
  assert.equal(calls.length, 6);
});

test('html: upstream failures are reported with the upstream status', async () => {
  for (const status of [403, 404, 503]) {
    const { get } = setup(() => page('nope', { status }));
    const res = await get(htmlPath('https://fanfox.net/'));
    assert.equal(res.status, 502);
    const json = await body(res);
    assert.equal(json.error, 'upstream_status');
    assert.equal(json.upstreamStatus, status);
  }
});

test('html: timeouts and network errors', async () => {
  const slow = setup(() => {
    throw Object.assign(new Error('slow'), { name: 'TimeoutError' });
  });
  const timeout = await slow.get(htmlPath('https://fanfox.net/'));
  assert.equal(timeout.status, 504);
  assert.equal((await body(timeout)).error, 'timeout');

  const down = setup(() => {
    throw new TypeError('fetch failed');
  });
  const unreachable = await down.get(htmlPath('https://fanfox.net/'));
  assert.equal(unreachable.status, 502);
  assert.equal((await body(unreachable)).error, 'upstream_unreachable');
});

test('html: decodes the charset the source declares', async () => {
  const latin1 = new Response(new Uint8Array([0x63, 0x61, 0x66, 0xe9]), { headers: { 'content-type': 'text/html; charset=iso-8859-1' } });
  const { get } = setup(() => latin1);
  assert.equal(await (await get(htmlPath('https://fanfox.net/'))).text(), 'café');
});

test('html: refuses oversized pages, declared or not', async () => {
  const declared = setup(() => page('x', { headers: { 'content-length': String(6 * 1024 * 1024) } }));
  assert.equal((await declared.get(htmlPath('https://fanfox.net/'))).status, 502);

  const undeclared = setup(() => new Response(new Uint8Array(6 * 1024 * 1024)));
  const res = await undeclared.get(htmlPath('https://fanfox.net/'));
  assert.equal(res.status, 502);
  assert.equal((await body(res)).error, 'too_large');
});

test('html: a requested Referer is used only when it is an allowed host', async () => {
  const chapter = 'https://fanfox.net/manga/x/c001/1.html';
  const ok = setup(() => page('ok'));
  await ok.get(htmlPath('https://fanfox.net/manga/x/c001/chapterfun.ashx?page=1', `&ref=${encodeURIComponent(chapter)}`));
  assert.equal(ok.calls[0]?.headers.referer, chapter);

  const evil = setup(() => page('ok'));
  await evil.get(htmlPath('https://fanfox.net/x', `&ref=${encodeURIComponent('https://evil.example/')}`));
  assert.equal(evil.calls[0]?.headers.referer, 'https://fanfox.net/');
});
