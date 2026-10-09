import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ScanMangaSource, SourceError } from '../../src/engine/index.ts';
import type { RenderedPage } from '../../src/engine/index.ts';
import { allTitlesPage, chapterAddress, chapterPath, coverAddress, homePage, NOVEL, SCANMANGA, SERIES, seriesAddress, seriesPage } from '../pretend/scanmangaPages.ts';
import { FakeTransport, LinkedomParser } from './helpers.ts';
import type { Route } from './helpers.ts';

const [LANTERN, EMBER] = SERIES;
if (!LANTERN || !EMBER) throw new Error('the pretend series are gone');

/** A transport that can also show a page in a browser of its own, as the installed app can. */
class RenderingTransport extends FakeTransport {
  readonly rendered: string[] = [];
  private readonly show: (url: string) => RenderedPage;

  constructor(routes: Record<string, Route>, show: (url: string) => RenderedPage) {
    super(routes);
    this.show = show;
  }

  async render(url: string): Promise<RenderedPage> {
    this.rendered.push(url);
    return this.show(url);
  }
}

const parser = new LinkedomParser();
function scanmanga(routes: Record<string, Route>) {
  const transport = new FakeTransport(routes);
  return { source: new ScanMangaSource({ transport, parser }), transport };
}

test('Scan-Manga is French, read as a long column, and starts from its latest publications', () => {
  const { source } = scanmanga({});
  assert.deepEqual(source.reading, { mode: 'scroll', rtl: false });
  assert.deepEqual(source.languages, ['fr']);
  assert.equal(source.home(), `${SCANMANGA}/?po`);
});

test('getSeries reads the title, the cover, who made it, and lists the chapters oldest first, half chapters included', async () => {
  const { source } = scanmanga({ [seriesAddress(LANTERN)]: seriesPage(LANTERN) });
  const series = await source.getSeries(seriesAddress(LANTERN));

  assert.equal(series.title, 'Lantern Keeper');
  assert.equal(series.url, seriesAddress(LANTERN));
  assert.equal(series.cover, coverAddress(LANTERN, 1));
  assert.equal(series.author, 'Mara Quill et Tov Reed');
  assert.deepEqual(series.genres, ['Seinen']);
  assert.deepEqual(series.chapters.map((chapter) => [chapter.key, chapter.number, chapter.title]), [
    ['c1', 1, 'Chapitre 1'],
    ['c2', 2, 'Chapitre 2'],
    ['c2.5', 2.5, 'Chapitre 2.5 – Lantern Night'],
    ['c3', 3, 'Chapitre 3'],
  ]);
  // Each chapter knows its series, which its own address does not say.
  assert.deepEqual(series.chapters.map((chapter) => chapter.url), ['1', '2', '2-5', '3'].map((n) => chapterAddress(LANTERN, n)));
});

test('getSeries gives the synopsis in full, not as the tags cut it, without the mark the page hides in it', async () => {
  const { source } = scanmanga({ [seriesAddress(LANTERN)]: seriesPage(LANTERN) });
  const { description } = await source.getSeries(seriesAddress(LANTERN));
  assert.equal(description, 'Mara keeps the last lantern of a city that no longer sleeps, and learns why it must never go out, even for a night. A spin-off of Another Series.');
  // Without that block, the tag's text stands in.
  const bare = seriesPage(LANTERN).replace('titres_desc', 'other');
  assert.match((await scanmanga({ [seriesAddress(LANTERN)]: bare }).source.getSeries(seriesAddress(LANTERN))).description, /^Mara keeps the last lantern.*\.\.\.$/);
});

test('getSeries names a chapter after its row even when a button that starts reading links it first', async () => {
  // The buttons come before the rows: here the first link to chapter 2.5 is the one that starts reading.
  const page = seriesPage(LANTERN).replace(`href="${SCANMANGA}${chapterPath(LANTERN, '1')}" class="startRead"`, `href="${SCANMANGA}${chapterPath(LANTERN, '2-5')}" class="startRead"`);
  assert.ok(page.indexOf(chapterPath(LANTERN, '2-5')) < page.indexOf('chapt_m'), 'the button is ahead of the rows');
  const { source } = scanmanga({ [seriesAddress(LANTERN)]: page });
  const chapters = (await source.getSeries(seriesAddress(LANTERN))).chapters;
  assert.equal(chapters.find((chapter) => chapter.key === 'c2.5')?.title, 'Chapitre 2.5 – Lantern Night');
  assert.equal(chapters.length, 4);
});

test('getSeries keeps the title of a series whose name has punctuation, and an id with two numbers', async () => {
  const { source } = scanmanga({ [seriesAddress(EMBER)]: seriesPage(EMBER) });
  const series = await source.getSeries(seriesAddress(EMBER));
  assert.equal(series.title, 'Ember Courier: The Last Mile');
  assert.deepEqual(series.chapters.map((chapter) => chapter.key), ['c1', 'c2']);
});

