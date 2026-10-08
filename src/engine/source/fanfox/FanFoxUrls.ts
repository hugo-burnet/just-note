import type { SourceTarget } from '../../model.ts';

const ORIGIN = 'https://fanfox.net';
const HOSTS = ['fanfox.net', 'mangafox.me', 'mangafox.la'];

// /manga/<slug>/                       a series
// /manga/<slug>/[v01/]c001[.5]/1.html  a chapter, at a given page
const SERIES_PATH = /^\/manga\/([^/]+)\/?$/;
const CHAPTER_PATH = /^\/manga\/([^/]+)\/((?:v[^/]+\/)?c\d[^/]*)\/(?:\d+\.html)?$/;

const isOwnHost = (host: string): boolean => HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

export class FanFoxUrls {
  static readonly origin = ORIGIN;

  /**
   * Tells what a link points at, and gives it a canonical form (one host, one
   * page per chapter) so that the same thing is never stored twice.
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
      const [, slug = '', key = ''] = chapter;
      return {
        kind: 'chapter',
        url: `${ORIGIN}/manga/${slug}/${key}/1.html`,
        key,
        seriesUrl: `${ORIGIN}/manga/${slug}/`,
      };
    }
    const series = SERIES_PATH.exec(url.pathname);
    if (series) return { kind: 'series', url: `${ORIGIN}/manga/${series[1]}/` };
    // The home page, a directory, a search... anything that lists series.
    return { kind: 'list', url: ORIGIN + url.pathname + url.search };
  }

  static search(query: string): string {
    return `${ORIGIN}/search?title=${encodeURIComponent(query)}`;
  }

  static chapterNumber(key: string): number {
    return Number(/c(\d+(?:\.\d+)?)/.exec(key)?.[1] ?? NaN);
  }
}
