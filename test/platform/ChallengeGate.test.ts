import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HostPolicy } from '../../proxy/HostPolicy.ts';
import { TransportError } from '../../src/engine/index.ts';
import { ChallengeGate } from '../../src/platform/native/ChallengeGate.ts';
import { CredentialJar } from '../../src/platform/native/CredentialJar.ts';
import type { NativeRequest } from '../../src/platform/native/NativeHttp.ts';
import { NativeImages } from '../../src/platform/native/NativeImages.ts';
import { NativeTransport } from '../../src/platform/native/NativeTransport.ts';
import { SiteClient } from '../../src/platform/native/SiteClient.ts';
import { challenge, FakeBlobs, FakeFetcher, FakeHttp, MemoryStore, page, picture, settle } from './fakes.ts';
import type { Answer } from './fakes.ts';

const SERIES = 'https://fanfox.net/manga/moonlight_courier/';
const PICTURE = 'https://fmcdn.mfcdn.net/store/moonlight_courier/001.jpg';
const DIALOG = { statusLabel: 'Checking…', cancelLabel: 'Cancel' };

// The cookie a site's check hands out; a test changes it to have the site forget the ones it gave before.
const site = { cookie: 'cf_clearance=ok' };
const earned = (request: NativeRequest): boolean => request.headers['Cookie'] === site.cookie;

