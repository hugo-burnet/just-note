import { fixture } from '../engine/helpers.ts';
import { pack } from '../engine/pack.ts';
import { numberIn } from './Pictures.ts';
import type { Pictures } from './Pictures.ts';
import { page } from './PretendWeb.ts';
import type { Pretender } from './PretendWeb.ts';

export const FANFOX_SERIES = 'https://fanfox.net/manga/moonlight_courier/';
export const fanfoxChapter = (key: string): string => `${FANFOX_SERIES}${key}/1.html`;

// How many images each chapter of the made-up series has.
const PAGES: Readonly<Record<string, number>> = { c001: 3, c002: 4, 'v01/c003': 3, 'c003.5': 2, c004: 5 };
const CATALOG: ReadonlyArray<readonly [slug: string, title: string]> = [
  ['moonlight_courier', 'Moonlight Courier'],
  ['clockwork_garden', 'Clockwork Garden'],
  ['paper_lanterns', 'Paper Lanterns'],
];

const IMAGES = '//fmcdn.mfcdn.net/store/manga/9999';

const listing = (items: ReadonlyArray<readonly [string, string]>): string =>
  `<!doctype html><ul>${items
    .map(([slug, title]) => `<li><a href="/manga/${slug}/" title="${title}"><img src="${IMAGES}/cover.jpg" alt="${title}"></a></li>`)
    .join('')}</ul>`;

// The usual layout: every image address sits in one packed script.
const inlineChapter = (key: string, count: number): string =>
  `<!doctype html><script src="//static.fanfox.net/chapter_bar.js"></script><script>${pack(
    `var newImgs=[${Array.from({ length: count }, (_, i) => `'${IMAGES}/${key}/${i + 1}.png?token=${i + 1}'`).join(',')}];`,
  )}</script>`;

// The older layout: one request per page, each answered with a packed script.
const legacyChapter = '<!doctype html><script>var comicid = 9999; var chapterid = 777; var imagecount = 2;</script><input type="hidden" id="dm5_key" value="k">';
const legacyPage = (n: number): string =>
  pack(`var pix="${IMAGES}/c003.5";var pvalue=["/${n}.png?token=${n}","/${n + 1}.png?token=${n + 1}"];`);

/** A made-up FanFox: the titles, pages and layouts are invented, the shapes are the real ones. */
export class PretendFanFox implements Pretender {
  private readonly seriesHtml = fixture('fanfox/series.html');
  private readonly pictures: Pictures;

  constructor(pictures: Pictures) {
    this.pictures = pictures;
  }

  respond(url: URL): Response | null {
    if (url.hostname === 'fmcdn.mfcdn.net') return this.pictures.response(numberIn(url.pathname));
    if (url.hostname !== 'fanfox.net') return null;
    const { pathname } = url;
    if (pathname === '/' || pathname === '/directory/') return page(listing(CATALOG));
    if (pathname === '/search') {
      const wanted = (url.searchParams.get('title') ?? '').toLowerCase();
      return page(listing(CATALOG.filter(([, title]) => title.toLowerCase().includes(wanted))));
    }
    if (pathname === '/manga/forbidden_tale/') return page('nope', 403);
    if (pathname === '/manga/moonlight_courier/') return page(this.seriesHtml);
    if (pathname.endsWith('/c003.5/chapterfun.ashx')) return page(legacyPage(Number(url.searchParams.get('page'))));
    const chapter = /^\/manga\/moonlight_courier\/((?:v01\/)?c[\d.]+)\/1\.html$/.exec(pathname)?.[1];
    const count = chapter ? PAGES[chapter] : undefined;
    if (chapter && count) return page(chapter === 'c003.5' ? legacyChapter : inlineChapter(chapter, count));
    return page('not found', 404);
  }
}
