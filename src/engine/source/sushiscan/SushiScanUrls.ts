import type { SourceTarget } from '../../model.ts';

const ORIGIN = 'https://sushiscan.net';
const HOSTS = ['sushiscan.net'];

// /catalogue/<slug>/                                      a series
// /<slug>-chapitre-<n>[-<n>]/ (or -volume-, -tome-...)    a chapter ("12-5" is chapter 12.5)
// A chapter's address does not say which series it belongs to: the series of /blue-lock-chapitre-345/ is
// /catalogue/1-blue-lock/.
const SERIES_PATH = /^\/catalogue\/([^/]+)\/?$/i;
const CHAPTER_PATH = /^\/([^/]+?)-(chapitre|chapter|volume|vol|tome|episode|extra|special)-(\d+(?:-\d+)?)\/?$/i;
// The letter a kind of chapter has in a key ("c12", "v3"): distinct, so that chapter 1 and volume 1 are two things.
const KIND_LETTERS: Readonly<Record<string, string>> = { chapitre: 'c', chapter: 'c', volume: 'v', vol: 'v', tome: 't', episode: 'e', extra: 'x', special: 's' };

const isOwnHost = (host: string): boolean => HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

/** What follows the `#` of a chapter's address: the path of its series. */
function markOf(url: URL): string {
  try {
    return decodeURIComponent(url.hash.slice(1));
  } catch {
    return '';
  }
}

export class SushiScanUrls {
  static readonly origin = ORIGIN;

  /**
   * Tells what a link points at, and gives it a canonical form (the site's own: no www., a slash at the
   * end) so that the same thing is never stored twice.
   *
   * The address this source gives a chapter carries its series after a `#`, which the site never sees.
   * A chapter link pasted from the site has no such mark: it is a chapter whose series is still to be
   * found (see SushiScanSource.complete).
   */
  static resolve(input: string): SourceTarget | null {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return null;
    }
    if (!/^https?:$/.test(url.protocol) || !isOwnHost(url.hostname)) return null;

    const chapter = SushiScanUrls.chapterAt(url.pathname, markOf(url));
    if (chapter) return chapter;
    const series = SERIES_PATH.exec(url.pathname);
    if (series) return { kind: 'series', url: `${ORIGIN}/catalogue/${series[1]}/` };
    // The home page, the catalogue, a genre, a search...
    return { kind: 'list', url: ORIGIN + url.pathname + url.search };
  }

  /** The series a path (`/catalogue/magic-emperor/`) names, as an address; null when it names none. */
  static seriesAt(path: string): string | null {
    const slug = SERIES_PATH.exec(path)?.[1];
    return slug ? `${ORIGIN}/catalogue/${slug}/` : null;
  }

  /** The address of a chapter as this source gives it: the page's own, and the series it belongs to. */
  static chapter(pageAddress: string, seriesUrl: string): string | null {
    try {
      const page = new URL(pageAddress);
      return isOwnHost(page.hostname) ? (SushiScanUrls.chapterAt(page.pathname, new URL(seriesUrl).pathname)?.url ?? null) : null;
    } catch {
      return null;
    }
  }

  /** A chapter, with its series when `seriesPath` names one; without it, the address is the page's own. */
  private static chapterAt(pathname: string, seriesPath: string): SourceTarget | null {
    const match = CHAPTER_PATH.exec(pathname);
    if (!match) return null;
    const [, slug = '', kind = 'chapitre', written = ''] = match;
    const key = `${KIND_LETTERS[kind.toLowerCase()] ?? 'c'}${written.replace('-', '.')}`;
    const page = `${ORIGIN}/${slug}-${kind.toLowerCase()}-${written}/`;
    const parent = SushiScanUrls.seriesAt(seriesPath);
    return parent ? { kind: 'chapter', url: `${page}#${new URL(parent).pathname}`, key, seriesUrl: parent } : { kind: 'chapter', url: page, key };
  }

  /** What is asked of the site for a chapter: its address without the mark the series is carried in. */
  static page(chapterUrl: string): string {
    const page = new URL(chapterUrl);
    page.hash = '';
    return page.href;
  }

  /** The name the chapters of a series have in their addresses ("blue-lock" for /blue-lock-chapitre-345/); empty for any other address. */
  static chapterSlugOf(address: string): string {
    try {
      return CHAPTER_PATH.exec(new URL(address).pathname)?.[1] ?? '';
    } catch {
      return '';
    }
  }

  /** The name a series has in its address. */
  static slugOf(address: string): string {
    const path = new URL(address).pathname;
    return SERIES_PATH.exec(path)?.[1] ?? '';
  }

  static chapterNumber(key: string): number {
    return Number(/^[a-z](\d+(?:\.\d+)?)$/.exec(key)?.[1] ?? NaN);
  }

  /** What a chapter is called when the page does not say: "Volume 3" for "v3". */
  static titleOf(key: string): string {
    const names: Readonly<Record<string, string>> = { c: 'Chapitre', v: 'Volume', t: 'Tome', e: 'Épisode', x: 'Extra', s: 'Spécial' };
    return `${names[key.charAt(0)] ?? 'Chapitre'} ${key.slice(1)}`;
  }

  /** The site's own search (WordPress's: the answer is a page of cards, like the home page). */
  static search(query: string): string {
    return `${ORIGIN}/?s=${encodeURIComponent(query).replace(/%20/g, '+')}`;
  }
}
