import assert from 'node:assert/strict';
import { test } from 'node:test';
import { USER_AGENT } from '../../proxy/UpstreamClient.ts';
import { TransportError } from '../../src/engine/index.ts';
import type { NativeRequest, NativeResponse } from '../../src/platform/native/NativeHttp.ts';
import { NativeProbe } from '../../src/platform/native/NativeProbe.ts';
import type { FetchedPage } from '../../src/platform/native/PageFetcher.ts';
import { FakeFetcher, FakeHttp } from './fakes.ts';

const HOME = 'https://m.example.test/?po';

const reply = (status: number, body: string, headers: Record<string, string> = {}): NativeResponse => ({ status, headers, body });
const passed: FetchedPage = { html: '<html><a href="/series/lantern">Lantern</a>', url: HOME, userAgent: 'webview', cookies: 'cf_clearance=x' };

function setup(answer: (request: NativeRequest) => NativeResponse, shown: FetchedPage | Error = passed) {
  const http = new FakeHttp(answer);
  const fetcher = new FakeFetcher(() => (shown instanceof Error ? passed : shown));
  if (shown instanceof Error) fetcher.failure = shown;
  return { http, fetcher, probe: new NativeProbe(http, fetcher) };
}

test('probe: a site that answers is reported as the phone saw it, and no WebView is opened', async () => {
  const { probe, http, fetcher } = setup(() => reply(200, '<html><a href="/series/ember">Ember</a>'));
  const report = await probe.fetch(HOME);
  assert.match(report, /via: the phone's own network/);
  assert.match(report, /\/series\/ember/);
  assert.equal(fetcher.asked.length, 0);
  assert.equal(http.asked[0]?.headers['Referer'], 'https://m.example.test/');
  assert.equal(http.asked[0]?.headers['User-Agent'], USER_AGENT);
});

test('probe: any host is fine, an http address is asked for over https', async () => {
  const { probe, http } = setup(() => reply(200, 'x'));
  await probe.fetch('http://anything.example.test/page');
  assert.equal(http.asked[0]?.url, 'https://anything.example.test/page');
});

test('probe: a check that turns the phone away is passed by a WebView, which the report says', async () => {
  const { probe, fetcher } = setup(() => reply(403, '<title>Just a moment...</title>', { 'cf-mitigated': 'challenge' }));
  const report = await probe.fetch(HOME, { statusLabel: 'Checking…', cancelLabel: 'Cancel' });
  // The words are the app's; the page is given a few seconds and scrolled, as a reader would be.
  assert.deepEqual(fetcher.asked, [{ url: HOME, options: { settleMs: 3000, scroll: true, statusLabel: 'Checking…', cancelLabel: 'Cancel' } }]);
  assert.match(report, /via: a WebView/);
  assert.match(report, /own network answered: 403/);
  assert.match(report, /\/series\/lantern/);
  assert.doesNotMatch(report, /Just a moment/);
});

const challenged = (): NativeResponse => reply(403, '<title>Just a moment...</title>', { 'cf-mitigated': 'challenge' });

test('probe: after the WebView, the phone asks once more with what the WebView earned, and the report says how it was answered', async () => {
  const { probe, http } = setup((request) => (request.headers['Cookie'] ? reply(200, '<html>raw') : challenged()));
  const report = await probe.fetch(HOME);
  assert.match(report, /own network answered: 403\nwith the cookie the WebView earned, it is answered: 200\n/);
  // The cookie goes with the User-Agent the WebView had: a clearance is only good for the browser that earned it.
  const [first, again] = http.asked;
  assert.equal(first?.headers['Cookie'], undefined);
  assert.equal(again?.headers['Cookie'], 'cf_clearance=x');
  assert.equal(again?.headers['User-Agent'], 'webview');
});

test('probe: a site that turns the phone away even with the cookie says so', async () => {
  const { probe } = setup(challenged);
  assert.match(await probe.fetch(HOME), /with the cookie the WebView earned, it is answered: 403, the check again\n/);
  const down = setup((request) => {
    if (request.headers['Cookie']) throw Object.assign(new Error('boom'), { code: 'UnknownHostException' });
    return challenged();
  });
  assert.match(await down.probe.fetch(HOME), /it is answered: no answer \(upstream_unreachable\)\n/);
});

test('probe: every look starts from nothing: what an earlier one earned is not carried over', async () => {
  const { probe, http } = setup((request) => (request.headers['Cookie'] ? reply(200, '<html>raw') : challenged()));
  await probe.fetch(HOME);
  await probe.fetch(HOME);
  assert.deepEqual(http.asked.map((request) => request.headers['Cookie']), [undefined, 'cf_clearance=x', undefined, 'cf_clearance=x']);
});

test('probe: what the page asked for while it loaded, and what failed, is in the report', async () => {
  const requests = ['GET https://m.example.test/api/chapter/5.json', 'GET https://static.example.test/img/page/1.jpg', 'GET https://ads.other.test/pixel.gif'];
  const { probe } = setup(challenged, { ...passed, requests, failures: ['403 https://static.example.test/img/page/2.jpg'] });
  const report = await probe.fetch(HOME);
  assert.match(report, /--- requests the page made \(3\)\n1x GET m\.example\.test\/api\/chapter {3}e\.g\. https:\/\/m\.example\.test\/api\/chapter\/5\.json\n/);
  assert.match(report, /--- answered with an error \(1\)\n403 https:\/\/static\.example\.test\/img\/page\/2\.jpg\n/);
});

const reader = (extra: Partial<FetchedPage> = {}): FetchedPage => ({ ...passed, html: '<html><img class="page" src="blob:https://m.example.test/1f6c">', ...extra });

test('probe: a page that shows blob: pictures is looked at once more with the script that takes them, and the report says what it took', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...new Array<number>(2000).fill(7)]).toString('base64');
  const webp = Buffer.from(['R', 'I', 'F', 'F'].map((c) => c.charCodeAt(0)).concat([1, 0, 0, 0], ['W', 'E', 'B', 'P'].map((c) => c.charCodeAt(0)), [1, 2, 3])).toString('base64');
  const { probe, fetcher } = setup(challenged, reader({ pictures: [{ type: 'image/jpeg', data: jpeg }, { type: '', data: webp }] }));
  const report = await probe.fetch(HOME, { statusLabel: 'Checking…', readingLabel: 'Loading…', cancelLabel: 'Cancel' });
  assert.equal(fetcher.asked.length, 2);
  assert.deepEqual(fetcher.asked[1]?.options, { statusLabel: 'Checking…', readingLabel: 'Loading…', cancelLabel: 'Cancel', pictures: 'img[src^="blob:"]' });
  assert.match(report, /--- pictures the reader script collected \(2, \d+ KB in all\)\n1: image\/jpeg, really image\/jpeg, 2 KB\n2: \(no type\), really image\/webp, 0 KB\n/);
});

