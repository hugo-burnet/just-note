import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemonicScansSource, FanFoxSource, ScanMangaSource, SushiScanSource, WebtoonSource } from '../../src/engine/index.ts';
import type { Source } from '../../src/engine/index.ts';
import * as demonic from '../pretend/demonicscansPages.ts';
import * as scanmanga from '../pretend/scanmangaPages.ts';
import * as sushi from '../pretend/sushiscanPages.ts';
import * as webtoon from '../pretend/webtoonPages.ts';
import { FakeTransport, fixture, LinkedomParser } from './helpers.ts';

// What every site's glance has to do, whatever the site: a series' cover and genres from its first page, with
// nothing else asked and whatever its chapters are (none yet, none that can be made out). This is what the
// filter of Discover reads for each result, and a series that cannot be glanced at is a series it cannot index.
const parser = new LinkedomParser();

interface Case {
  readonly name: string;
  readonly make: (pages: Record<string, string>) => { source: Source; transport: FakeTransport };
  readonly address: string;
  /** The page of a series with its chapters. */
  readonly whole: string;
  /** The same page, with no chapter at all. */
  readonly bare: string;
  readonly glance: { readonly cover: string | null; readonly genres: readonly string[] };
}

function over<T extends Source>(Make: new (io: { transport: FakeTransport; parser: LinkedomParser }) => T) {
  return (pages: Record<string, string>) => {
    const transport = new FakeTransport(pages);
    return { source: new Make({ transport, parser }), transport };
  };
}

const FOX = 'https://fanfox.net/manga/moonlight_courier/';
const foxPage = fixture('fanfox/series.html');
const [LANTERN_SCAN] = scanmanga.SERIES;
if (!LANTERN_SCAN) throw new Error('the pretend series are gone');

const CASES: readonly Case[] = [
  {
    name: 'FanFox',
    make: over(FanFoxSource),
    address: FOX,
    whole: foxPage,
    bare: foxPage.replace(/<ul class="detail-main-list">[\s\S]*?<\/ul>/, '').replace(/<a href="\/manga\/moonlight_courier\/c004\/2.html">Continue reading<\/a>/, ''),
    glance: { cover: 'https://fmcdn.mfcdn.net/store/manga/9999/cover.jpg?token=abc&ttl=1', genres: ['Adventure', 'Fantasy'] },
  },
  {
    name: 'WEBTOON',
    make: over(WebtoonSource),
    address: webtoon.SERIES_URL,
    // Three more pages of episodes follow this one: a glance does not walk them.
    whole: webtoon.seriesPage({ episodes: [{ no: 3, title: 'Ep. 3', date: 'Oct 3, 2026' }], pages: [1, 2, 3, 4] }),
    bare: webtoon.seriesPage({ episodes: [], pages: [] }),
    glance: { cover: webtoon.SERIES_COVER, genres: ['Fantasy'] },
  },
  {
    name: 'SushiScan',
    make: over(SushiScanSource),
    address: sushi.seriesAddress(sushi.LANTERN),
    whole: sushi.seriesPage(sushi.LANTERN),
    bare: sushi.seriesPage({ ...sushi.LANTERN, chapters: [] }),
    glance: { cover: sushi.LANTERN.cover, genres: ['Action', 'Fantasy'] },
  },
  {
    name: 'Demonic Scans',
    make: over(DemonicScansSource),
    address: demonic.seriesAddress(demonic.LANTERN),
    whole: demonic.seriesPage(demonic.LANTERN),
    bare: demonic.seriesPage({ ...demonic.LANTERN, chapters: [] }),
    glance: { cover: demonic.LANTERN.cover, genres: ['Action', 'Fantasy'] },
  },
  {
    name: 'Scan-Manga',
    make: over(ScanMangaSource),
    address: scanmanga.seriesAddress(LANTERN_SCAN),
    whole: scanmanga.seriesPage(LANTERN_SCAN),
    // The buttons that start reading link a chapter too: they go with the rows.
    bare: scanmanga.seriesPage({ ...LANTERN_SCAN, chapters: [] }).replace(/<a [^>]*class="(?:startRead|ReadLast)">[^<]*<\/a>/g, ''),
    glance: { cover: scanmanga.coverAddress(LANTERN_SCAN, 1), genres: ['Manga', 'Seinen'] },
  },
];

for (const one of CASES) {
  test(`${one.name}: a glance gives the cover and the genres of a series from its page alone`, async () => {
    const { source, transport } = one.make({ [one.address]: one.whole });
    assert.deepEqual(await source.glance(one.address), one.glance);
    assert.deepEqual(transport.asked.map((asked) => asked.url), [one.address], 'one request, and not one for each page of its chapters');
    assert.deepEqual(transport.asked.map((asked) => asked.request), [{ cache: false }], 'and not kept among the pages that are kept to be read again offline');
  });

  test(`${one.name}: a series with no chapter to be made out still says its genres`, async () => {
    const { source } = one.make({ [one.address]: one.bare });
    await assert.rejects(() => source.getSeries(one.address), { code: 'no_chapters' }, 'the whole series is refused, as it always was');
    assert.deepEqual(await source.glance(one.address), one.glance);
  });

  test(`${one.name}: what is not the page of a series is no answer, so that nothing is kept of it`, async () => {
    const check = one.make({ [one.address]: '<html><head><title>Just a moment...</title></head><body></body></html>' });
    await assert.rejects(() => check.source.glance(one.address), { code: 'blocked' });
    const lost = one.make({ [one.address]: '<html><head><title>Oops</title></head><body>Nothing here</body></html>' });
    await assert.rejects(() => lost.source.glance(one.address), { code: 'no_series' });
  });
}
