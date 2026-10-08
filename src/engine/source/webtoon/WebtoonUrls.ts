import type { SourceTarget } from '../../model.ts';

const ORIGIN = 'https://www.webtoons.com';
const HOSTS = ['webtoons.com'];

const isOwnHost = (host: string): boolean => HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
const isNumber = (value: string | null): value is string => value !== null && /^\d+$/.test(value);

// /{language}/{genre}/{slug}/list?title_no=95                              a series
// /{language}/{genre}/{slug}/{episode-slug}/viewer?title_no=95&episode_no=3  an episode
// Only the numbers matter to the site: the slugs are decoration.
export class WebtoonUrls {
  static readonly origin = ORIGIN;

  static resolve(input: string): SourceTarget | null {
    let url: URL;
    try {
      url = new URL(input);
    } catch {
      return null;
    }
    if (!/^https?:$/.test(url.protocol) || !isOwnHost(url.hostname)) return null;

    const parts = url.pathname.split('/').filter(Boolean);
    const titleNo = url.searchParams.get('title_no');
    const episodeNo = url.searchParams.get('episode_no');
    const last = parts.at(-1);

    if (last === 'viewer' && isNumber(titleNo) && isNumber(episodeNo) && parts.length >= 4) {
      return {
        kind: 'chapter',
        url: `${ORIGIN}/${parts.join('/')}?title_no=${titleNo}&episode_no=${episodeNo}`,
        key: `e${episodeNo}`,
        seriesUrl: `${ORIGIN}/${parts.slice(0, 3).join('/')}/list?title_no=${titleNo}`,
      };
    }
    if (last === 'list' && isNumber(titleNo) && parts.length >= 3) {
      return { kind: 'series', url: `${ORIGIN}/${parts.join('/')}?title_no=${titleNo}` };
    }
    // The home page, a genre, a search... anything that lists series.
    return { kind: 'list', url: ORIGIN + url.pathname + url.search };
  }

  static home(language: string): string {
    return `${ORIGIN}/${language}/`;
  }

  static search(language: string, query: string): string {
    return `${ORIGIN}/${language}/search?keyword=${encodeURIComponent(query)}`;
  }

  /** The n-th page of a series' list of episodes (ten episodes a page). */
  static listPage(seriesUrl: string, page: number): string {
    const url = new URL(seriesUrl);
    url.searchParams.set('page', String(page));
    return url.href;
  }

  static titleNumber(url: string): string | null {
    try {
      return new URL(url).searchParams.get('title_no');
    } catch {
      return null;
    }
  }

  static episodeNumber(url: string): number | null {
    try {
      const value = new URL(url).searchParams.get('episode_no');
      return isNumber(value) ? Number(value) : null;
    } catch {
      return null;
    }
  }
}
