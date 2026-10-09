import assert from 'node:assert/strict';
import { test } from 'node:test';
import { USER_AGENT } from '../../proxy/UpstreamClient.ts';
import { TransportError } from '../../src/engine/index.ts';
import type { NativeRequest } from '../../src/platform/native/NativeHttp.ts';
import { MAX_LIVE_IMAGES, NativeImages } from '../../src/platform/native/NativeImages.ts';
import { NativeTransport } from '../../src/platform/native/NativeTransport.ts';
import { SiteClient } from '../../src/platform/native/SiteClient.ts';
import { FakeBlobs, FakeHttp, MemoryStore, page, picture, settle } from './fakes.ts';
import type { Answer } from './fakes.ts';

const SERIES = 'https://fanfox.net/manga/moonlight_courier/';
const PICTURE = 'https://fmcdn.mfcdn.net/store/moonlight_courier/001.jpg';
const REFERER = 'https://fanfox.net/';

function setup(answer: (request: NativeRequest) => Answer, store = new MemoryStore(), pictures = new MemoryStore()) {
  const http = new FakeHttp(answer);
  const blobs = new FakeBlobs();
  const client = new SiteClient(http);
  const transport = new NativeTransport(client, store, new NativeImages(client, pictures, blobs));
  return { http, blobs, store, pictures, transport };
}

async function failure(promise: Promise<unknown>): Promise<TransportError> {
  try {
    await promise;
  } catch (error) {
    assert.ok(error instanceof TransportError, String(error));
    return error;
  }
  throw new assert.AssertionError({ message: 'it should have failed' });
}

test('native transport: a page is asked of the site itself, presented as a browser, with the Referer of its site', async () => {
  const { transport, http } = setup(() => page('<html>'));
  assert.deepEqual(await transport.text(SERIES), { text: '<html>', url: SERIES });
  const [request] = http.asked;
  assert.equal(request?.url, SERIES);
  assert.equal(request?.as, 'text');
  assert.equal(request?.headers['Referer'], REFERER);
  assert.equal(request?.headers['User-Agent'], USER_AGENT);
});

test('native transport: a Referer the caller asks for is used when its host is allowed, and ignored when it is not', async () => {
  const { transport, http } = setup(() => page('x'));
  await transport.text(SERIES, { referer: 'https://fanfox.net/manga/moonlight_courier/c001/1.html' });
  await transport.text(SERIES, { referer: 'https://evil.example/' });
  assert.equal(http.asked[0]?.headers['Referer'], 'https://fanfox.net/manga/moonlight_courier/c001/1.html');
  assert.equal(http.asked[1]?.headers['Referer'], REFERER);
});

test('native transport: redirects are followed one address at a time, and the last address is reported', async () => {
  const { transport, http } = setup((request) =>
    request.url === SERIES ? page('', 301, { location: '/manga/moved/' }) : page('<html>moved'),
  );
  assert.deepEqual(await transport.text(SERIES), { text: '<html>moved', url: 'https://fanfox.net/manga/moved/' });
  assert.equal(http.asked.length, 2);
});

test('native transport: a redirect to a host that is not listed is refused before anything is asked of it', async () => {
  const { transport, http } = setup(() => page('', 302, { location: 'https://evil.example/steal' }));
  const error = await failure(transport.text(SERIES));
  assert.equal(error.code, 'host_not_allowed');
  assert.equal(error.host, 'evil.example');
  assert.equal(http.asked.length, 1);
});

test('native transport: a redirect that never ends gives up', async () => {
  const { transport } = setup(() => page('', 302, { location: SERIES }));
  assert.equal((await failure(transport.text(SERIES))).code, 'too_many_redirects');
});

test('native transport: an address of no listed site is refused without asking anyone', async () => {
  const { transport, http } = setup(() => page('x'));
  const refused = await failure(transport.text('https://evil.example/page'));
  assert.equal(refused.code, 'host_not_allowed');
  assert.equal(refused.host, 'evil.example');
  assert.equal((await failure(transport.text('not an address'))).code, 'bad_url');
  assert.equal(http.asked.length, 0);
});

test('native transport: a site that answers an error says which', async () => {
  const { transport } = setup(() => page('Just a moment...', 403));
  const error = await failure(transport.text(SERIES));
  assert.equal(error.code, 'upstream_status');
  assert.equal(error.upstreamStatus, 403);
  assert.equal(error.host, 'fanfox.net');
});

