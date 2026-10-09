import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HostPolicy } from '../../src/platform/native/HostPolicy.ts';
import { SITES } from '../../src/engine/index.ts';
import { FakeTransport, LinkedomParser } from './helpers.ts';

// What every site module has to satisfy, whatever the site. A new module is not done
// until it has an entry in SAMPLES and passes: nothing else in this file changes.
const SAMPLES: Readonly<Record<string, { series: string; chapter: string }>> = {
  fanfox: {
    series: 'https://fanfox.net/manga/moonlight_courier/',
    chapter: 'https://fanfox.net/manga/moonlight_courier/c002/1.html',
  },
  webtoon: {
    series: 'https://www.webtoons.com/en/fantasy/lantern-keeper/list?title_no=5001',
    chapter: 'https://www.webtoons.com/en/fantasy/lantern-keeper/ep-2/viewer?title_no=5001&episode_no=2',
  },
  lelscan: {
    series: 'https://lelscans.net/lecture-ligne-lanterne-des-marees.php',
    chapter: 'https://lelscans.net/scan-lanterne-des-marees/2.5/3',
  },
  scanmanga: {
    series: 'https://www.scan-manga.com/13001/Lantern-Keeper.html',
    // The address this source gives a chapter carries its series after the #.
    chapter: 'https://m.scan-manga.com/lecture-en-ligne/Lantern-Keeper-Chapitre-2-5-FR_130012.html#/13001/Lantern-Keeper.html',
  },
  sushiscan: {
    series: 'https://sushiscan.net/catalogue/lantern-keeper/',
    // The address this source gives a chapter carries its series after the #.
    chapter: 'https://sushiscan.net/lantern-keeper-chapitre-2-5/#/catalogue/lantern-keeper/',
  },
  demonicscans: {
    series: 'https://demonicscans.org/manga/Lantern-Keeper',
    // The address this source gives a chapter carries its series after the #.
    chapter: 'https://demonicscans.org/title/Lantern-Keeper/chapter/2.5/1#/manga/Lantern-Keeper',
  },
};

const io = { transport: new FakeTransport({}), parser: new LinkedomParser() };
const policy = new HostPolicy();
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const within = (host: string, domain: string): boolean => host === domain || host.endsWith(`.${domain}`);
const hostIn = (url: string, hosts: readonly string[]): boolean => hosts.some((domain) => within(new URL(url).hostname, domain));

test('sites: every module has its samples here, and no sample belongs to a module that is gone', () => {
  assert.deepEqual(Object.keys(SAMPLES).sort(), SITES.map((site) => site.id).sort());
});

test('sites: identities are well formed and distinct, and no host belongs to two sites', () => {
  assert.equal(new Set(SITES.map((site) => site.id)).size, SITES.length, 'ids are unique');
  for (const site of SITES) {
    assert.match(site.id, /^[a-z0-9-]+$/, site.id);
    assert.notEqual(site.name.trim(), '', `${site.id} has a name`);
    assert.ok(site.hosts.length > 0, `${site.id} has hosts`);
    for (const host of site.hosts) assert.match(host, DOMAIN, `${site.id}: ${host}`);
  }
  for (const a of SITES) {
    for (const b of SITES) {
      if (a === b) continue;
      for (const x of a.hosts) for (const y of b.hosts) assert.ok(!within(x, y), `${a.id}: ${x} is also covered by ${b.id}: ${y}`);
    }
  }
});

test('sites: the Referer is a page of the site itself, over https', () => {
  for (const site of SITES) {
    assert.equal(new URL(site.referer).protocol, 'https:', site.id);
    assert.ok(hostIn(site.referer, site.hosts), `${site.id}: ${site.referer}`);
  }
});

test('sites: the source a module makes is the one it describes, and starts from its own pages', () => {
  for (const site of SITES) {
    const source = site.create(io);
    assert.equal(source.id, site.id);
    assert.equal(source.name, site.name);
    assert.ok(hostIn(source.home(), site.hosts), `${site.id}: home ${source.home()}`);
    assert.ok(hostIn(source.searchUrl('some words'), site.hosts), `${site.id}: search ${source.searchUrl('some words')}`);
    assert.equal(source.resolve(source.home())?.kind, 'list', `${site.id}: its home page lists series`);
  }
});