/** A WebView that shows the page it was asked for, with the cookie a site's check hands out. */
function setup(answer: (request: NativeRequest) => Answer, shown?: (url: string) => string) {
  let clock = 0;
  site.cookie = 'cf_clearance=ok';
  const http = new FakeHttp(answer);
  const fetcher = new FakeFetcher((url) => ({ html: '<html>shown', url: shown?.(url) ?? url, userAgent: 'webview', cookies: site.cookie }));
  const jar = new CredentialJar(() => clock);
  const gate = new ChallengeGate(new SiteClient(http, new HostPolicy(), jar), jar, fetcher, () => DIALOG);
  const store = new MemoryStore();
  const blobs = new FakeBlobs();
  const transport = new NativeTransport(gate, store, new NativeImages(gate, new MemoryStore(), blobs));
  return { http, fetcher, transport, store, blobs, later: (ms: number) => (clock += ms) };
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

test('gate: a page the phone is turned away from is passed by a WebView, then asked again with what it earned', async () => {
  const { transport, http, fetcher } = setup((request) => (earned(request) ? page('<html>raw') : challenge()));
  assert.deepEqual(await transport.text(SERIES), { text: '<html>raw', url: SERIES });
  assert.deepEqual(fetcher.asked, [{ url: SERIES, options: DIALOG }]);
  assert.equal(http.asked.length, 2);
  // The cookie is only good with the User-Agent of the browser that earned it.
  assert.equal(http.asked[1]?.headers['User-Agent'], 'webview');
  assert.equal(http.asked[0]?.headers['Cookie'], undefined);
});

test('gate: once through, the next pages of that site go with the cookie and need no WebView', async () => {
  const { transport, http, fetcher } = setup((request) => (earned(request) ? page('<html>raw') : challenge()));
  await transport.text(SERIES);
  await transport.text(`${SERIES}c001/`);
  assert.equal(fetcher.asked.length, 1);
  assert.equal(http.asked.length, 3);
});

test('gate: a clearance that runs out is earned again, and the page asked for again with the new one', async () => {
  const { transport, fetcher } = setup((request) => (earned(request) ? page('<html>raw') : challenge()));
  await transport.text(SERIES);
  site.cookie = 'cf_clearance=renewed';
  assert.equal((await transport.text(SERIES)).text, '<html>raw');
  assert.equal(fetcher.asked.length, 2);
  assert.equal((await transport.text(SERIES)).text, '<html>raw');
  assert.equal(fetcher.asked.length, 2);
});

test('gate: when the phone is still turned away with the cookie, the page is read from the WebView, each time', async () => {
  const { transport, fetcher } = setup(() => challenge());
  assert.deepEqual(await transport.text(SERIES), { text: '<html>shown', url: SERIES });
  await transport.text(SERIES);
  assert.equal(fetcher.asked.length, 2);
});

test('gate: the address the WebView ended on is reported when the app reads that site, and ignored when it does not', async () => {
  const moved = setup(() => challenge(), () => 'https://fanfox.net/manga/moved/');
  assert.equal((await moved.transport.text(SERIES)).url, 'https://fanfox.net/manga/moved/');
  const away = setup(() => challenge(), () => 'https://evil.example/steal');
  assert.equal((await away.transport.text(SERIES)).url, SERIES);
});

test('gate: what a host earned is not sent to another', async () => {
  const { transport, http } = setup((request) => (request.url.startsWith('https://fanfox.net/') && !earned(request) ? challenge() : picture()));
  await transport.text(SERIES);
  await transport.imageSource(PICTURE);
  const last = http.asked.at(-1);
  assert.equal(last?.url, PICTURE);
  assert.equal(last?.headers['Cookie'], undefined);
});

test('gate: requests turned away together share one WebView', async () => {
  const { transport, http, fetcher } = setup((request) => (earned(request) ? page('<html>raw') : challenge()));
  let release: () => void = () => undefined;
  fetcher.hold = new Promise((resolve) => (release = resolve));
  const reads = [1, 2, 3].map((n) => transport.text(`${SERIES}?n=${n}`));
  await settle();
  assert.equal(http.asked.length, 3, 'all three were turned away before the WebView answered');
  release();
  const answers = await Promise.all(reads);
  assert.deepEqual(answers.map((answer) => answer.text), ['<html>raw', '<html>raw', '<html>raw']);
  assert.equal(fetcher.asked.length, 1);
});

test('gate: a clearance the WebView already holds (from an earlier run) is used without showing the WebView', async () => {
  const { transport, http, fetcher } = setup((request) => (request.headers['Cookie'] === 'cf_clearance=earlier' ? page('<html>raw') : challenge()));
  fetcher.holding = { cookies: 'cf_clearance=earlier', userAgent: 'webview-of-earlier' };
  assert.deepEqual(await transport.text(SERIES), { text: '<html>raw', url: SERIES });
  assert.equal(fetcher.asked.length, 0, 'nothing was shown');
  assert.deepEqual(fetcher.heldAsked, [SERIES]);
  assert.equal(http.asked[1]?.headers['User-Agent'], 'webview-of-earlier');
  // It goes with the next requests too, with no further question to the WebView.
  await transport.text(`${SERIES}c001/`);
  assert.equal(fetcher.heldAsked.length, 1);
});

test('gate: a clearance the WebView holds that no longer works is not insisted on: the WebView is shown', async () => {
  const { transport, fetcher } = setup((request) => (earned(request) ? page('<html>raw') : challenge()));
  fetcher.holding = { cookies: 'cf_clearance=expired', userAgent: 'webview' };
  assert.equal((await transport.text(SERIES)).text, '<html>raw');
  assert.equal(fetcher.asked.length, 1);
});

test('gate: a picture whose clearance was only borrowed can still have the WebView shown for it', async () => {
  const { transport, fetcher } = setup((request) => (earned(request) ? picture() : challenge()));
  fetcher.holding = { cookies: 'cf_clearance=expired', userAgent: 'webview' };
  assert.equal(await transport.imageSource(PICTURE), 'blob:test/1');
  assert.deepEqual(fetcher.asked.map((asked) => asked.url), [PICTURE]);
});

test('gate: a WebView that is cancelled, or fails, is a human check that was not passed', async () => {
  const { transport, fetcher } = setup(() => challenge());
  fetcher.failure = new Error('Cancelled.');
  const error = await failure(transport.text(SERIES));
  assert.equal(error.code, 'blocked');
  assert.equal(error.host, 'fanfox.net');
});

test('gate: the last copy of a page stands in for a check that is not passed', async () => {
  let answer: Answer = page('<html>first');
  const { transport, fetcher } = setup(() => answer);
  await transport.text(SERIES);
  answer = challenge();
  fetcher.failure = new Error('Cancelled.');
  assert.equal((await transport.text(SERIES)).text, '<html>first');
});

test('gate: a refusal that is not a check goes to no WebView', async () => {
  const { transport, fetcher } = setup(() => page('Forbidden', 403));
  const error = await failure(transport.text(SERIES));
  assert.equal(error.code, 'upstream_status');
  assert.equal(error.upstreamStatus, 403);
  assert.equal(fetcher.asked.length, 0);
});

test('gate: a picture the phone is turned away from is earned in a WebView at its own address, then downloaded', async () => {
  const { transport, http, fetcher, blobs } = setup((request) => (earned(request) ? picture() : challenge()));
  assert.equal(await transport.imageSource(PICTURE), 'blob:test/1');
  assert.deepEqual(fetcher.asked, [{ url: PICTURE, options: DIALOG }]);
  assert.equal(http.asked[1]?.headers['Cookie'], site.cookie);
  assert.equal(blobs.created.length, 1);
});

test('gate: pictures that are still turned away right after a WebView do not open it again, until minutes have passed', async () => {
  const { transport, fetcher, later } = setup(() => challenge());
  // The <img> is left to fail by itself, as for any picture that cannot be had.
  assert.equal(await transport.imageSource(PICTURE), PICTURE);
  const other = `${PICTURE}?n=2`;
  assert.equal(await transport.imageSource(other), other);
  assert.equal(fetcher.asked.length, 1);
  later(6 * 60_000);
  await transport.imageSource(`${PICTURE}?n=3`);
  assert.equal(fetcher.asked.length, 2);
});

test('gate: a page read in the background is never shown in a WebView, but a clearance the WebView holds is used', async () => {
  const { transport, fetcher } = setup((request) => (earned(request) ? page('<html>raw') : challenge()));
  const refused = await failure(transport.text(SERIES, { background: true }));
  assert.equal(refused.code, 'blocked');
  assert.equal(fetcher.asked.length, 0, 'nothing was shown');

  const held = setup((request) => (request.headers['Cookie'] === 'cf_clearance=earlier' ? page('<html>raw') : challenge()));
  held.fetcher.holding = { cookies: 'cf_clearance=earlier', userAgent: 'webview-of-earlier' };
  assert.deepEqual(await held.transport.text(SERIES, { background: true }), { text: '<html>raw', url: SERIES });
  assert.equal(held.fetcher.asked.length, 0);
});