test('probe: a script that finds nothing, or fails, is a line of the report, not a failure of it', async () => {
  const none = setup(challenged, reader({ pictures: [] }));
  assert.match(await none.probe.fetch(HOME), /--- pictures the reader script collected \(0, 0 KB in all\)\n/);
  const { probe, fetcher } = setup(challenged, reader());
  const asked = fetcher.fetch.bind(fetcher);
  fetcher.fetch = async (url, options) => {
    if (options?.pictures) throw Object.assign(new Error('A picture did not load (1 of 2).'), { code: 'pictures' });
    return asked(url, options);
  };
  assert.match(await probe.fetch(HOME), /--- pictures the reader script collected: failed \(pictures: A picture did not load \(1 of 2\)\.\)\n/);
});

test('probe: a page without blob: pictures is not looked at twice', async () => {
  const { probe, fetcher } = setup(challenged);
  const report = await probe.fetch(HOME);
  assert.equal(fetcher.asked.length, 1);
  assert.doesNotMatch(report, /reader script/);
});

test('probe: what the caller asks of the WebView wins over what the probe would ask', async () => {
  const { probe, fetcher } = setup(() => reply(403, '', { 'cf-mitigated': 'challenge' }));
  await probe.fetch(HOME, { settleMs: 0, scroll: false });
  assert.deepEqual(fetcher.asked[0]?.options, { settleMs: 0, scroll: false });
});

test('probe: a plain refusal is reported as it is, with no WebView', async () => {
  const { probe, fetcher } = setup(() => reply(404, '<html>Gone'));
  const report = await probe.fetch(HOME);
  assert.match(report, /answered: 404/);
  assert.match(report, /Gone/);
  assert.equal(fetcher.asked.length, 0);
});

test('probe: redirects are followed to the page that answers', async () => {
  const { probe, http } = setup((request) => (request.url === HOME ? reply(302, '', { location: '/moved' }) : reply(200, '<html>moved')));
  const report = await probe.fetch(HOME);
  assert.match(report, /address: https:\/\/m\.example\.test\/moved/);
  assert.equal(http.asked.length, 2);
});

test('probe: a WebView that gives up, or an address that is no address, is an error to show', async () => {
  const blocked = setup(() => reply(403, '', { 'cf-mitigated': 'challenge' }), new Error('Cancelled.'));
  await assert.rejects(blocked.probe.fetch(HOME), /Cancelled\./);
  const { probe, http } = setup(() => reply(200, 'x'));
  for (const bad of ['not an address', 'ftp://example.test/file']) {
    await assert.rejects(probe.fetch(bad), (error: unknown) => error instanceof TransportError && error.code === 'bad_url');
  }
  assert.equal(http.asked.length, 0);
});
