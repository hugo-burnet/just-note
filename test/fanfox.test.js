import assert from 'node:assert/strict';
import { test } from 'node:test';
import fanfox from '../public/js/sources/fanfox.js';
import { fakeCtx, fixture } from './helpers/dom.js';
import { pack } from './helpers/pack.js';

const SERIES = 'https://fanfox.net/manga/moonlight_courier/';
const CHAPTER = 'https://fanfox.net/manga/moonlight_courier/c004/1.html';
const CDN = 'https://fmcdn.mfcdn.net/store/manga/9999/004.0/compressed';

// ---- resolve --------------------------------------------------------------

test('resolve: series, in any of the shapes people paste', () => {
  for (const input of [
    SERIES,
    'https://fanfox.net/manga/moonlight_courier',
    'https://m.fanfox.net/manga/moonlight_courier/',
    'http://www.fanfox.net/manga/moonlight_courier/',
    'https://mangafox.me/manga/moonlight_courier/',
  ]) {
    assert.deepEqual(fanfox.resolve(input), { kind: 'series', url: SERIES }, input);
  }
});

test('resolve: a chapter is canonicalised to its first page', () => {
  for (const input of [
    CHAPTER,
    'https://fanfox.net/manga/moonlight_courier/c004/17.html',
    'https://m.fanfox.net/manga/moonlight_courier/c004/',
  ]) {
    assert.deepEqual(
      fanfox.resolve(input),
      { kind: 'chapter', url: CHAPTER, key: 'c004', seriesUrl: SERIES },
      input,
    );
  }
  const volume = fanfox.resolve('https://fanfox.net/manga/moonlight_courier/v01/c003/2.html');
  assert.equal(volume.url, 'https://fanfox.net/manga/moonlight_courier/v01/c003/1.html');
  assert.equal(volume.key, 'v01/c003');
  assert.equal(fanfox.resolve('https://fanfox.net/manga/moonlight_courier/c003.5/1.html').key, 'c003.5');
});

test('resolve: other pages of the site are lists', () => {
  assert.deepEqual(fanfox.resolve('https://fanfox.net'), { kind: 'list', url: 'https://fanfox.net/' });
  assert.deepEqual(fanfox.resolve('https://m.fanfox.net/directory/?rating'), {
    kind: 'list',
    url: 'https://fanfox.net/directory/?rating',
  });
  assert.equal(fanfox.resolve(fanfox.searchUrl('moon & stars')).kind, 'list');
  assert.equal(fanfox.searchUrl('moon & stars'), 'https://fanfox.net/search?title=moon%20%26%20stars');
});

test('resolve: other sites, and look-alikes, are not ours', () => {
  for (const input of [
    'https://example.com/manga/moonlight_courier/',
    'https://evilfanfox.net/manga/moonlight_courier/',
    'https://fanfox.net.evil.com/manga/moonlight_courier/',
    'javascript:alert(1)',
    'not a url',
  ]) {
    assert.equal(fanfox.resolve(input), null, input);
  }
});

// ---- series ---------------------------------------------------------------

test('getSeries: reads the details and lists chapters oldest first', async () => {
  const ctx = fakeCtx({ [SERIES]: await fixture('fanfox-series.html') });
  const series = await fanfox.getSeries(SERIES, ctx);

  assert.equal(series.title, 'Moonlight Courier');
  assert.equal(series.cover, 'https://fmcdn.mfcdn.net/store/manga/9999/cover.jpg?token=abc&ttl=1');
  assert.equal(series.author, 'Aya Tsukino, Ben Okoye');
  assert.equal(series.status, 'Ongoing');
  assert.deepEqual(series.genres, ['Adventure', 'Fantasy']);
  assert.match(series.description, /^A courier carries parcels between floating towns, and every parcel/);

  // Duplicates (same chapter, other page), other series and other hosts are folded away.
  assert.deepEqual(
    series.chapters.map((c) => [c.key, c.number, c.title, c.date]),
    [
      ['c001', 1, 'Ch.001', 'Aug 31,2026'],
      ['c002', 2, 'Ch.002', 'Sep 07,2026'],
      ['v01/c003', 3, 'Vol.01 Ch.003', 'Sep 14,2026'],
      ['c003.5', 3.5, 'Ch.003.5 Extra', 'Sep 21,2026'],
      ['c004', 4, 'Ch.004 The Last Lantern', 'Oct 03,2026'],
    ],
  );
  assert.equal(series.chapters[1].url, 'https://fanfox.net/manga/moonlight_courier/c002/1.html');
});

