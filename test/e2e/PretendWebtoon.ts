import { episodeUrl, imageUrl, listingPage, seriesPage, SERIES_URL, viewerPage, WEBTOON } from '../pretend/webtoonPages.ts';
import type { PretendEpisode } from '../pretend/webtoonPages.ts';
import { numberIn } from './Pictures.ts';
import type { Pictures } from './Pictures.ts';
import { page } from './PretendWeb.ts';
import type { Pretender } from './PretendWeb.ts';

export { episodeUrl, imageUrl, SERIES_URL };

const EPISODES = 12;
const PER_PAGE = 5;
const IMAGES_PER_EPISODE = 4;
const CARDS = [
  { slug: 'lantern-keeper', titleNo: 5001, title: 'Lantern Keeper' },
  { slug: 'paper-moons', titleNo: 7002, title: 'Paper Moons' },
  { slug: 'salt-and-thunder', titleNo: 7003, title: 'Salt and Thunder' },
];

// Newest first, as the site lists them.
const episodes: PretendEpisode[] = Array.from({ length: EPISODES }, (_, i) => EPISODES - i).map((no) => ({
  no,
  title: `Episode ${no}: ${['The Tide', 'A Lamp Goes Out', 'Salt', 'The Long Stair', 'Gulls', 'Low Water'][no % 6]}`,
  date: `Sep ${String(no).padStart(2, '0')}, 2026`,
}));

/** A made-up WEBTOON: ten episodes to a page on the real site, five here so that a series takes three. */
export class PretendWebtoon implements Pretender {
  private readonly pictures: Pictures;

  constructor(pictures: Pictures) {
    this.pictures = pictures;
  }

  respond(url: URL): Response | null {
    if (url.hostname === 'webtoon-phinf.pstatic.net') return this.pictures.response(numberIn(url.pathname));
    if (url.hostname !== 'www.webtoons.com') return null;
    const { pathname, searchParams } = url;

    if (pathname === '/en/fantasy/lantern-keeper/list') {
      const current = Number(searchParams.get('page') ?? 1);
      const pages = Array.from({ length: Math.ceil(EPISODES / PER_PAGE) }, (_, i) => i + 1);
      return page(seriesPage({ episodes: episodes.slice((current - 1) * PER_PAGE, current * PER_PAGE), pages }));
    }
    const viewer = /\/ep-(\d+)\/viewer$/.exec(pathname)?.[1];
    if (viewer) return page(viewerPage(Number(viewer), IMAGES_PER_EPISODE));
    if (pathname === '/en/' || pathname === '/en/search') {
      const wanted = (searchParams.get('keyword') ?? '').toLowerCase();
      return page(listingPage(CARDS.filter((card) => card.title.toLowerCase().includes(wanted))));
    }
    return page('not found', 404);
  }
}

export { WEBTOON };
export const EPISODE_COUNT = EPISODES;
export const lastEpisodeUrl = episodeUrl(EPISODES);
