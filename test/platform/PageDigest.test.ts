import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digest } from '../../src/platform/native/PageDigest.ts';
import type { DigestSource } from '../../src/platform/native/PageDigest.ts';

// A made-up page shaped like a listing: cards that link to series, a few chapters, a menu, and a script.
const BODY = [
  '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Made-up reader - latest</title>',
  '<link rel="canonical" href="https://m.example.test/">',
  '<meta property="og:title" content="Made-up reader"><meta property="og:image" content="https://static.example.test/logo.png">',
  '<meta name="description" content="A site that does not exist.">',
  '<script src="https://cdn.example.test/lib/pako.min.js"></script><script async src="https://cdn.example.test/ads.js"></script>',
  '<script>var chapter = {"pages": ["https:\\/\\/img.example.test\\/c1\\/001.webp?t=1", "https:\\/\\/img.example.test\\/c1\\/002.webp"]};</script>',
  '<script>x=1</script></head>',
  '<body class="dark"><nav><a href="/menu/top-1.html">Top</a> <a href="#">up</a> <a href="javascript:void(0)">x</a></nav>',
  '<div class="card"><a href="/101/Lantern-Keeper.html"><img src="https://static.example.test/cover/lantern.jpg" alt=""><b class="t">Lantern Keeper</b></a></div>',
  '<div class="card"><a href="/102/Ember-Courier.html"><img data-src="https://static.example.test/cover/ember.png"><b class="t">Ember Courier</b></a></div>',
  '<div class="card"><a href="/101/Lantern-Keeper.html">again</a></div>',
  '<li><a href=\'/read/Lantern-Keeper-Chapter-7_9001.html\'>7</a></li><li><a href="/read/Ember-Courier-Chapter-2_9002.html">2</a></li>',
  '<a href="https://other.example.test/about">about</a></body></html>',
].join('\n');

const source: DigestSource = { via: 'phone', status: 200, url: 'https://m.example.test/?po', body: BODY };