test('getSeries: falls back to <meta> tags when the CSS classes are gone', async () => {
  const html = (await fixture('fanfox-series.html'))
    .replace(/<span class="detail-info-right-title-font">.*?<\/span>/, '')
    .replace(/<img class="detail-info-cover-img"[^>]*>/, '')
    .replace(/<p class="fullcontent">.*?<\/p>/, '')
    .replace(/<p class="detail-info-right-content">.*?<\/p>/, '');
  const series = await fanfox.getSeries(SERIES, fakeCtx({ [SERIES]: html }));
  assert.equal(series.title, 'Moonlight Courier');
  assert.equal(series.cover, 'https://fmcdn.mfcdn.net/store/manga/9999/cover.jpg?token=abc&ttl=1');
  assert.equal(series.description, 'Fixture description from meta.');
  assert.equal(series.chapters.length, 5);
});

test('getSeries: strips the "show more" link from a short description', async () => {
  const html = (await fixture('fanfox-series.html')).replace(/<p class="fullcontent">.*?<\/p>/, '');
  const series = await fanfox.getSeries(SERIES, fakeCtx({ [SERIES]: html }));
  assert.equal(series.description, 'A courier carries parcels between floating towns.');
});

test('getSeries: says why when there is nothing to read', async () => {
  const empty = fakeCtx({ [SERIES]: '<html><head><title>Oops</title></head><body>nothing here</body></html>' });
  await assert.rejects(() => fanfox.getSeries(SERIES, empty), (err) => {
    assert.equal(err.code, 'no_chapters');
    assert.equal(err.debug.pageTitle, 'Oops');
    return true;
  });

  const challenge = fakeCtx({ [SERIES]: '<html><head><title>Just a moment...</title></head><body></body></html>' });
  await assert.rejects(() => fanfox.getSeries(SERIES, challenge), { code: 'blocked' });
});

// ---- lists ----------------------------------------------------------------

test('getList: finds series by their links, whatever the card looks like', async () => {
  const url = 'https://fanfox.net/directory/';
  const items = await fanfox.getList(url, fakeCtx({ [url]: await fixture('fanfox-list.html') }));
  assert.deepEqual(items, [
    {
      url: SERIES,
      title: 'Moonlight Courier',
      cover: 'https://fmcdn.mfcdn.net/store/manga/9999/cover.jpg',
    },
    {
      url: 'https://fanfox.net/manga/clockwork_garden/',
      title: 'Clockwork Garden',
      cover: 'https://fmcdn.mfcdn.net/store/manga/8888/cover.jpg',
    },
    { url: 'https://fanfox.net/manga/paper_lanterns/', title: 'Paper Lanterns', cover: null },
  ]);
});

test('getList: an empty result is fine, a human check is not', async () => {
  const url = 'https://fanfox.net/search?title=zzz';
  assert.deepEqual(await fanfox.getList(url, fakeCtx({ [url]: '<html><body>No results</body></html>' })), []);
  await assert.rejects(
    () => fanfox.getList(url, fakeCtx({ [url]: '<html><head><title>Just a moment...</title></head></html>' })),
    { code: 'blocked' },
  );
});

// ---- chapters -------------------------------------------------------------

const imagesScript = `var newImgs=['//fmcdn.mfcdn.net/store/manga/9999/004.0/compressed/a001.jpg?token=1','//fmcdn.mfcdn.net/store/manga/9999/004.0/compressed/a002.jpg?token=2','http://fmcdn.mfcdn.net/store/manga/9999/004.0/compressed/a003.jpg'];`;

