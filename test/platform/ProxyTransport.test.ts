import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TransportError } from '../../src/engine/index.ts';
import { ProxyTransport } from '../../src/platform/web/ProxyTransport.ts';

const SITE = 'https://fanfox.net/manga/x/';

function setup(answer: (url: string) => Response | Promise<Response>, base = 'https://proxy.test') {
  const asked: string[] = [];
  let current = base;
  const transport = new ProxyTransport(
    () => current,
    async (input) => {
      asked.push(input);
      return answer(input);
    },
  );
  return { transport, asked, moveTo: (next: string) => (current = next) };
}

const text = (body: string, headers: Record<string, string> = {}): Response => new Response(body, { headers });
const failure = (status: number, body: unknown): Response => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('proxy transport: pages are asked of the proxy, with the Referer when one is wanted', async () => {
  const { transport, asked } = setup(() => text('<html>'));
  assert.deepEqual(await transport.text(SITE), { text: '<html>', url: SITE });
  await transport.text(SITE, { referer: 'https://fanfox.net/manga/x/c1/1.html' });
  assert.equal(asked[0], `https://proxy.test/api/html?u=${encodeURIComponent(SITE)}`);
  assert.match(asked[1] ?? '', /&ref=https%3A%2F%2Ffanfox\.net%2Fmanga%2Fx%2Fc1%2F1\.html$/);
});

test('proxy transport: a one-off answer says so, so that nobody keeps it', async () => {
  const { transport, asked } = setup(() => text('x'));
  await transport.text(SITE, { cache: false });
  await transport.text(SITE, { cache: true });
  assert.match(asked[0] ?? '', /nocache=1/);
  assert.doesNotMatch(asked[1] ?? '', /nocache/);
});

test('proxy transport: the address the site ended up at is the one the proxy reports', async () => {
  const { transport } = setup(() => text('x', { 'x-final-url': 'https://fanfox.net/manga/moved/' }));
  assert.equal((await transport.text(SITE)).url, 'https://fanfox.net/manga/moved/');
});

test('proxy transport: the proxy address is read at each call, and a trailing slash does not matter', async () => {
  const { transport, asked, moveTo } = setup(() => text('x'), 'https://one.test///');
  await transport.text(SITE);
  moveTo('https://two.test');
  await transport.text(SITE);
  assert.ok(asked[0]?.startsWith('https://one.test/api/html?'));
  assert.ok(asked[1]?.startsWith('https://two.test/api/html?'));
  assert.equal(await transport.imageSource('https://x.test/a.png'), 'https://two.test/api/img?u=https%3A%2F%2Fx.test%2Fa.png');
});

test('proxy transport: an empty proxy address means the address of the app itself', async () => {
  const { transport, asked } = setup(() => text('x'), '');
  await transport.text(SITE);
  assert.ok(asked[0]?.startsWith('/api/html?'));
});

test('proxy transport: what the proxy says went wrong is kept', async () => {
  const { transport } = setup(() => failure(502, { error: 'upstream_status', message: 'The source answered 403.', upstreamStatus: 403, host: 'fanfox.net' }));
  await assert.rejects(transport.text(SITE), (error: unknown) => {
    assert.ok(error instanceof TransportError);
    assert.equal(error.code, 'upstream_status');
    assert.equal(error.upstreamStatus, 403);
    assert.equal(error.host, 'fanfox.net');
    return true;
  });
});

test('proxy transport: a failure says which address was asked', async () => {
  const { transport } = setup(() => new Response('<h1>404</h1>', { status: 404 }), 'https://wrong.test/');
  await assert.rejects(transport.text(SITE), (error: unknown) => error instanceof TransportError && error.proxy === 'https://wrong.test');
  const down = new ProxyTransport(() => 'https://down.test', async () => Promise.reject(new TypeError('fetch failed')));
  await assert.rejects(down.text(SITE), (error: unknown) => error instanceof TransportError && error.proxy === 'https://down.test');
});

test('proxy transport: a server that is not our proxy is recognised by what it does not answer', async () => {
  const { transport } = setup(() => new Response('<h1>404</h1>', { status: 404 }));
  await assert.rejects(transport.text(SITE), (error: unknown) => error instanceof TransportError && error.code === 'no_proxy');
  const other = setup(() => new Response('oops', { status: 500 }));
  await assert.rejects(other.transport.text(SITE), (error: unknown) => error instanceof TransportError && error.code === 'proxy');
});

test('proxy transport: no connection at all is a network error', async () => {
  const transport = new ProxyTransport(() => 'https://proxy.test', async () => Promise.reject(new TypeError('fetch failed')));
  await assert.rejects(transport.text(SITE), (error: unknown) => error instanceof TransportError && error.code === 'network');
});

test('proxy transport: health is a yes or a no, never a failure', async () => {
  assert.equal(await setup(() => Response.json({ ok: true })).transport.isHealthy(), true);
  assert.equal(await setup(() => Response.json({ ok: false })).transport.isHealthy(), false);
  assert.equal(await setup(() => new Response('', { status: 500 })).transport.isHealthy(), false);
  assert.equal(await new ProxyTransport(() => 'x', async () => Promise.reject(new Error('down'))).isHealthy(), false);
});
