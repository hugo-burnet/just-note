import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemonicScansSource, SourceError } from '../../src/engine/index.ts';
import { chapterAddress, chapterPage, DEMONIC, EMBER, LANTERN, picture, searchAnswer, seriesAddress, seriesPage, updatesPage } from '../pretend/demonicscansPages.ts';
import { FakeTransport, LinkedomParser } from './helpers.ts';
import type { Route } from './helpers.ts';

const LATEST = `${DEMONIC}/lastupdates.php?list=1`;
const parser = new LinkedomParser();
const demonic = (routes: Record<string, Route>) => {
  const transport = new FakeTransport(routes);
  return { source: new DemonicScansSource({ transport, parser }), transport };
};
const isCode = (code: string) => (error: unknown) => error instanceof SourceError && error.code === code;

test('Demonic Scans is English, read as a column, and starts from its latest updates', () => {
  const { source } = demonic({});
  assert.deepEqual(source.languages, ['en']);
  assert.deepEqual(source.reading, { mode: 'scroll', rtl: false });
  assert.equal(source.home(), `${DEMONIC}/lastupdates.php?list=1`);
  assert.equal(source.searchUrl('ember courier'), `${DEMONIC}/search.php?manga=ember%20courier`);
});

test('the latest updates list each series once, with its name and its cover, and leave the advertisements out', async () => {
  const { source } = demonic({ [LATEST]: updatesPage() });
  assert.deepEqual(await source.getList(LATEST), [
    { url: seriesAddress(LANTERN), title: "The Keeper's Lantern", cover: LANTERN.cover },
    { url: seriesAddress(EMBER), title: 'Ember Courier', cover: EMBER.cover },
  ]);
});

test('a search reads the bare links the site answers with', async () => {
  const url = `${DEMONIC}/search.php?manga=ember`;
  const { source } = demonic({ [url]: searchAnswer([EMBER]) });
  assert.deepEqual(await source.getList(url), [{ url: seriesAddress(EMBER), title: 'Ember Courier', cover: EMBER.cover }]);
  assert.deepEqual(await demonic({ [url]: '' }).source.getList(url), []);
  await assert.rejects(() => demonic({ [url]: '<title>Just a moment...</title>' }).source.getList(url), isCode('blocked'));
});

test('getSeries reads the title, the cover, the facts, the genres and the synopsis, and lists the chapters oldest first', async () => {
  const { source } = demonic({ [seriesAddress(LANTERN)]: seriesPage(LANTERN) });
  const series = await source.getSeries(seriesAddress(LANTERN));
  assert.equal(series.title, "The Keeper's Lantern");
  assert.equal(series.cover, LANTERN.cover);
  assert.equal(series.author, 'Mara Quill');
  assert.equal(series.status, 'Ongoing');
  assert.deepEqual(series.genres, ['Action', 'Fantasy']);
  assert.equal(series.description, LANTERN.synopsis);
  assert.deepEqual(series.chapters.map((chapter) => [chapter.key, chapter.number, chapter.title, chapter.date]), [
    ['c1', 1, 'Chapter 1', '2025-07-21'],
    ['c2', 2, 'Chapter 2', '2025-07-22'],
    ['c2.5', 2.5, 'Chapter 2.5', '2025-07-22'],
    ['c3', 3, 'Chapter 3', '2025-07-23'],
  ]);
  // A chapter's address does not say which series it is of: the address this source gives it does.
  assert.equal(series.chapters[0]?.url, `${chapterAddress(LANTERN, '1')}#/manga/${LANTERN.name}`);
});

test('a series page with no chapter says so, and a human check is told apart', async () => {
  const url = seriesAddress(EMBER);
  await assert.rejects(() => demonic({ [url]: '<html><title>Nothing</title><body></body></html>' }).source.getSeries(url), isCode('no_chapters'));
  await assert.rejects(() => demonic({ [url]: '<html><head><title>Just a moment...</title></head></html>' }).source.getSeries(url), isCode('blocked'));
});

test('a chapter gives its pictures in order, and the site is asked for its page without the mark of the series', async () => {
  const page = chapterAddress(EMBER, '2');
  const { source, transport } = demonic({ [page]: chapterPage(EMBER, '2', 3) });
  const { pages } = await source.getChapter(`${page}#/manga/${EMBER.name}`);
  assert.deepEqual(pages, [1, 2, 3].map((n) => picture(EMBER, '2', n)));
  assert.deepEqual(transport.asked.map((asked) => asked.url), [page]);
  await assert.rejects(() => demonic({ [page]: '<html><title>Oops</title></html>' }).source.getChapter(page), isCode('no_pages'));
});

test('a chapter link pasted from the site finds its series on its page', async () => {
  const page = chapterAddress(LANTERN, '2');
  const { source } = demonic({ [page]: chapterPage(LANTERN, '2', 1) });
  const pasted = source.resolve(page);
  assert.deepEqual(pasted, { kind: 'chapter', url: page, key: 'c2' });
  assert.deepEqual(await source.complete(pasted!), { kind: 'chapter', url: `${page}#/manga/${LANTERN.name}`, key: 'c2', seriesUrl: seriesAddress(LANTERN) });
  assert.equal(await demonic({ [page]: '<html><body>nothing</body></html>' }).source.complete(pasted!), null);
});
