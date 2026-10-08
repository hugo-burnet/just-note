// Pages shaped like WEBTOON's, with made-up titles. Used by the unit tests and by
// the end-to-end run's pretend site.
export const WEBTOON = 'https://www.webtoons.com';
export const SERIES_URL = `${WEBTOON}/en/fantasy/lantern-keeper/list?title_no=5001`;
export const SERIES_COVER = 'https://webtoon-phinf.pstatic.net/20250101_1/lantern/thumbnail/cover.jpg?type=q90';

export interface PretendEpisode {
  readonly no: number;
  readonly title: string;
  readonly date: string;
}

export const episodeUrl = (no: number): string => `${WEBTOON}/en/fantasy/lantern-keeper/ep-${no}/viewer?title_no=5001&episode_no=${no}`;

export const listPageUrl = (page: number): string => `${SERIES_URL}&page=${page}`;

const escape = (url: string): string => url.replace(/&/g, '&amp;');

/** One page of a series' list of episodes. The real site shows ten a page, tests use fewer. */
export function seriesPage(options: { episodes: readonly PretendEpisode[]; pages: readonly number[] }): string {
  const rows = options.episodes
    .map(
      (episode) => `
    <li class="_episodeItem" id="episode_${episode.no}" data-episode-no="${episode.no}">
      <a href="${escape(episodeUrl(episode.no))}&amp;tracking=list">
        <span class="thmb"><img src="https://webtoon-phinf.pstatic.net/20250101_1/lantern/ep${episode.no}/thumb.jpg" alt=""></span>
        <span class="subj"><span>${episode.title}</span></span>
        <span class="date">${episode.date}</span>
        <span class="tx">#${episode.no}</span>
      </a>
    </li>`,
    )
    .join('');
  const links = options.pages.map((page) => `<a href="${escape(listPageUrl(page))}"><span>${page}</span></a>`).join('');
  return `<!doctype html>
<html lang="en"><head>
<title>Lantern Keeper | WEBTOON</title>
<meta property="og:title" content="Lantern Keeper | WEBTOON">
<meta property="og:image" content="${SERIES_COVER}">
<meta property="og:description" content="A keeper tends the last lighthouse of a drowned world.">
<meta property="com-linewebtoon:webtoon:author" content="Mira Oduya">
</head><body>
<div class="detail_header">
  <h2 class="genre">Fantasy</h2>
  <h1 class="subj">Lantern Keeper</h1>
  <div class="author_area">Mira Oduya <a href="#">author info</a></div>
  <p class="summary">A keeper tends the last lighthouse of a drowned world.</p>
  <p class="day_info">UP EVERY FRIDAY</p>
</div>
<ul id="_listUl">${rows}</ul>
<div class="paginate">${links}</div>
<div class="related"><a href="/en/romance/paper-moons/list?title_no=7002" title="Paper Moons"><img src="https://webtoon-phinf.pstatic.net/20250101_1/moons/thumb.jpg" alt="Paper Moons"></a></div>
<a href="/en/fantasy/other-tale/ep-1/viewer?title_no=9999&amp;episode_no=1">An episode of another series</a>
</body></html>`;
}

export const imageUrl = (episode: number, n: number): string => `https://webtoon-phinf.pstatic.net/20250101_1/lantern/ep${episode}/${n}.jpg?type=q90`;

/** An episode viewer: images load lazily, `src` is a blank placeholder and `data-url` holds the real address. */
export function viewerPage(episode: number, imageCount: number): string {
  const images = Array.from(
    { length: imageCount },
    (_, i) =>
      `<img src="https://webtoons-static.pstatic.net/image/bg_transparency.png" data-url="${imageUrl(episode, i + 1)}" class="_images" alt="image">`,
  ).join('\n');
  return `<!doctype html><html><head><title>Episode ${episode} | Lantern Keeper | WEBTOON</title></head><body>
<div class="viewer_lst"><div class="viewer_img _img_viewer_area" id="_imageList">
${images}
</div></div></body></html>`;
}

export interface PretendCard {
  readonly slug: string;
  readonly titleNo: number;
  readonly title: string;
}

/** A listing (home, genre, search results): cards linking to series. */
export function listingPage(cards: readonly PretendCard[]): string {
  const items = cards
    .map(
      (card) => `
  <li><a class="card_item" href="${WEBTOON}/en/fantasy/${card.slug}/list?title_no=${card.titleNo}">
    <img src="https://webtoons-static.pstatic.net/image/bg_transparency.png" data-url="https://webtoon-phinf.pstatic.net/20250101_1/${card.slug}/thumbnail/cover.jpg?type=q90" alt="">
    <div class="info"><strong class="title">${card.title}</strong><div class="author">Someone</div></div>
  </a></li>`,
    )
    .join('');
  return `<!doctype html><html><body>
<a href="/en/genres/fantasy">Fantasy</a>
<ul class="card_lst">${items}</ul>
<a href="/en/fantasy/lantern-keeper/ep-1/viewer?title_no=5001&amp;episode_no=1">Start with episode 1</a>
</body></html>`;
}
