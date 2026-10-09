import type { SourceTarget } from '../../model.ts';

const ORIGIN = 'https://demonicscans.org';
const HOSTS = ['demonicscans.org'];

// /manga/<Name>                              a series ("Solo-Leveling", kept as the site writes it: its case,
//                                            and its escapes, which are doubled: an apostrophe is %2527)
// /title/<Name>/chapter/<n>[/<more>]         a chapter
// The name in a chapter's address is not escaped the way the series' is (it is escaped once more), so a
// chapter does not say which series it belongs to: the address this source gives it carries the series
// after a #, which the site never sees. A chapter link pasted from the site has none, and is completed
// from its page (see DemonicScansSource.complete).
const SERIES_PATH = /^\/manga\/([^/]+)\/?$/;
const CHAPTER_PATH = /^\/title\/([^/]+)\/chapter\/(\d+(?:\.\d+)?)(?:\/[^/]*)*$/;

const isOwnHost = (host: string): boolean => HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

export class DemonicScansUrls {
  static readonly origin = ORIGIN;

  /** Tells what a link points at, and gives it a canonical form (no www., no slash at the end) so that the same thing is never stored twice. */
  static resolve(input: string): SourceTarget | null {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return null;
    }
    if (!/^https?:$/.test(url.protocol) || !isOwnHost(url.hostname)) return null;

    const chapter = DemonicScansUrls.chapterAt(url.pathname, url.hash.slice(1));
    if (chapter) return chapter;
    const series = DemonicScansUrls.seriesAt(url.pathname);
    if (series) return { kind: 'series', url: series };
    // The home page, the latest updates, a search...
    return { kind: 'list', url: ORIGIN + url.pathname + url.search };
  }

  /** The series a path (`/manga/Solo-Leveling`) names, as an address; null when it names none. */
  static seriesAt(path: string): string | null {
    const name = SERIES_PATH.exec(path)?.[1];
    return name ? `${ORIGIN}/manga/${name}` : null;
  }

  /** The address of a chapter as this source gives it: the page's own, and the series it belongs to. */
  static chapter(pageAddress: string, seriesUrl: string): string | null {
    try {
      const page = new URL(pageAddress);
      return isOwnHost(page.hostname) ? (DemonicScansUrls.chapterAt(page.pathname, new URL(seriesUrl).pathname)?.url ?? null) : null;
    } catch {
      return null;
    }
  }

  /** A chapter, with its series when `seriesPath` names one; without it, the address is the page's own. */
  private static chapterAt(pathname: string, seriesPath: string): SourceTarget | null {
    const match = CHAPTER_PATH.exec(pathname);
    if (!match) return null;
    const key = `c${match[2] ?? ''}`;
    const page = ORIGIN + pathname.replace(/\/+$/, '');
    const parent = DemonicScansUrls.seriesAt(seriesPath);
    return parent ? { kind: 'chapter', url: `${page}#${new URL(parent).pathname}`, key, seriesUrl: parent } : { kind: 'chapter', url: page, key };
  }

  /** What is asked of the site for a chapter: its address without the mark the series is carried in. */
  static page(chapterUrl: string): string {
    const page = new URL(chapterUrl);
    page.hash = '';
    return page.href;
  }

  /** The name of a series as its address writes it, made readable: "The Sergeant's Dragon". */
  static nameOf(seriesUrl: string): string {
    // Spaces are written as dashes, and a dash of the name itself as an escaped one (%252D): dashes go first.
    let name = (SERIES_PATH.exec(new URL(seriesUrl).pathname)?.[1] ?? '').replace(/-/g, ' ');
    for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(name); i++) {
      try {
        name = decodeURIComponent(name);
      } catch {
        break;
      }
    }
    return name;
  }

  static chapterNumber(key: string): number {
    return Number(/^c(\d+(?:\.\d+)?)$/.exec(key)?.[1] ?? NaN);
  }

  /** The latest updates, the site's home for browsing. */
  static latest(): string {
    return `${ORIGIN}/lastupdates.php?list=1`;
  }

  /** The site's own search: it answers with a bare list of links, one per series it found. */
  static search(query: string): string {
    return `${ORIGIN}/search.php?manga=${encodeURIComponent(query)}`;
  }
}
