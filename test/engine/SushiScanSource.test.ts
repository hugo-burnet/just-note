import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SourceError, SushiScanSource } from '../../src/engine/index.ts';
import { card, CDN, chapterAddress, chapterPage, EMBER, homePage, LANTERN, searchPage, seriesAddress, seriesPage, SUSHI } from '../pretend/sushiscanPages.ts';
import { FakeTransport, LinkedomParser } from './helpers.ts';
import type { Route } from './helpers.ts';

const parser = new LinkedomParser();
const sushi = (routes: Record<string, Route>) => ({ source: new SushiScanSource({ transport: new FakeTransport(routes), parser }) });
const pictures = (count: number): string[] => Array.from({ length: count }, (_, n) => `${CDN}/wp-content/uploads97/LKChap2-${String(n + 1).padStart(2, '0')}.webp`);

test('SushiScan is French, read as pages from right to left unless a series says otherwise, and starts from its home page', () => {
  const { source } = sushi({});
  assert.deepEqual(source.languages, ['fr']);
  assert.deepEqual(source.reading, { mode: 'paged', rtl: true });
  assert.equal(source.home(), `${SUSHI}/`);
  assert.equal(source.searchUrl('blue lock'), `${SUSHI}/?s=blue+lock`);
});

test('getSeries reads the title, the cover, the facts and the genres, and lists the chapters oldest first, half chapters included', async () => {
  const { source } = sushi({ [seriesAddress(LANTERN)]: seriesPage(LANTERN) });
  const series = await source.getSeries(seriesAddress(LANTERN));
  assert.equal(series.title, 'Lantern Keeper');
  assert.equal(series.cover, LANTERN.cover);
  assert.equal(series.author, 'Mara Quill');
  assert.equal(series.status, 'En Cours');
  assert.deepEqual(series.genres, ['Action', 'Fantasy']);
  assert.ok(series.description.startsWith('Mara keeps the last lantern'));
  assert.deepEqual(series.chapters.map((chapter) => [chapter.key, chapter.number, chapter.title, chapter.date]), [
    ['c1', 1, 'Chapitre 1', '29 juillet 2025'],
    ['c2', 2, 'Chapitre 2', '29 juillet 2025'],
    ['c2.5', 2.5, 'Chapitre 2.5', '29 juillet 2025'],
    ['c3', 3, 'Chapitre 3', '29 juillet 2025'],
  ]);
  // A chapter's address does not name its series: the address this source gives it does.
  assert.deepEqual(series.chapters.map((chapter) => chapter.url), ['1', '2', '2-5', '3'].map((n) => `${chapterAddress(LANTERN, n)}#/catalogue/1-lantern-keeper/`));
});

test('a series says how it is read: a manga from right to left in pages, a manhua in a column, and nothing when the site does not say', async () => {
  const { source } = sushi({
    [seriesAddress(LANTERN)]: seriesPage(LANTERN),
    [seriesAddress(EMBER)]: seriesPage(EMBER),
    'https://sushiscan.net/catalogue/plain/': seriesPage({ ...LANTERN, slug: 'plain' }, { Statut: 'En Cours' }),
  });
  assert.deepEqual((await source.getSeries(seriesAddress(LANTERN))).reading, { mode: 'paged', rtl: true });
  assert.deepEqual((await source.getSeries(seriesAddress(EMBER))).reading, { mode: 'scroll', rtl: false });
  assert.equal((await source.getSeries('https://sushiscan.net/catalogue/plain/')).reading, undefined);
});

test('a series with volumes lists them as volumes, and one with no chapter says so instead of showing nothing', async () => {
  const volumes = { ...LANTERN, kind: 'volume', chapters: ['2', '1'] };
  const { source } = sushi({ [seriesAddress(volumes)]: seriesPage(volumes), 'https://sushiscan.net/catalogue/empty/': '<html><head><title>Empty</title></head><body>nothing</body></html>' });
  assert.deepEqual((await source.getSeries(seriesAddress(volumes))).chapters.map((chapter) => [chapter.key, chapter.title]), [
    ['v1', 'Volume 1'],
    ['v2', 'Volume 2'],
  ]);
  await assert.rejects(() => source.getSeries('https://sushiscan.net/catalogue/empty/'), (error: unknown) => error instanceof SourceError && error.code === 'no_chapters');
  const cloudflare = '<html><head><title>Just a moment...</title></head><body></body></html>';
  const blocked = sushi({ [seriesAddress(EMBER)]: cloudflare }).source;
  await assert.rejects(() => blocked.getSeries(seriesAddress(EMBER)), (error: unknown) => error instanceof SourceError && error.code === 'blocked');
});

test('a series whose volumes are in a list of their own has them after its chapters, each kind oldest first', async () => {
  const both = { ...LANTERN, chapters: ['2', '1'], volumes: ['2', '1'] };
  const { source } = sushi({ [seriesAddress(both)]: seriesPage(both) });
  const series = await source.getSeries(seriesAddress(both));
  assert.deepEqual(series.chapters.map((chapter) => [chapter.key, chapter.title]), [
    ['c1', 'Chapitre 1'],
    ['c2', 'Chapitre 2'],
    ['v1', 'Volume 1'],
    ['v2', 'Volume 2'],
  ]);
});

