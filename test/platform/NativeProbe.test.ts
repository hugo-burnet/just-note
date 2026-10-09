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
  const { probe, fetcher } = setup(challenged, reader({ pictures: [{ type: 'image/jpeg', data: jpeg }, { type: '', data: webp }], note: 'pictures 2, places 2, page height 3000' }));
  const report = await probe.fetch(HOME, { statusLabel: 'Checking…', readingLabel: 'Loading…', cancelLabel: 'Cancel' });
  assert.equal(fetcher.asked.length, 2);
  assert.deepEqual(fetcher.asked[1]?.options, { statusLabel: 'Checking…', readingLabel: 'Loading…', cancelLabel: 'Cancel', pictures: 'img[src^="blob:"]', slots: '[data-page]' });
  assert.match(report, /--- pictures the reader script collected \(2, \d+ KB in all\)\nit found: pictures 2, places 2, page height 3000\n1: image\/jpeg, really image\/jpeg, 2 KB\n2: \(no type\), really image\/webp, 0 KB\n/);
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

test('probe: what the page requested of the other hosts of its site is asked for again, with the cookie, and the first bytes of each answer are in the report', async () => {
  const requests = [
    'GET https://data.example.test/n/series/12/34/p001.jpg',
    'GET https://data.example.test/n/series/12/34/p002.jpg',
    'GET https://api.example.test/chapter/12.json',
    'GET https://static.example.test/img/cover.jpg',
    'GET https://data.example.test/css/site.css?v=2',
    'GET https://ads.other.test/pixel.gif',
    'POST https://api.example.test/log',
  ];
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1]).toString('base64');
  const { probe, http } = setup(
    (request) => {
      if (!request.headers['Cookie']) return challenged();
      if (request.url.endsWith('.json')) return reply(200, '{"chapter":12}', { 'content-type': 'application/json' });
      return request.url.includes('data.example.test') ? reply(200, jpeg, { 'content-type': 'image/jpeg' }) : reply(200, '<html>');
    },
    { ...passed, requests },
  );
  const report = await probe.fetch(HOME);
  assert.ok(
    report.includes(
      [
        "--- the phone's own network, asked for what the page requested of its site (2)",
        '200 image/jpeg, 0 KB, starts with ffd8ffe000104a46 ......JFIF..',
        'https://data.example.test/n/series/12/34/p001.jpg',
        '200 application/json, 0 KB, starts with 7b22636861707465 {"chapter":12}',
        'https://api.example.test/chapter/12.json',
      ].join('\n'),
    ),
    report,
  );
  const asked = http.asked.map((request) => request.url);
  assert.ok(asked.includes('https://data.example.test/n/series/12/34/p001.jpg'));
  assert.ok(!asked.some((address) => /static\.|\.css|ads\.other|p002/.test(address)), asked.join(' '));
  // As the page's own scripts would, with the Referer of its site and the cookie the WebView earned.
  const tried = http.asked.find((request) => request.url.includes('p001'));
  assert.equal(tried?.headers['Referer'], 'https://m.example.test/');
  assert.equal(tried?.headers['Cookie'], 'cf_clearance=x');
});

const PICTURE = 'https://data.example.test/n/series/12/34/mobile/1_34a98a05ca97ad8e145f1713180df903.jpg';
const dataRequests = [`GET ${PICTURE}`, 'GET https://data.example.test/n/series/12/34/mobile/2_ffffffffffffffffffffffffffffffff.jpg'];

test('probe: the first picture is asked for with each thing a server may want to see, and what each was answered is in the report', async () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]).toString('base64');
  const { probe, http } = setup(
    (request) => {
      if (!request.headers['Cookie']) return challenged();
      if (!request.url.includes('data.example.test')) return reply(200, '<html>raw page');
      // This server wants an Origin; without one it answers with an error page, which is text, not base64.
      return request.headers['Origin'] ? reply(200, jpeg, { 'content-type': 'image/jpeg' }) : reply(403, '<html>Forbidden', { 'content-type': 'text/html' });
    },
    { ...passed, requests: dataRequests },
  );
  const report = await probe.fetch(HOME);
  const lines = report.split('\n');
  const at = lines.indexOf('--- the first picture, asked for with what a server may want to see');
  assert.ok(at > 0, report);
  assert.deepEqual(lines.slice(at + 1, at + 5), [
    'Referer: the site: 403 text/html, 0 KB, starts with 3c68746d6c3e466f <html>Forbidden',
    'Referer: the site, Origin: the site: 200 image/jpeg, 0 KB, starts with ffd8ffe000104a46 ......JF',
    'Referer: the page, Origin: the site: 200 image/jpeg, 0 KB, starts with ffd8ffe000104a46 ......JF',
    'no Referer: 403 text/html, 0 KB, starts with 3c68746d6c3e466f <html>Forbidden',
  ]);
  // The variants really differ on the wire.
  const sent = http.asked.filter((request) => request.url === PICTURE).map((request) => [request.headers['Origin'], request.headers['Referer']]);
  assert.deepEqual(sent.slice(1), [
    [undefined, 'https://m.example.test/'],
    ['https://m.example.test', 'https://m.example.test/'],
    ['https://m.example.test', HOME],
    [undefined, ''],
  ]);
});

test('probe: it says whether the name of the first picture is written in the page, as the WebView shows it and as the phone reads it', async () => {
  const withName = { ...passed, html: `<html><script>var pages = ["1_34a98a05ca97ad8e145f1713180df903", "2_ffff"]</script>`, requests: dataRequests };
  const phoneReads = (request: NativeRequest): NativeResponse => (request.headers['Cookie'] ? reply(200, '<html>no list here') : challenged());
  const { probe } = setup(phoneReads, withName);
  const report = await probe.fetch(HOME);
  assert.match(report, /--- is the name of the first picture \(1_34a98a05ca97ad8e145f1713180df903\) written in the page\?\nas the WebView shows it: yes, around: .*var pages = \["1_34a98a05ca97ad8e145f1713180df903", "2_ffff"\].*\nas the phone reads it: no\n/);
});

test('probe: an error page where a picture was expected is reported with its status, not lost', async () => {
  const { probe } = setup((request) => (request.headers['Cookie'] ? reply(404, 'Not found') : challenged()), { ...passed, requests: dataRequests });
  const report = await probe.fetch(HOME);
  assert.match(report, /\n404 \(no type\), 0 KB, starts with 4e6f7420666f756e Not found\n/);
  assert.doesNotMatch(report, /no answer/);
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
