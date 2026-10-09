import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ScanMangaUrls } from '../../src/engine/source/scanmanga/ScanMangaUrls.ts';
import { chapterAddress, chapterPath, SCANMANGA, SERIES, seriesAddress } from '../pretend/scanmangaPages.ts';

const [LANTERN, EMBER] = SERIES;
if (!LANTERN || !EMBER) throw new Error('the pretend series are gone');

test('a series is recognised on any host of the site, and kept as the mobile site spells it', () => {
  for (const host of ['m.scan-manga.com', 'www.scan-manga.com', 'scan-manga.com']) {
    const target = ScanMangaUrls.resolve(`https://${host}/13001/Lantern-Keeper.html`);
    assert.deepEqual(target, { kind: 'series', url: seriesAddress(LANTERN) });
  }
  assert.deepEqual(ScanMangaUrls.resolve('http://www.scan-manga.com/13002-45678/Ember-Courier-The-Last-Mile.html#t'), { kind: 'series', url: seriesAddress(EMBER) });
});

test('a chapter carries its series, which its own address does not name', () => {
  const target = ScanMangaUrls.resolve(chapterAddress(LANTERN, '2-5'));
  assert.deepEqual(target, { kind: 'chapter', url: chapterAddress(LANTERN, '2-5'), key: 'c2.5', seriesUrl: seriesAddress(LANTERN) });
  assert.equal(ScanMangaUrls.resolve(chapterAddress(EMBER, '1'))?.seriesUrl, seriesAddress(EMBER));
  // Whatever host it came with.
  const www = chapterAddress(LANTERN, '3').replace('m.scan-manga.com', 'www.scan-manga.com');
  assert.equal(ScanMangaUrls.resolve(www)?.url, chapterAddress(LANTERN, '3'));
});

test('a chapter link without its series (pasted from the site) is a link to the site', () => {
  const plain = `${SCANMANGA}${chapterPath(LANTERN, '3')}`;
  assert.deepEqual(ScanMangaUrls.resolve(plain), { kind: 'list', url: plain });
  // And a mark that names no series is no mark.
  assert.equal(ScanMangaUrls.resolve(`${plain}#t`)?.kind, 'list');
  assert.equal(ScanMangaUrls.resolve(`${plain}#%E0%A4%A`)?.kind, 'list');
});

test('everything else of the site is a listing, with its query; what is not the site is nothing', () => {
  assert.deepEqual(ScanMangaUrls.resolve('https://www.scan-manga.com/?po'), { kind: 'list', url: `${SCANMANGA}/?po` });
  assert.equal(ScanMangaUrls.resolve('https://m.scan-manga.com/TOP-Seinen-13.html')?.kind, 'list');
  assert.equal(ScanMangaUrls.resolve('https://m.scan-manga.com/Teams.html')?.kind, 'list');
  assert.equal(ScanMangaUrls.resolve('https://m.scan-manga.com/team-604/ScanR.html')?.kind, 'list');
  assert.equal(ScanMangaUrls.resolve('https://static.scan-manga.com/img/logo_sm.svg')?.kind, 'list');
  for (const other of ['https://example.com/13001/Lantern-Keeper.html', 'https://notscan-manga.com/', 'ftp://scan-manga.com/', 'not an address']) {
    assert.equal(ScanMangaUrls.resolve(other), null, other);
  }
});

test('chapter(): the address a source gives a chapter of a series, for the page it was linked as', () => {
  const page = `${SCANMANGA}${chapterPath(LANTERN, '1')}`;
  assert.equal(ScanMangaUrls.chapter(page, seriesAddress(LANTERN)), chapterAddress(LANTERN, '1'));
  assert.equal(ScanMangaUrls.chapter(`${SCANMANGA}/13001/Lantern-Keeper.html`, seriesAddress(LANTERN)), null);
  assert.equal(ScanMangaUrls.chapter('https://example.com/lecture-en-ligne/X-Chapitre-1-FR_1.html', seriesAddress(LANTERN)), null);
  assert.equal(ScanMangaUrls.chapter(page, 'not an address'), null);
});

test('what is asked of the site is the chapter\'s page, without the mark; its name, number and id come from its address', () => {
  assert.equal(ScanMangaUrls.page(chapterAddress(LANTERN, '2')), `${SCANMANGA}${chapterPath(LANTERN, '2')}`);
  assert.equal(ScanMangaUrls.slugOf(chapterAddress(LANTERN, '2')), 'Lantern-Keeper');
  assert.equal(ScanMangaUrls.slugOf(seriesAddress(EMBER)), 'Ember-Courier-The-Last-Mile');
  assert.equal(ScanMangaUrls.chapterId(chapterAddress(LANTERN, '2')), '130012');
  assert.equal(ScanMangaUrls.chapterNumber('c2.5'), 2.5);
  assert.equal(Number.isNaN(ScanMangaUrls.chapterNumber('x')), true);
});

test('a search is the list of all the titles with the words kept for ourselves, never sent', () => {
  const search = ScanMangaUrls.search('lantern keeper');
  assert.equal(search, `${SCANMANGA}/scanlation/liste_series.html?q=lantern%20keeper`);
  assert.equal(ScanMangaUrls.queryOf(search), 'lantern keeper');
  assert.equal(ScanMangaUrls.withoutQuery(search), `${SCANMANGA}/scanlation/liste_series.html`);
  assert.equal(ScanMangaUrls.queryOf('not an address'), null);
  // Other parts of a query are left as they are, a bare "?po" included.
  assert.equal(ScanMangaUrls.withoutQuery(`${SCANMANGA}/?po`), `${SCANMANGA}/?po`);
  assert.equal(ScanMangaUrls.withoutQuery(`${SCANMANGA}/?po&q=lantern`), `${SCANMANGA}/?po`);
});