test('getChapter, inline layout: every page is in a packed script', async () => {
  const html = `<!doctype html><html><body>
    <script src="//static.fanfox.net/v1/chapter_bar.js"></script>
    <script>var unrelated = 1;</script>
    <script type="text/javascript">${pack(imagesScript)}</script>
  </body></html>`;
  const ctx = fakeCtx({ [CHAPTER]: html });
  const { pages } = await fanfox.getChapter(CHAPTER, ctx);
  assert.deepEqual(pages, [`${CDN}/a001.jpg?token=1`, `${CDN}/a002.jpg?token=2`, `${CDN}/a003.jpg`]);
  assert.equal(ctx.calls.length, 1);
});

const legacyHtml = (extra = 'var imagecount = 3;') => `<!doctype html><html><body>
  <script>var comicid = 9999; var chapterid = 123456; var imagepage = 1; ${extra}</script>
  <input type="hidden" id="dm5_key" value="k3y">
  <div class="pager-list-left"><span><a data-page="1">1</a><a data-page="2">2</a><a data-page="3">3</a><a data-page="2">&gt;</a></span></div>
</body></html>`;

// What chapterfun.ashx answers for page n: this page's image, then the next one's.
const chapterfun = (n) =>
  pack(`var pix="//fmcdn.mfcdn.net/store/manga/9999/004.0/compressed";var pvalue=["/a00${n}.jpg?token=${n}","/a00${n + 1}.jpg?token=${n + 1}"];`);

const FUN = 'https://fanfox.net/manga/moonlight_courier/c004/chapterfun.ashx';

test('getChapter, legacy layout: asks chapterfun.ashx for each page, in order', async () => {
  const routes = { [CHAPTER]: legacyHtml() };
  for (const n of [1, 2, 3]) {
    routes[`${FUN}?cid=123456&page=${n}&key=k3y`] = async () => {
      await new Promise((resolve) => setTimeout(resolve, (4 - n) * 5)); // later pages answer first
      return chapterfun(n);
    };
  }
  const ctx = fakeCtx(routes);
  const { pages } = await fanfox.getChapter(CHAPTER, ctx);

  assert.deepEqual(pages, [1, 2, 3].map((n) => `${CDN}/a00${n}.jpg?token=${n}`));
  const asked = ctx.calls.slice(1);
  assert.equal(asked.length, 3);
  assert.ok(asked.every((call) => call.ref === CHAPTER), 'the chapter page is sent as Referer');
  assert.ok(asked.every((call) => call.cache === false), 'one-off token answers are not meant to be kept');
});

test('getChapter, legacy layout: counts pages from the pager when the script does not say', async () => {
  const routes = { [CHAPTER]: legacyHtml('') };
  for (const n of [1, 2, 3]) routes[`${FUN}?cid=123456&page=${n}&key=k3y`] = chapterfun(n);
  const { pages } = await fanfox.getChapter(CHAPTER, fakeCtx(routes));
  assert.equal(pages.length, 3);
});

test('getChapter: reports a page whose script has no image, with details', async () => {
  const routes = { [CHAPTER]: legacyHtml('var imagecount = 1;'), [`${FUN}?cid=123456&page=1&key=k3y`]: 'var nothing = 1;' };
  await assert.rejects(() => fanfox.getChapter(CHAPTER, fakeCtx(routes)), (err) => {
    assert.equal(err.code, 'no_pages');
    assert.match(err.debug.url, /chapterfun\.ashx\?cid=123456&page=1/);
    return true;
  });
});

test('getChapter: no pages at all, or a human check', async () => {
  await assert.rejects(() => fanfox.getChapter(CHAPTER, fakeCtx({ [CHAPTER]: '<html><body>gone</body></html>' })), {
    code: 'no_pages',
  });
  await assert.rejects(
    () => fanfox.getChapter(CHAPTER, fakeCtx({ [CHAPTER]: '<html><head><title>Just a moment...</title></head></html>' })),
    { code: 'blocked' },
  );
});