test('digest: says how the page was reached, and what it is', () => {
  const report = digest(source);
  assert.match(report, /^Just Read page report\nvia: the phone's own network\n/);
  assert.match(report, /own network answered: 200\naddress: https:\/\/m\.example\.test\/\?po\nsize: \d+ characters\n/);
  assert.match(digest({ ...source, via: 'webview', status: 403 }), /via: a WebView.*\n.*answered: 403/);
});

test('digest: the head says what the page says of itself', () => {
  const report = digest(source);
  assert.match(report, /--- head\ntitle: Made-up reader - latest\ncanonical: https:\/\/m\.example\.test\/\nog:title: Made-up reader\n/);
  assert.match(report, /og:image: https:\/\/static\.example\.test\/logo\.png\ndescription: A site that does not exist\.\n/);
});

test('digest: the links are grouped by kind, most numerous first, each with examples', () => {
  const report = digest(source);
  assert.match(report, /--- link shapes \(9 links, 6 shapes\)\n/);
  assert.match(report, /^2x \/# {3}e\.g\. \/101\/Lantern-Keeper\.html {2}\| {2}\/102\/Ember-Courier\.html$/m);
  assert.match(report, /^2x \/read {3}e\.g\. \/read\/Lantern-Keeper-Chapter-7_9001\.html/m);
  assert.match(report, /^1x other\.example\.test\/about {3}e\.g\. https:\/\/other\.example\.test\/about$/m);
  assert.match(report, /^2x \(not a page\) {3}e\.g\. # {2}\| {2}javascript:void\(0\)$/m);
});

test('digest: the markup around the first link of a common kind shows how its list is laid out', () => {
  const report = digest(source);
  assert.match(report, /--- markup around the first \/# link\n/);
  assert.match(report, /<div class="card"><a href="\/101\/Lantern-Keeper\.html"><img src="https:\/\/static\.example\.test\/cover\/lantern\.jpg" alt=""><b class="t">Lantern Keeper<\/b>/);
  // A kind with a single link has no list to show.
  assert.doesNotMatch(report, /markup around the first other\.example\.test/);
});

test('digest: the scripts it loads, and the first words of the ones it carries', () => {
  const report = digest(source);
  assert.match(report, /--- scripts \(2 external, 1 inline\)\nhttps:\/\/cdn\.example\.test\/lib\/pako\.min\.js\nhttps:\/\/cdn\.example\.test\/ads\.js\ninline: var chapter = \{"pages"/);
  assert.doesNotMatch(report, /inline: x=1/);
});

test('digest: the pictures a script names are found, with their slashes put right', () => {
  const report = digest(source);
  assert.match(report, /--- pictures named \(\d+\)\n/);
  assert.match(report, /^https:\/\/img\.example\.test\/c1\/001\.webp\?t=1$/m);
  assert.match(report, /^https:\/\/img\.example\.test\/c1\/002\.webp$/m);
  assert.match(report, /^https:\/\/static\.example\.test\/cover\/ember\.png$/m);
});

test('digest: the <img> tags are counted and the first ones quoted, with their lazy attributes', () => {
  const report = digest(source);
  assert.match(report, /--- elements: a=\d+ img=2 blob-img=0 canvas=0 iframe=0 video=0 form=0\n/);
  assert.match(report, /--- first <img> tags \(2 in all\)\n<img src="https:\/\/static\.example\.test\/cover\/lantern\.jpg" alt="">\n<img data-src="https:\/\/static\.example\.test\/cover\/ember\.png">\n/);
});

// A chapter page: a reader that fills in its pictures once it has built them, and a synopsis in the body.
const READER = [
  '<html><head><title>Lantern Keeper » Chapter 7</title><meta property="og:description" content="Mara keeps the last lantern of a city that no longer sleeps, and learns why it must never go out...">',
  '</head><body class="lel"><nav>menu</nav>',
  '<div class="synopsis"><p>Mara keeps the last lantern of a city that no longer sleeps, and learns why it must never go out, even for a night.</p></div>',
  '<div id="strip"><div class="slot" data-n="1"><img class="page" src="blob:https://m.example.test/1f6c-aaaa" data-n="1"></div>',
  '<div class="slot" data-n="2"><img class="page" data-n="2"></div><canvas id="zoom" width="10" height="10"></canvas></div></body></html>',
].join('\n');

test('digest: a reader that builds its pictures shows them as blob: addresses, counted and quoted, with its canvas', () => {
  const report = digest({ ...source, body: READER });
  assert.match(report, /--- elements: a=0 img=2 blob-img=1 canvas=1 /);
  assert.match(report, /--- markup around the first blob: picture\n.*<div class="slot" data-n="1"><img class="page" src="blob:https:\/\/m\.example\.test\/1f6c-aaaa" data-n="1"><\/div>/s);
  assert.match(report, /--- markup around the first <canvas>\n.*<canvas id="zoom" width="10" height="10"><\/canvas>/s);
});

test('digest: the synopsis is found in the body by the first words of the description, and the head quotes it', () => {
  const report = digest({ ...source, body: READER });
  assert.match(report, /og:description: Mara keeps the last lantern.*\.\.\.\n/);
  assert.match(report, /--- markup around the text of the description\n.*<div class="synopsis"><p>Mara keeps the last lantern/s);
});

test('digest: a reader that is given its pages in a script has the start of that list quoted, with the slashes put right', () => {
  const pages = [1, 2, 3, 4].map((n) => `"https:\\/\\/c.example.test\\/uploads97\\/Ch-0${n}.webp"`).join(',');
  const body = `<html><head><title>Chapter</title></head><body><script>var a = 1; ts_reader.run({"post_id":7,"sources":[{"source":"Server 1","images":[${pages}]}]});</script></body></html>`;
  const report = digest({ ...source, body });
  assert.match(report, /--- the first script that lists pictures, around the first\n.*"images":\["https:\/\/c\.example\.test\/uploads97\/Ch-01\.webp","https:\/\/c\.example\.test\/uploads97\/Ch-02\.webp"/s);
  // Two pictures named in a script are not a list.
  assert.doesNotMatch(digest(source), /the first script that lists pictures/);
});

test('digest: a page without those has none of those windows', () => {
  const report = digest(source);
  assert.doesNotMatch(report, /markup around the first blob|markup around the first <canvas>|markup around the text of the description/);
  assert.doesNotMatch(report, /--- requests|--- answered with an error|with the cookie/);
});

test('digest: what the phone is answered with the WebView\'s cookie is said, next to what it was answered without', () => {
  const report = digest({ ...source, via: 'webview', status: 403, withCookie: '200' });
  assert.match(report, /own network answered: 403\nwith the cookie the WebView earned, it is answered: 200\naddress: /);
});

test('digest: the requests of a page are grouped by kind, the site\'s own first, and the failed ones listed', () => {
  const requests = [
    'GET https://ads.other.test/pixel.gif?x=1',
    'GET https://ads.other.test/pixel.gif?x=2',
    'GET https://static.example.test/img/page/001.jpg',
    'GET https://static.example.test/img/page/002.jpg',
    'GET https://static.example.test/img/page/003.jpg',
    'POST https://m.example.test/api/lel/576336.json',
    'GET https://m.example.test/api/lel/576337.json',
  ];
  const report = digest({ ...source, requests, failures: ['403 https://static.example.test/img/page/004.jpg', '404 https://m.example.test/favicon.ico'] });
  const lines = report.split('\n');
  const at = lines.indexOf('--- requests the page made (7)');
  assert.ok(at > 0, 'the section is there');
  assert.deepEqual(lines.slice(at + 1, at + 5), [
    '3x GET static.example.test/img/page   e.g. https://static.example.test/img/page/001.jpg',
    '1x GET m.example.test/api/lel   e.g. https://m.example.test/api/lel/576337.json',
    '1x POST m.example.test/api/lel   e.g. https://m.example.test/api/lel/576336.json',
    '2x GET ads.other.test/pixel.gif?…   e.g. https://ads.other.test/pixel.gif?x=1',
  ]);
  assert.match(report, /--- answered with an error \(2\)\n403 https:\/\/static\.example\.test\/img\/page\/004\.jpg\n404 /);
});

test('digest: the body is quoted from <body, not from the head, folded to the width of a screen', () => {
  const report = digest({ ...source, body: `<head><title>t</title></head><body>${'a'.repeat(500)}</body>` });
  const lines = report.split('\n');
  const rows = lines.slice(lines.findIndex((line) => line.startsWith('--- body')) + 1);
  assert.deepEqual(rows.map((row) => row.length), [220, 220, 73]);
  assert.equal(rows[0], `<body>${'a'.repeat(214)}`);
  assert.equal(rows[2], `${'a'.repeat(66)}</body>`);
});

test('digest: a page of any size stays short enough to paste', () => {
  const cards = Array.from({ length: 400 }, (_, i) => `<div><a href="/${i}-${i * 7}/Series-Number-${i}-With-A-Long-Name-To-Take-Room.html"><img src="https://static.example.test/c/${i}.jpg"><b>S${i}</b></a></div>`);
  const chapters = Array.from({ length: 300 }, (_, i) => `<a href="/read/Series-Chapter-${i}_${i + 5000}.html">${i}</a>`);
  const page = `<html><head><title>big</title></head><body>${cards.join('\n')}${chapters.join('')}</body></html>`;
  assert.ok(page.length > 60_000);
  const report = digest({ ...source, body: page });
  assert.ok(report.length < 12_000, `${report.length} characters`);
  assert.match(report, /--- link shapes \(700 links, 2 shapes\)\n400x \/#-#/);
});

test('digest: a page that made hundreds of requests still stays short enough to paste', () => {
  const requests = Array.from({ length: 600 }, (_, i) => `GET https://host${i % 40}.example.test/folder${i % 7}/sub${i % 5}/file${i}.js`);
  const report = digest({ ...source, requests, failures: requests.slice(0, 50).map((request) => `403 ${request.slice(4)}`) });
  assert.ok(report.length < 9_000, `${report.length} characters`);
});

test('digest: an empty page still gives a report', () => {
  const report = digest({ ...source, body: '' });
  assert.match(report, /size: 0 characters/);
  assert.match(report, /--- link shapes \(0 links, 0 shapes\)\n--- scripts \(0 external, 0 inline\)\n--- pictures named \(0\)\n--- first <img> tags \(0 in all\)\n--- body/);
});
