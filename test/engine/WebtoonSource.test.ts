import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebtoonSource } from '../../src/engine/index.ts';
import type { PretendEpisode } from '../pretend/webtoonPages.ts';
import { episodeUrl, imageUrl, listingPage, listPageUrl, SERIES_COVER, SERIES_URL, seriesPage, viewerPage } from '../pretend/webtoonPages.ts';
import type { Route } from './helpers.ts';
import { makeIO } from './helpers.ts';

function webtoon(routes: Record<string, Route>, language?: string) {
  const { io, transport } = makeIO(routes);
  return { source: new WebtoonSource(io, { language }), transport };
}

const episodes = (...numbers: number[]): PretendEpisode[] =>
  numbers.map((no) => ({ no, title: `Ep. ${no} - Chapter ${no}`, date: `Oct ${no}, 2026` }));

// Newest first on every page, and a paginator that only shows a window of links:
// page 1 knows of pages 2-3, page 2 reveals page 4.
const seriesRoutes = (): Record<string, Route> => ({
  [SERIES_URL]: seriesPage({ episodes: episodes(12, 11, 10), pages: [1, 2, 3] }),
  [listPageUrl(2)]: seriesPage({ episodes: episodes(9, 8, 7), pages: [1, 2, 3, 4] }),
  [listPageUrl(3)]: seriesPage({ episodes: episodes(6, 5, 4), pages: [2, 3, 4] }),
  [listPageUrl(4)]: seriesPage({ episodes: episodes(3, 2, 1), pages: [3, 4] }),
});

test('WEBTOON is read as one long column, downwards', () => {
  assert.deepEqual(webtoon({}).source.reading, { mode: 'scroll', rtl: false });
});

