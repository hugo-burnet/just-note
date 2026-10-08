import { chapterPage, homePage, LELSCAN, SERIES, seriesPage } from '../pretend/lelscanPages.ts';
import { numberIn } from './Pictures.ts';
import type { Pictures } from './Pictures.ts';
import { page } from './PretendWeb.ts';
import type { Pretender } from './PretendWeb.ts';

const HOST = new URL(LELSCAN).hostname;
const SERIES_PATH = /^\/lecture-(?:en-)?ligne-([a-z0-9-]+?)(?:\.php)?$/;
const CHAPTER_PATH = /^\/scan-([a-z0-9-]+)\/(\d+(?:\.\d+)?)(?:\/(\d+))?$/;

/** A made-up LelScan: other series, other titles, the real shapes (see test/pretend/lelscanPages.ts). */
export class PretendLelScan implements Pretender {
  private readonly pictures: Pictures;

  constructor(pictures: Pictures) {
    this.pictures = pictures;
  }

  respond(url: URL): Response | null {
    if (url.hostname !== HOST) return null;
    const { pathname } = url;
    if (pathname.startsWith('/mangas/')) return this.pictures.response(numberIn(pathname));
    if (pathname === '/') return page(homePage());

    const series = SERIES.find((candidate) => candidate.slug === SERIES_PATH.exec(pathname)?.[1]);
    if (series) return page(seriesPage(series));

    const chapter = CHAPTER_PATH.exec(pathname);
    const owner = SERIES.find((candidate) => candidate.slug === chapter?.[1]);
    const known = owner?.chapters.find((candidate) => candidate.number === chapter?.[2]);
    const number = Number(chapter?.[3] ?? 1);
    if (owner && known && number >= 1 && number <= known.pages) return page(chapterPage(owner, known.number, number));
    return page('not found', 404);
  }
}
