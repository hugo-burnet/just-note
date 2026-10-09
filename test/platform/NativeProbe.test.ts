import assert from 'node:assert/strict';
import { test } from 'node:test';
import { USER_AGENT } from '../../proxy/UpstreamClient.ts';
import { TransportError } from '../../src/engine/index.ts';
import type { NativeHttp, NativeRequest, NativeResponse } from '../../src/platform/native/NativeHttp.ts';
import { NativeProbe } from '../../src/platform/native/NativeProbe.ts';
import { OpenPolicy } from '../../src/platform/native/OpenPolicy.ts';
import type { FetchedPage, PageFetcher } from '../../src/platform/native/PageFetcher.ts';
import { SiteClient } from '../../src/platform/native/SiteClient.ts';
import type { DialogLabels } from '../../src/platform/Platform.ts';

const HOME = 'https://m.example.test/?po';

class FakeHttp implements NativeHttp {
  readonly asked: NativeRequest[] = [];
  private readonly answer: (request: NativeRequest) => NativeResponse;

  constructor(answer: (request: NativeRequest) => NativeResponse) {
    this.answer = answer;
  }

  async get(request: NativeRequest): Promise<NativeResponse> {
    this.asked.push(request);
    return this.answer(request);
  }
}

class FakeFetcher implements PageFetcher {
  readonly asked: Array<{ url: string; labels: DialogLabels | undefined }> = [];
  private readonly page: FetchedPage | Error;

  constructor(page: FetchedPage | Error) {
    this.page = page;
  }

  async fetch(url: string, labels?: DialogLabels): Promise<FetchedPage> {
    this.asked.push({ url, labels });
    if (this.page instanceof Error) throw this.page;
    return this.page;
  }
}

const reply = (status: number, body: string, headers: Record<string, string> = {}): NativeResponse => ({ status, headers, body });
const passed: FetchedPage = { html: '<html><a href="/series/lantern">Lantern</a>', url: HOME, userAgent: 'webview', cookies: 'cf_clearance=x' };

function setup(answer: (request: NativeRequest) => NativeResponse, page: FetchedPage | Error = passed) {
  const http = new FakeHttp(answer);
  const fetcher = new FakeFetcher(page);
  return { http, fetcher, probe: new NativeProbe(new SiteClient(http, new OpenPolicy()), fetcher) };
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
  assert.deepEqual(fetcher.asked, [{ url: HOME, labels: { statusLabel: 'Checking…', cancelLabel: 'Cancel' } }]);
  assert.match(report, /via: a WebView/);
  assert.match(report, /own network answered: 403/);
  assert.match(report, /\/series\/lantern/);
  assert.doesNotMatch(report, /Just a moment/);
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