test('sites: a source says which languages it publishes in, and browses in each of them', () => {
  for (const site of SITES) {
    const source = site.create(io);
    assert.ok(source.languages.length > 0, `${site.id} has a language`);
    assert.equal(new Set(source.languages).size, source.languages.length, `${site.id}: languages are distinct`);
    for (const language of source.languages) {
      assert.match(language, /^[a-z]{2,3}(-[a-z]+)?$/, `${site.id}: ${language}`);
      assert.equal(source.languageFor(language), language);
      const home = source.home(language);
      assert.ok(hostIn(home, site.hosts), `${site.id}: home in ${language}: ${home}`);
      assert.equal(source.resolve(home)?.kind, 'list', `${site.id}: its home in ${language} lists series`);
      assert.ok(hostIn(source.searchUrl('some words', language), site.hosts), `${site.id}: search in ${language}`);
    }
    // A language the site does not have is not an error: the site's own is used.
    assert.equal(source.languageFor('xx'), source.languages[0]);
    assert.equal(source.home('xx'), source.home(), `${site.id}: home in a language it has not`);
    assert.equal(source.searchUrl('words', 'xx'), source.searchUrl('words'), `${site.id}: search in a language it has not`);
  }
});

test('sites: a source says how it is meant to be read', () => {
  for (const site of SITES) {
    const { mode, rtl } = site.create(io).reading;
    assert.ok(mode === 'scroll' || mode === 'paged', `${site.id}: mode ${String(mode)}`);
    assert.equal(typeof rtl, 'boolean', `${site.id}: direction`);
  }
});

test('sites: its links are recognised, in one canonical form, and a chapter knows its series', () => {
  for (const site of SITES) {
    const source = site.create(io);
    const sample = SAMPLES[site.id];
    assert.ok(sample, `${site.id} has samples`);

    const series = source.resolve(sample.series);
    assert.equal(series?.kind, 'series', `${site.id}: series`);
    assert.ok(series && hostIn(series.url, site.hosts));
    assert.equal(source.resolve(series.url)?.url, series.url, `${site.id}: the canonical address of a series stays itself`);

    const chapter = source.resolve(sample.chapter);
    assert.equal(chapter?.kind, 'chapter', `${site.id}: chapter`);
    assert.ok(chapter?.key, `${site.id}: a chapter has a key`);
    assert.ok(chapter && hostIn(chapter.url, site.hosts));
    assert.equal(source.resolve(chapter.url)?.url, chapter.url, `${site.id}: the canonical address of a chapter stays itself`);
    const parent = chapter.seriesUrl ? source.resolve(chapter.seriesUrl) : null;
    assert.equal(parent?.kind, 'series', `${site.id}: the series of a chapter is a series`);
    assert.equal(parent?.url, chapter.seriesUrl);
  }
});

test('sites: a source claims nothing that is not its own', () => {
  for (const site of SITES) {
    const source = site.create(io);
    assert.equal(source.resolve('https://example.com/manga/x/'), null, site.id);
    for (const other of SITES) {
      if (other === site) continue;
      const sample = SAMPLES[other.id];
      assert.equal(source.resolve(sample?.series ?? ''), null, `${site.id} must not claim ${other.id}'s series`);
      assert.equal(source.resolve(sample?.chapter ?? ''), null, `${site.id} must not claim ${other.id}'s chapter`);
    }
  }
});

test('sites: the app may reach everything a site reads, and sends the site\'s Referer', () => {
  for (const site of SITES) {
    const source = site.create(io);
    const sample = SAMPLES[site.id];
    const browsing = source.languages.flatMap((language) => [source.home(language), source.searchUrl('x', language)]);
    for (const url of [...browsing, sample?.series ?? '', sample?.chapter ?? '']) {
      const target = policy.parse(url);
      assert.equal(target.site.id, site.id, url);
      assert.equal(target.site.referer, site.referer, url);
    }
  }
});