test('getSeries takes no chapter from another series the page happens to link, and says so when it finds none', async () => {
  const mixed = seriesPage(LANTERN, [EMBER]);
  const { source } = scanmanga({ [seriesAddress(LANTERN)]: mixed, [seriesAddress(EMBER)]: seriesPage(LANTERN, [EMBER]).replace('<ul class="chapters">', '<ul class="none">') });
  assert.equal((await source.getSeries(seriesAddress(LANTERN))).chapters.length, 4);
  // A page whose own chapters carry another name (the series was renamed) is read as the page gives it.
  const renamed = seriesPage(EMBER).replaceAll('Ember-Courier-The-Last-Mile-Chapitre', 'Ember-Courier-Chapitre');
  assert.equal((await scanmanga({ [seriesAddress(EMBER)]: renamed }).source.getSeries(seriesAddress(EMBER))).chapters.length, 2);
  await assert.rejects(() => scanmanga({ [seriesAddress(EMBER)]: '<html><title>Rien</title></html>' }).source.getSeries(seriesAddress(EMBER)), { code: 'no_chapters' });
  await assert.rejects(() => scanmanga({ [seriesAddress(EMBER)]: '<title>Just a moment...</title>' }).source.getSeries(seriesAddress(EMBER)), { code: 'blocked' });
});

test('getList gives the series of a page in the order it shows them, each with the cover its card swaps in', async () => {
  const { source } = scanmanga({ [`${SCANMANGA}/?po`]: homePage() });
  const items = await source.getList(`${SCANMANGA}/?po`);
  assert.deepEqual(items, SERIES.map((series) => ({ url: seriesAddress(series), title: series.title, cover: coverAddress(series, 2) })));
});

test('getList leaves the novels out (text, which a reader of pictures cannot show), by their card or by their address', async () => {
  const withNovel = homePage([LANTERN, NOVEL, EMBER]);
  const { source } = scanmanga({ [`${SCANMANGA}/?po`]: withNovel, [`${SCANMANGA}/scanlation/liste_series.html`]: allTitlesPage([LANTERN, NOVEL]) });
  assert.deepEqual((await source.getList(`${SCANMANGA}/?po`)).map((item) => item.title), ['Lantern Keeper', 'Ember Courier: The Last Mile']);
  assert.deepEqual((await source.getList(`${SCANMANGA}/scanlation/liste_series.html`)).map((item) => item.title), ['Lantern Keeper']);
  // A novel whose card does not say so is still told by its address.
  const bare = withNovel.replace('novel_ly publi', 'publi');
  assert.equal((await scanmanga({ [`${SCANMANGA}/?po`]: bare }).source.getList(`${SCANMANGA}/?po`)).length, 2);
});

test('getList names a series by the text of its link, without the note the list of all the titles adds to the updated ones', async () => {
  const { source } = scanmanga({ [`${SCANMANGA}/scanlation/liste_series.html`]: allTitlesPage() });
  const items = await source.getList(`${SCANMANGA}/scanlation/liste_series.html`);
  assert.deepEqual(items.map((item) => item.title), ['Lantern Keeper', 'Ember Courier: The Last Mile']);
  assert.ok(items.every((item) => item.cover === null), 'that list has no pictures');
});

test('getList shows no more than a page can bear, whatever the list of all the titles holds', async () => {
  const many = Array.from({ length: 500 }, (_, i) => `<div class="listing"><a href="${SCANMANGA}/${20000 + i}/Series-${i}.html">Series ${i}</a></div>`).join('');
  const { source } = scanmanga({ [`${SCANMANGA}/scanlation/liste_series.html`]: `<html><body>${many}</body></html>` });
  assert.equal((await source.getList(`${SCANMANGA}/scanlation/liste_series.html`)).length, 300);
});

test('a search looks through every title of the list, not only the first page of it, and asks the site once for several searches', async () => {
  const many = Array.from({ length: 500 }, (_, i) => `<div class="listing"><a href="${SCANMANGA}/${20000 + i}/Series-${i}.html">Series ${i}${i === 450 ? ' Lanterns' : ''}</a></div>`).join('');
  const list = `${SCANMANGA}/scanlation/liste_series.html`;
  const { source, transport } = scanmanga({ [list]: `<html><body>${many}</body></html>` });
  assert.deepEqual((await source.getList(source.searchUrl('lanterns'))).map((item) => item.title), ['Series 450 Lanterns']);
  assert.equal((await source.getList(source.searchUrl('series 49'))).length, 15, 'every word has to be in the title: 49, 149, 249, 349, 449 and 490 to 499');
  assert.equal((await source.getList(source.searchUrl('series'))).length, 300, 'a page of results is bounded');
  assert.equal(transport.asked.length, 1);
});

