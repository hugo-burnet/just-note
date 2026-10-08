import type { SourceTarget } from '../../model.ts';

const ORIGIN = 'https://lelscans.net';
const HOSTS = ['lelscans.net'];

// /lecture-en-ligne-<slug>[.php]  or  /lecture-ligne-<slug>[.php]   a series (the site has used both)
// /scan-<slug>/<chapter>[/<page>]                                   a chapter, at a given page
// Every spelling of a series' address is served the same, so one of them stands for all.
const SERIES_PATH = /^\/lecture-(?:en-)?ligne-([a-z0-9][a-z0-9-]*)(?:\.php)?\/?$/i;
const CHAPTER_PATH = /^\/scan-([a-z0-9][a-z0-9-]*)\/(\d+(?:\.\d+)?)(?:\/\d+)?\/?$/i;

const isOwnHost = (host: string): boolean => HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

export class LelScanUrls {
  static readonly origin = ORIGIN;

  /**
   * Tells what a link points at, and gives it a canonical form (one spelling for a
   * series, the first page for a chapter) so that the same thing is never stored twice.
   */
  static resolve(input: string): SourceTarget | null {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return null;
    }
    if (!/^https?:$/.test(url.protocol) || !isOwnHost(url.hostname)) return null;

    const chapter = CHAPTER_PATH.exec(url.pathname);
    if (chapter) {
      const slug = (chapter[1] ?? '').toLowerCase();
      const number = chapter[2] ?? '';
      return { kind: 'chapter', url: LelScanUrls.chapter(slug, number), key: `c${number}`, seriesUrl: LelScanUrls.series(slug) };
    }
    const series = SERIES_PATH.exec(url.pathname);
    if (series) return { kind: 'series', url: LelScanUrls.series((series[1] ?? '').toLowerCase()) };
    // The home page, a list of series... anything else of the site.
    return { kind: 'list', url: ORIGIN + url.pathname + url.search };
  }

  static series(slug: string): string {
    return `${ORIGIN}/lecture-en-ligne-${slug}`;
  }

  static chapter(slug: string, number: string): string {
    return `${ORIGIN}/scan-${slug}/${number}`;
  }

  /** The n-th page of a chapter (counting from 1). */
  static page(chapterUrl: string, page: number): string {
    return `${chapterUrl}/${page}`;
  }

  /** The cover is not on the series page: it sits at a fixed place of the site. */
  static cover(slug: string): string {
    return `${ORIGIN}/mangas/${slug}/thumb_cover.jpg`;
  }

  static slugOf(seriesUrl: string): string {
    return SERIES_PATH.exec(new URL(seriesUrl).pathname)?.[1]?.toLowerCase() ?? '';
  }

  /**
   * The site has no search: asking for one is the home page with `q`, which the source
   * keeps for itself (it filters the list of series) and never sends to the site.
   */
  static search(query: string): string {
    return `${ORIGIN}/?q=${encodeURIComponent(query)}`;
  }

  static queryOf(url: string): string | null {
    try {
      return new URL(url).searchParams.get('q');
    } catch {
      return null;
    }
  }

  static withoutQuery(url: string): string {
    const clean = new URL(url);
    clean.searchParams.delete('q');
    return clean.href;
  }

  static chapterNumber(key: string): number {
    return Number(/^c(\d+(?:\.\d+)?)$/.exec(key)?.[1] ?? NaN);
  }
}
