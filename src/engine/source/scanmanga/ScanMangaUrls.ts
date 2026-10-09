import type { SourceTarget } from '../../model.ts';

const ORIGIN = 'https://m.scan-manga.com';
const HOSTS = ['scan-manga.com'];

// /<id>[-<digits>]/<Slug>.html                                      a series
// /lecture-en-ligne/<Slug>-Chapitre-<n>[-<n>]-FR_<id>.html           a chapter ("12-5" is chapter 12.5)
// The site spells its series' addresses on www. and on m. alike; the mobile site is the one read.
const SERIES_PATH = /^\/(\d+(?:-\d+)?)\/([^/]+)\.html$/i;
const CHAPTER_PATH = /^\/lecture-en-ligne\/(.+)-([a-z]+)-(\d+(?:-\d+)?)-[a-z]{2}_(\d+)\.html$/i;

const isOwnHost = (host: string): boolean => HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

/** What follows the `#` of a chapter's address: the path of its series. */
function markOf(url: URL): string {
  try {
    return decodeURIComponent(url.hash.slice(1));
  } catch {
    return '';
  }
}

export class ScanMangaUrls {
  static readonly origin = ORIGIN;

  /**
   * Tells what a link points at, and gives it a canonical form (the mobile site, the same
   * spelling whatever the host it came with) so that the same thing is never stored twice.
   *
   * A chapter's address does not name its series (the series has a number the chapter does
   * not repeat), so the address this source gives a chapter carries it after a `#`, which the
   * site never sees. A chapter link pasted from the site has no such mark: it is a chapter
   * whose series is still to be found (see ScanMangaSource.complete).
   */
  static resolve(input: string): SourceTarget | null {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return null;
    }
    if (!/^https?:$/.test(url.protocol) || !isOwnHost(url.hostname)) return null;

    const chapter = ScanMangaUrls.chapterAt(url.pathname, markOf(url));
    if (chapter) return chapter;
    if (SERIES_PATH.test(url.pathname) && !CHAPTER_PATH.test(url.pathname)) return { kind: 'series', url: ORIGIN + url.pathname };
    // The home page, the list of series, a ranking... anything else of the site.
    return { kind: 'list', url: ORIGIN + url.pathname + url.search };
  }

  /** The series a path (`/13176/Some-Title.html`) names, as an address; null when it names none. */
  static seriesAt(path: string): string | null {
    return SERIES_PATH.test(path) ? ORIGIN + path : null;
  }

  /** The address of a chapter as this source gives it: the page's own, and the series it belongs to. */
  static chapter(pageAddress: string, seriesUrl: string): string | null {
    try {
      const page = new URL(pageAddress);
      return isOwnHost(page.hostname) ? (ScanMangaUrls.chapterAt(page.pathname, new URL(seriesUrl).pathname)?.url ?? null) : null;
    } catch {
      return null;
    }
  }

  /** A chapter, with its series when `seriesPath` names one; without it, the address is the page's own. */
  private static chapterAt(pathname: string, seriesPath: string): SourceTarget | null {
    const match = CHAPTER_PATH.exec(pathname);
    if (!match) return null;
    const number = (match[3] ?? '').replace('-', '.');
    const key = `${(match[2] ?? 'c').charAt(0).toLowerCase()}${number}`;
    const parent = ScanMangaUrls.seriesAt(seriesPath);
    return parent ? { kind: 'chapter', url: `${ORIGIN}${pathname}#${seriesPath}`, key, seriesUrl: parent } : { kind: 'chapter', url: ORIGIN + pathname, key };
  }

  /** What is asked of the site for a chapter: its address without the mark the series is carried in. */
  static page(chapterUrl: string): string {
    const page = new URL(chapterUrl);
    page.hash = '';
    return page.href;
  }

  /** The name a series has in its address, and a chapter in its own ("Some-Title"). */
  static slugOf(address: string): string {
    const path = new URL(address).pathname;
    return SERIES_PATH.exec(path)?.[2] ?? CHAPTER_PATH.exec(path)?.[1] ?? '';
  }

  static chapterNumber(key: string): number {
    return Number(/^[a-z](\d+(?:\.\d+)?)$/.exec(key)?.[1] ?? NaN);
  }

  /** The id the site gives a chapter (the number after `FR_`), which names it among all the site's. */
  static chapterId(chapterUrl: string): string {
    return CHAPTER_PATH.exec(new URL(chapterUrl).pathname)?.[4] ?? '';
  }

  /**
   * The site's search needs a script; asking for one is the list of all the titles with `q`,
   * which the source keeps for itself (it filters that list) and never sends to the site.
   */
  static search(query: string): string {
    return `${ORIGIN}/scanlation/liste_series.html?q=${encodeURIComponent(query)}`;
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
    // Not through searchParams, which would turn a bare "?po" into "?po=".
    const kept = clean.search.slice(1).split('&').filter((part) => part !== '' && part !== 'q' && !part.startsWith('q='));
    clean.search = kept.join('&');
    return clean.href;
  }
}