test('a series page with no list of chapters still gives the chapters it links to, of the name most of them have', async () => {
  const links = ['3', '2', '1'].map((n) => `<a href="${chapterAddress(LANTERN, n)}">${n}</a>`).join('');
  const html = `<html><head><title>Lantern</title></head><body><h1>Lantern Keeper</h1>${links}<a href="${SUSHI}/other-chapitre-9/">other</a></body></html>`;
  const { source } = sushi({ [seriesAddress(LANTERN)]: html });
  const series = await source.getSeries(seriesAddress(LANTERN));
  assert.deepEqual(series.chapters.map((chapter) => [chapter.key, chapter.title]), [['c1', 'Chapitre 1'], ['c2', 'Chapitre 2'], ['c3', 'Chapitre 3']]);
});

test('a row of the list that links to something that is not a chapter is left out, not shown broken', async () => {
  const html = seriesPage(LANTERN).replace('<li data-num="Chapitre 3">', `<li data-num="Bonus"><div class="chbox"><div class="eph-num"><a href="${SUSHI}/lantern-keeper-bonus-art/"><span class="chapternum">Bonus</span></a></div></div></li><li data-num="Chapitre 3">`);
  const { source } = sushi({ [seriesAddress(LANTERN)]: html });
  assert.deepEqual((await source.getSeries(seriesAddress(LANTERN))).chapters.map((chapter) => chapter.key), ['c1', 'c2', 'c2.5', 'c3']);
});

test('the home page lists each series once, with its name and cover, whichever way the page shows it', async () => {
  const { source } = sushi({ [`${SUSHI}/`]: homePage() });
  const items = await source.getList(`${SUSHI}/`);
  assert.deepEqual(items.map((item) => [item.url, item.title]), [
    [seriesAddress(LANTERN), 'Lantern Keeper'],
    [seriesAddress(EMBER), 'Ember Courier'],
  ]);
  // The first has its cover in the picture; the second keeps it in data-src, with a placeholder in src.
  assert.deepEqual(items.map((item) => item.cover), [`${LANTERN.cover}?ver=1790341491`, `${EMBER.cover}?ver=1790341491`]);
});

test('a search lists what the site found, not the widgets beside it, and the links nobody asked for (a trap, the menu) are not series', async () => {
  const { source } = sushi({ [`${SUSHI}/?s=lantern`]: searchPage([LANTERN], [EMBER]) });
  const items = await source.getList(`${SUSHI}/?s=lantern`);
  assert.deepEqual(items.map((item) => item.title), ['Lantern Keeper']);
  assert.deepEqual(await sushi({ [`${SUSHI}/?s=nothing`]: searchPage([]) }).source.getList(`${SUSHI}/?s=nothing`), []);
  assert.ok(card(LANTERN).includes('class="bs"'));
});

test('getChapter gives the pictures its reader is given, in order, with the slashes unescaped', async () => {
  const listed = pictures(3);
  const { source } = sushi({ [chapterAddress(LANTERN, '2')]: chapterPage(LANTERN, '2', listed) });
  const chapter = await source.getChapter(`${chapterAddress(LANTERN, '2')}#/catalogue/1-lantern-keeper/`);
  assert.deepEqual(chapter.pages, listed);
});

test('a chapter whose pictures are named in the page some other way gets those of its own folder, not the site\'s logo and cover', async () => {
  const listed = pictures(4);
  const html = chapterPage(LANTERN, '2', listed).replace('"images":', '"pages":').replace('</body>', `<img src="${LANTERN.cover}"></body>`);
  const { source } = sushi({ [chapterAddress(LANTERN, '2')]: html });
  assert.deepEqual((await source.getChapter(chapterAddress(LANTERN, '2'))).pages, listed);
});

test('a chapter with no picture in its page says so, with what the page says of its reader, and a check is told from a missing list', async () => {
  const bare = '<html><head><title>Lantern</title></head><body><div id="readerarea">ts_reader.run({"sources":[]})</div></body></html>';
  const { source } = sushi({ [chapterAddress(LANTERN, '2')]: bare, [chapterAddress(LANTERN, '3')]: '<html><head><title>Just a moment...</title></head></html>' });
  await assert.rejects(
    () => source.getChapter(chapterAddress(LANTERN, '2')),
    (error: unknown) => error instanceof SourceError && error.code === 'no_pages' && String(error.debug['reader']).includes('ts_reader.run'),
  );
  await assert.rejects(() => source.getChapter(chapterAddress(LANTERN, '3')), (error: unknown) => error instanceof SourceError && error.code === 'blocked');
});

test('a chapter link pasted from the site is completed with the series its page links to, and not with any other link', async () => {
  const address = chapterAddress(LANTERN, '2');
  const { source } = sushi({ [address]: chapterPage(LANTERN, '2', pictures(2)) });
  const target = source.resolve(address);
  assert.equal(target?.seriesUrl, undefined);
  const whole = target ? await source.complete(target) : null;
  assert.deepEqual(whole, { kind: 'chapter', url: `${address}#/catalogue/1-lantern-keeper/`, key: 'c2', seriesUrl: seriesAddress(LANTERN) });
  // What is whole stays as it is; a page that links to no series cannot complete anything.
  assert.equal(whole ? await source.complete(whole) : null, whole);
  const lost = sushi({ [address]: '<html><body><a href="https://sushiscan.net/catalogue">Catalogue</a></body></html>' }).source;
  assert.equal(await lost.complete({ kind: 'chapter', url: address, key: 'c2' }), null);
});
