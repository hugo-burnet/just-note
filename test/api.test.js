import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { ApiError, checkProxy, fetchText, imageSrc } from '../public/js/api.js';

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stub(answer) {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return calls;
}

const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('imageSrc puts the image address in the proxy query', () => {
  assert.equal(
    imageSrc('https://fmcdn.mfcdn.net/a.jpg?token=1&x=2'),
    '/api/img?u=https%3A%2F%2Ffmcdn.mfcdn.net%2Fa.jpg%3Ftoken%3D1%26x%3D2',
  );
});

test('fetchText returns the text and where the proxy ended up', async () => {
  const calls = stub(new Response('<p>x</p>', { headers: { 'x-final-url': 'https://fanfox.net/y/' } }));
  const result = await fetchText('https://fanfox.net/x/');
  assert.deepEqual(result, { text: '<p>x</p>', url: 'https://fanfox.net/y/' });
  assert.equal(calls[0].url, '/api/html?u=https%3A%2F%2Ffanfox.net%2Fx%2F');
});

test('fetchText passes the Referer and the do-not-keep marker on', async () => {
  const calls = stub(new Response('ok'));
  await fetchText('https://fanfox.net/f.ashx', { ref: 'https://fanfox.net/c/1.html', cache: false });
  const query = new URL(calls[0].url, 'http://app.test').searchParams;
  assert.equal(query.get('ref'), 'https://fanfox.net/c/1.html');
  assert.equal(query.get('nocache'), '1');

  const plain = stub(new Response('ok'));
  await fetchText('https://fanfox.net/x/');
  assert.equal(new URL(plain[0].url, 'http://app.test').searchParams.has('nocache'), false);
});

test('proxy errors keep their code and details', async () => {
  stub(json({ error: 'upstream_status', message: 'The source answered 403.', upstreamStatus: 403 }, 502));
  await assert.rejects(() => fetchText('https://fanfox.net/x/'), (err) => {
    assert.ok(err instanceof ApiError);
    assert.equal(err.code, 'upstream_status');
    assert.equal(err.upstreamStatus, 403);
    assert.equal(err.status, 502);
    return true;
  });

  stub(json({ error: 'host_not_allowed', message: 'nope', host: 'cdn.example.com' }, 403));
  await assert.rejects(() => fetchText('https://cdn.example.com/'), { code: 'host_not_allowed', host: 'cdn.example.com' });
});

test('a static host that has no proxy is recognised', async () => {
  stub(new Response('<html>Not found</html>', { status: 404 }));
  await assert.rejects(() => fetchText('https://fanfox.net/x/'), { code: 'no_proxy' });
});

test('a network failure is reported as such', async () => {
  stub(new TypeError('Failed to fetch'));
  await assert.rejects(() => fetchText('https://fanfox.net/x/'), (err) => ['network', 'offline'].includes(err.code));
});

test('checkProxy tells whether the health route answers', async () => {
  stub(json({ ok: true }, 200));
  assert.equal(await checkProxy(), true);
  stub(new Response('nope', { status: 404 }));
  assert.equal(await checkProxy(), false);
  stub(new TypeError('Failed to fetch'));
  assert.equal(await checkProxy(), false);
});