test('getList names a series from its address when its card says nothing, and does not list one twice', async () => {
  const bare = `<html><body><a href="/13001/Lantern-Keeper.html"></a><a href="/13001/Lantern-Keeper.html">Lantern Keeper</a><a href="/13003/Salt-Road-Journal.html"></a></body></html>`;
  const { source } = scanmanga({ [`${SCANMANGA}/?po`]: bare });
  const items = await source.getList(`${SCANMANGA}/?po`);
  assert.deepEqual(items, [
    { url: seriesAddress(LANTERN), title: 'Lantern Keeper', cover: null },
    { url: `${SCANMANGA}/13003/Salt-Road-Journal.html`, title: 'Salt Road Journal', cover: null },
  ]);
});

test('a search is answered from the list of all the titles, which is the only thing asked of the site, and once', async () => {
  const list = `${SCANMANGA}/scanlation/liste_series.html`;
  const { source, transport } = scanmanga({ [list]: allTitlesPage() });
  assert.deepEqual((await source.getList(source.searchUrl('ember last'))).map((item) => item.title), ['Ember Courier: The Last Mile']);
  assert.deepEqual(await source.getList(source.searchUrl('nothing like it')), []);
  assert.deepEqual(transport.asked.map((asked) => asked.url), [list], 'two searches, one request: the list is kept for a few minutes');
});

test('a listing that is a check page says so', async () => {
  const { source } = scanmanga({ [`${SCANMANGA}/?po`]: '<title>Just a moment...</title>' });
  await assert.rejects(() => source.getList(`${SCANMANGA}/?po`), { code: 'blocked' });
});

test('complete finds the series of a chapter link pasted from the site, in the way back its page offers', async () => {
  const page = `${SCANMANGA}${chapterPath(LANTERN, '2-5')}`;
  const back = `<html><body><a class="lelHgHistoryBack" href="/13001/Lantern-Keeper.html"></a><a href="/13002-45678/Ember-Courier-The-Last-Mile.html">next</a></body></html>`;
  const { source, transport } = scanmanga({ [page]: back });
  const target = source.resolve(page);
  assert.deepEqual(target, { kind: 'chapter', url: page, key: 'c2.5' });
  assert.deepEqual(await source.complete(target ?? { kind: 'list', url: '' }), source.resolve(chapterAddress(LANTERN, '2-5')));
  assert.deepEqual(transport.asked.map((asked) => asked.url), [page], 'the page is asked for without a mark');
});

test('complete falls back on a link to the series that has the chapter\'s name, and gives up without one', async () => {
  const page = `${SCANMANGA}${chapterPath(EMBER, '1')}`;
  const noBack = `<html><body><a href="/13001/Lantern-Keeper.html">other</a><a href="https://www.scan-manga.com/13002-45678/Ember-Courier-The-Last-Mile.html">series</a></body></html>`;
  const found = await scanmanga({ [page]: noBack }).source.complete({ kind: 'chapter', url: page, key: 'c1' });
  assert.equal(found?.seriesUrl, seriesAddress(EMBER));
  assert.equal(found?.url, chapterAddress(EMBER, '1'));
  const lost = await scanmanga({ [page]: '<html><body><a href="/Teams.html">teams</a></body></html>' }).source.complete({ kind: 'chapter', url: page, key: 'c1' });
  assert.equal(lost, null);
});

test('complete leaves a target that is whole as it is, without asking the site', async () => {
  const { source, transport } = scanmanga({});
  const whole = source.resolve(chapterAddress(LANTERN, '1'));
  assert.equal(await source.complete(whole ?? { kind: 'list', url: '' }), whole);
  assert.equal(transport.asked.length, 0);
});

test('getChapter shows the page in a browser of the app\'s own, without the mark, and gives the pictures it built', async () => {
  const pictures = ['one', 'two', 'three'].map((name) => `${SCANMANGA}/__page/130013/${name}`);
  const transport = new RenderingTransport({}, (url) => ({ text: '<html>', url, pictures }));
  const source = new ScanMangaSource({ transport, parser });
  assert.deepEqual(await source.getChapter(chapterAddress(LANTERN, '3')), { pages: pictures });
  assert.deepEqual(transport.rendered, [`${SCANMANGA}${chapterPath(LANTERN, '3')}`]);
});

test('getChapter says what is wrong when a chapter has no pictures, or when the browser cannot be used', async () => {
  const empty = (text: string): ScanMangaSource => new ScanMangaSource({ transport: new RenderingTransport({}, (url) => ({ text, url, pictures: [] })), parser });
  await assert.rejects(
    () => empty('<title>Chapitre 3</title>').getChapter(chapterAddress(LANTERN, '3')),
    (error: unknown) => error instanceof SourceError && error.code === 'no_pages' && error.debug['pageTitle'] === 'Chapitre 3',
  );
  await assert.rejects(() => empty('<title>Just a moment...</title>').getChapter(chapterAddress(LANTERN, '3')), { code: 'blocked' });
  // Through the proxy there is no such browser: the pictures cannot be had.
  await assert.rejects(() => scanmanga({}).source.getChapter(chapterAddress(LANTERN, '3')), { code: 'unsupported' });
});
