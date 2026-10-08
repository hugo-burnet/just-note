import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LelScanSource } from '../../src/engine/index.ts';
import { chapterAddress, chapterPage, GARDEN, homePage, imagePath, LANTERN, LELSCAN, seriesAddress, seriesPage, SERIES } from '../pretend/lelscanPages.ts';
import type { PretendSeries } from '../pretend/lelscanPages.ts';
import type { Route } from './helpers.ts';
import { makeIO } from './helpers.ts';

function lelscan(routes: Record<string, Route>) {
  const { io, transport } = makeIO(routes);
  return { source: new LelScanSource(io), transport };
}

/** Every page of a chapter, as the made-up site serves them. */
function chapterRoutes(series: PretendSeries, number: string): Record<string, Route> {
  const pages = series.chapters.find((chapter) => chapter.number === number)?.pages ?? 0;
  const routes: Record<string, Route> = { [chapterAddress(series, number)]: chapterPage(series, number, 1) };
  for (let page = 1; page <= pages; page++) routes[chapterAddress(series, number, page)] = chapterPage(series, number, page);
  return routes;
}

const LANTERN_URL = `${LELSCAN}/lecture-en-ligne-lanterne-des-marees`;
const absolute = (path: string): string => `${LELSCAN}${path}`;

test('LelScan is French, and read like a printed manga: turned pages, right to left', () => {
  const { source } = lelscan({});
  assert.deepEqual(source.reading, { mode: 'paged', rtl: true });
  assert.deepEqual(source.languages, ['fr']);
  assert.equal(source.home('en'), source.home(), 'there is only one catalogue');
  assert.equal(source.home(), `${LELSCAN}/`);
});

test('getSeries reads the title, and lists the chapters oldest first, half chapters included', async () => {
  const { source } = lelscan({ [LANTERN_URL]: seriesPage(LANTERN) });
  const series = await source.getSeries(LANTERN_URL);

  assert.equal(series.title, 'Lanterne des Marées');
  assert.equal(series.url, LANTERN_URL);
  assert.equal(series.cover, `${LELSCAN}/mangas/lanterne-des-marees/thumb_cover.jpg`, 'the cover has a fixed place');
  assert.deepEqual(series.chapters.map((chapter) => [chapter.key, chapter.number, chapter.title]), [
    ['c1', 1, 'Chapitre 1'],
    ['c2', 2, 'Chapitre 2'],
    ['c2.5', 2.5, 'Chapitre 2.5'],
    ['c3', 3, 'Chapitre 3'],
  ]);
  assert.deepEqual(series.chapters.map((chapter) => chapter.url), ['1', '2', '2.5', '3'].map((n) => `${LELSCAN}/scan-lanterne-des-marees/${n}`));
});

test('getSeries takes no chapter from another series, and says so when it finds none', async () => {
  const other = seriesPage(GARDEN);
  const { source } = lelscan({ [LANTERN_URL]: other });
  await assert.rejects(() => source.getSeries(LANTERN_URL), { code: 'no_chapters' });
  await assert.rejects(() => lelscan({ [LANTERN_URL]: '<title>Just a moment...</title>' }).source.getSeries(LANTERN_URL), { code: 'blocked' });
});

test('getList gives the series of the home page, the latest updated first, each with its cover', async () => {
  const { source } = lelscan({ [`${LELSCAN}/`]: homePage() });
  const items = await source.getList(`${LELSCAN}/`);
  assert.deepEqual(items, SERIES.map((series) => ({
    url: `${LELSCAN}/lecture-en-ligne-${series.slug}`,
    title: series.title,
    cover: `${LELSCAN}/mangas/${series.slug}/thumb_cover.jpg`,
  })));
  assert.equal(new Set(items.map((item) => item.url)).size, items.length, 'a series is listed once, whatever its spelling');
});

test('a search is answered from that list, without accents or capitals mattering, and never sent to the site', async () => {
  const { source, transport } = lelscan({ [`${LELSCAN}/`]: homePage() });
  const titles = async (query: string): Promise<string[]> => (await source.getList(source.searchUrl(query))).map((item) => item.title);

  assert.deepEqual(await titles('MARÉES'), ['Lanterne des Marées']);
  assert.deepEqual(await titles('lanterne maree'), ['Lanterne des Marées']);
  assert.deepEqual(await titles("jardin d'horloge"), ["Jardin d'Horloge"]);
  assert.deepEqual(await titles('des'), ['Lanterne des Marées', 'Chemin des Corbeaux']);
  assert.deepEqual(await titles('zzz'), []);
  assert.ok(transport.asked.every((asked) => asked.url === `${LELSCAN}/`), 'only the home page was asked for');
});

test('getList says when the site asked for a human check', async () => {
  const url = `${LELSCAN}/`;
  await assert.rejects(() => lelscan({ [url]: '<title>Attention Required! | Cloudflare</title>' }).source.getList(url), { code: 'blocked' });
});

test('getChapter reads every page for its own image, however the files of the series are named', async () => {
  const lantern = lelscan(chapterRoutes(LANTERN, '1'));
  const zeroBased = (await lantern.source.getChapter(chapterAddress(LANTERN, '1'))).pages;
  assert.deepEqual(zeroBased, [1, 2, 3, 4].map((page) => absolute(imagePath(LANTERN, '1', page))));
  assert.match(zeroBased[0] ?? '', /\/mangas\/lanterne-des-marees\/1\/00\.jpg\?v=/);
  assert.equal(lantern.transport.asked.length, 4, 'one request a page, the first one is not asked twice');

  const garden = lelscan(chapterRoutes(GARDEN, '1'));
  const oneBased = (await garden.source.getChapter(chapterAddress(GARDEN, '1'))).pages;
  assert.deepEqual(oneBased, [1, 2, 3].map((page) => absolute(imagePath(GARDEN, '1', page))));
  assert.match(oneBased[0] ?? '', /\/mangas\/jardin-d-horloge\/1\/1\.jpg\?v=/);
});

test('a half chapter is a chapter like the others', async () => {
  const { source } = lelscan(chapterRoutes(LANTERN, '2.5'));
  const { pages } = await source.getChapter(chapterAddress(LANTERN, '2.5'));
  assert.deepEqual(pages, [1, 2].map((page) => absolute(imagePath(LANTERN, '2.5', page))));
});

test('getChapter names the page that has no image, and the chapter that has no pages', async () => {
  const routes = chapterRoutes(LANTERN, '1');
  routes[chapterAddress(LANTERN, '1', 3)] = chapterPage(LANTERN, '1', 3).replace(/<img [^>]*>/, '');
  await assert.rejects(() => lelscan(routes).source.getChapter(chapterAddress(LANTERN, '1')), (error: Error & { code?: string }) => {
    assert.equal(error.code, 'no_pages');
    assert.match(error.message, /Page 3/);
    return true;
  });

  const url = chapterAddress(LANTERN, '1');
  await assert.rejects(() => lelscan({ [url]: '<html><body>Chapitre introuvable</body></html>' }).source.getChapter(url), { code: 'no_pages' });
  await assert.rejects(() => lelscan({ [url]: '<title>Just a moment...</title>' }).source.getChapter(url), { code: 'blocked' });
});

test('resolve gives the canonical series address, whatever spelling the site used', () => {
  const { source } = lelscan({});
  for (const series of SERIES) assert.equal(source.resolve(seriesAddress(series))?.url, `${LELSCAN}/lecture-en-ligne-${series.slug}`, series.slug);
});