test('native transport: a network that fails is a timeout when it timed out, and a site out of reach otherwise', async () => {
  const slow = setup(() => Object.assign(new Error('failed to connect to /1.2.3.4 (port 443) after 30000ms'), { code: 'SocketTimeoutException' }));
  assert.equal((await failure(slow.transport.text(SERIES))).code, 'timeout');
  const down = setup(() => Object.assign(new Error('Unable to resolve host "fanfox.net"'), { code: 'UnknownHostException' }));
  assert.equal((await failure(down.transport.text(SERIES))).code, 'upstream_unreachable');
});

test('native transport: the last copy of a page stands in for a site that cannot be reached or refuses', async () => {
  let answer: Answer = page('<html>first', 200, {});
  const { transport } = setup(() => answer);
  await transport.text(SERIES);
  answer = new Error('offline');
  assert.deepEqual(await transport.text(SERIES), { text: '<html>first', url: SERIES });
  answer = page('Just a moment...', 403);
  assert.equal((await transport.text(SERIES)).text, '<html>first');
});

test('native transport: a one-off answer is not kept, so nothing stands in for it', async () => {
  let answer: Answer = page('token');
  const { transport, store } = setup(() => answer);
  await transport.text(SERIES, { cache: false });
  assert.equal(store.kept.size, 0);
  answer = new Error('offline');
  await failure(transport.text(SERIES, { cache: false }));
});

test('native transport: a page that is too large is refused', async () => {
  const { transport } = setup(() => page('x'.repeat(5 * 1024 * 1024 + 1)));
  assert.equal((await failure(transport.text(SERIES))).code, 'too_large');
});

test('native transport: a picture is downloaded once, with the Referer, and shown from a blob: address', async () => {
  const { transport, http, blobs } = setup(() => picture());
  assert.equal(await transport.imageSource(PICTURE), 'blob:test/1');
  assert.equal(await transport.imageSource(PICTURE), 'blob:test/1');
  assert.equal(http.asked.length, 1);
  assert.equal(http.asked[0]?.as, 'bytes');
  assert.equal(http.asked[0]?.headers['Referer'], REFERER);
  const [blob] = blobs.created;
  assert.equal(blob?.type, 'image/jpeg');
  assert.deepEqual([...new Uint8Array((await blob?.arrayBuffer()) ?? new ArrayBuffer(0))], [1, 2, 3]);
});

test('native transport: a picture already read is not downloaded again, even by a new transport', async () => {
  const first = setup(() => picture('image/png'));
  await first.transport.imageSource(PICTURE);
  const later = setup(() => new Error('offline'), new MemoryStore(), first.pictures);
  assert.equal(await later.transport.imageSource(PICTURE), 'blob:test/1');
  assert.equal(later.http.asked.length, 0);
  assert.equal(later.blobs.created[0]?.type, 'image/png');
});

test('native transport: a picture that cannot be had is left to the <img> to fail on, and is asked for again next time', async () => {
  let answer: Answer = page('', 404);
  const { transport, http } = setup(() => answer);
  assert.equal(await transport.imageSource(PICTURE), PICTURE);
  answer = picture();
  assert.equal(await transport.imageSource(PICTURE), 'blob:test/1');
  assert.equal(http.asked.length, 2);
});

test('native transport: what is not a picture is not shown as one', async () => {
  const { transport } = setup(() => picture('text/html'));
  assert.equal(await transport.imageSource(PICTURE), PICTURE);
});

test('native transport: the oldest picture addresses are let go past the limit, the newest are kept', async () => {
  const { transport, blobs } = setup(() => picture());
  const total = MAX_LIVE_IMAGES + 5;
  for (let i = 0; i < total; i++) await transport.imageSource(`${PICTURE}?n=${i}`);
  await settle();
  assert.deepEqual(blobs.revoked, [1, 2, 3, 4, 5].map((n) => `blob:test/${n}`));
  assert.equal(await transport.imageSource(`${PICTURE}?n=${total - 1}`), `blob:test/${total}`);
});

test('native transport: with no proxy to ask, it is healthy as long as the network is', async () => {
  assert.equal(await setup(() => page('x')).transport.isHealthy(), true);
});