test('getSeries reads the details and walks the paginator to the last page', async () => {
  const { source, transport } = webtoon(seriesRoutes());
  const series = await source.getSeries(SERIES_URL);

  assert.equal(series.title, 'Lantern Keeper');
  assert.equal(series.cover, SERIES_COVER);
  assert.equal(series.author, 'Mira Oduya');
  assert.deepEqual(series.genres, ['Fantasy']);
  assert.equal(series.status, 'UP EVERY FRIDAY');
  assert.equal(series.description, 'A keeper tends the last lighthouse of a drowned world.');

  assert.deepEqual(series.chapters.map((c) => c.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  assert.deepEqual(series.chapters[0], { url: episodeUrl(1), key: 'e1', number: 1, title: 'Ep. 1 - Chapter 1', date: 'Oct 1, 2026' });
  assert.deepEqual(new Set(transport.asked.map((a) => a.url)), new Set([SERIES_URL, listPageUrl(2), listPageUrl(3), listPageUrl(4)]));
  assert.equal(transport.asked.length, 4, 'no page is fetched twice');
});

test('getSeries copes with a single page, and ignores other series on it', async () => {
  const routes = { [SERIES_URL]: seriesPage({ episodes: episodes(2, 1), pages: [1] }) };
  const { source, transport } = webtoon(routes);
  const series = await source.getSeries(SERIES_URL);
  assert.deepEqual(series.chapters.map((c) => c.key), ['e1', 'e2']);
  assert.equal(transport.asked.length, 1);
});

test('getSeries says why when there is nothing to read', async () => {
  const empty = webtoon({ [SERIES_URL]: '<html><head><title>Oops</title></head><body>nothing</body></html>' });
  await assert.rejects(() => empty.source.getSeries(SERIES_URL), (err: { code: string; debug: { pageTitle: string } }) => {
    assert.equal(err.code, 'no_chapters');
    assert.equal(err.debug.pageTitle, 'Oops');
    return true;
  });
  const challenge = webtoon({ [SERIES_URL]: '<html><head><title>Just a moment...</title></head></html>' });
  await assert.rejects(() => challenge.source.getSeries(SERIES_URL), { code: 'blocked' });
  const gated = webtoon({ [SERIES_URL]: '<html><body><div class="age_gate">Please confirm your age</div></body></html>' });
  await assert.rejects(() => gated.source.getSeries(SERIES_URL), { code: 'age_gated' });
});

test('getChapter reads the real image addresses, not the blank placeholders', async () => {
  const { source } = webtoon({ [episodeUrl(12)]: viewerPage(12, 3) });
  const { pages } = await source.getChapter(episodeUrl(12));
  assert.deepEqual(pages, [1, 2, 3].map((n) => imageUrl(12, n)));
});

test('getChapter still finds images when the viewer markup changes', async () => {
  const html = `<html><body>
    <img data-url="//webtoon-phinf.pstatic.net/a/1.jpg" src="https://webtoons-static.pstatic.net/image/bg_transparency.png">
    <img data-url="http://webtoon-phinf.pstatic.net/a/2.jpg">
    <img src="https://webtoon-phinf.pstatic.net/a/3.jpg">
    <img src="https://webtoons-static.pstatic.net/image/bg_transparency.png">
  </body></html>`;
  const { pages } = await webtoon({ [episodeUrl(1)]: html }).source.getChapter(episodeUrl(1));
  assert.deepEqual(pages, ['https://webtoon-phinf.pstatic.net/a/1.jpg', 'https://webtoon-phinf.pstatic.net/a/2.jpg']);
});

test('getChapter: no images, a human check, an age gate', async () => {
  const url = episodeUrl(1);
  await assert.rejects(() => webtoon({ [url]: '<html><body>gone</body></html>' }).source.getChapter(url), { code: 'no_pages' });
  await assert.rejects(() => webtoon({ [url]: '<title>Just a moment...</title>' }).source.getChapter(url), { code: 'blocked' });
  await assert.rejects(() => webtoon({ [url]: '<body class="age-gate">18+</body>' }).source.getChapter(url), { code: 'age_gated' });
});

test('getList finds series by their links, with the lazy covers', async () => {
  const url = 'https://www.webtoons.com/en/genres/fantasy';
  const cards = [
    { slug: 'lantern-keeper', titleNo: 5001, title: 'Lantern Keeper' },
    { slug: 'paper-moons', titleNo: 7002, title: 'Paper Moons' },
  ];
  const items = await webtoon({ [url]: listingPage(cards) }).source.getList(url);
  assert.deepEqual(items, [
    { url: SERIES_URL, title: 'Lantern Keeper', cover: 'https://webtoon-phinf.pstatic.net/20250101_1/lantern-keeper/thumbnail/cover.jpg?type=q90' },
    {
      url: 'https://www.webtoons.com/en/fantasy/paper-moons/list?title_no=7002',
      title: 'Paper Moons',
      cover: 'https://webtoon-phinf.pstatic.net/20250101_1/paper-moons/thumbnail/cover.jpg?type=q90',
    },
  ]);
});

test('getList: nothing found is fine, a human check is not', async () => {
  const url = 'https://www.webtoons.com/en/search?keyword=zzz';
  assert.deepEqual(await webtoon({ [url]: '<html><body>No results</body></html>' }).source.getList(url), []);
  await assert.rejects(() => webtoon({ [url]: '<title>Attention Required! | Cloudflare</title>' }).source.getList(url), { code: 'blocked' });
});

test('the language chosen decides where browsing and searching start', () => {
  const english = webtoon({}).source;
  assert.equal(english.home, 'https://www.webtoons.com/en/');
  assert.equal(english.searchUrl('moon'), 'https://www.webtoons.com/en/search?keyword=moon');
  const french = webtoon({}, 'fr').source;
  assert.equal(french.home, 'https://www.webtoons.com/fr/');
  assert.equal(french.searchUrl('lune'), 'https://www.webtoons.com/fr/search?keyword=lune');
  assert.equal(french.id, 'webtoon');
});
