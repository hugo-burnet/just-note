// Pages shaped like Demonic Scans', with made-up series. The site could not be reached from where this was
// written: the markup follows what the readers that already read it (Mihon's and Kotatsu's modules) look
// for. The latest updates are div#updates-container > div.updates-element, each a div.thumb with the cover
// and a div.updates-element-info with a link to the series and its latest chapters (an advertisement is a
// card with a div.toffee-badge); a search answers with bare links, the name in div.seach-right > div; a
// series page has h1.big-fat-titles, its cover in div#manga-page, its facts in div#manga-info-stats (rows
// of two li: label, value), its genres in div.genres-list, its synopsis in div.white-font and its chapters
// in div#chapters-list, newest first, as a.chplinks with the date in a span; a chapter page has its
// pictures as img.imgholder. Names in addresses have their escapes doubled (an apostrophe is %2527), and
// a chapter's escapes once more again (%252527).
export const DEMONIC = 'https://demonicscans.org';

export interface PretendWork {
  /** The name in the address of the series: "The-Keeper%2527s-Lantern". */
  readonly name: string;
  readonly title: string;
  readonly author: string;
  readonly status: string;
  readonly genres: readonly string[];
  readonly synopsis: string;
  readonly cover: string;
  /** Newest first, as the site lists them. */
  readonly chapters: readonly string[];
}

export const LANTERN: PretendWork = {
  name: 'The-Keeper%2527s-Lantern',
  title: "The Keeper's Lantern",
  author: 'Mara Quill',
  status: 'Ongoing',
  genres: ['Action', 'Fantasy'],
  synopsis: 'Mara keeps the last lantern of a city that no longer sleeps.',
  cover: `${DEMONIC}/images/thumbnails/keeper.jpg`,
  chapters: ['3', '2.5', '2', '1'],
};

export const EMBER: PretendWork = {
  name: 'Ember-Courier',
  title: 'Ember Courier',
  author: 'Ilo Vance',
  status: 'Completed',
  genres: ['Adventure'],
  synopsis: 'A courier crosses a burning country with one letter.',
  cover: `${DEMONIC}/images/thumbnails/ember.jpg`,
  chapters: ['2', '1'],
};

export const seriesAddress = (work: PretendWork): string => `${DEMONIC}/manga/${work.name}`;
/** The name as a chapter's address writes it: escaped once more. */
export const chapterPath = (work: PretendWork, number: string): string => `/title/${work.name.replace(/%/g, '%25')}/chapter/${number}/${700 + Number(number) * 10}`;
export const chapterAddress = (work: PretendWork, number: string): string => DEMONIC + chapterPath(work, number);
export const picture = (work: PretendWork, number: string, page: number): string => `https://demonicscans.org/images/${work.name}/${number}/${page}.jpg`;

export function updatesPage(works: readonly PretendWork[] = [LANTERN, EMBER]): string {
  const cards = works
    .map(
      (work) => `<div class="updates-element">
  <div class="thumb"><a href="/manga/${work.name}"><img src="${work.cover}" alt="${work.title}"></a></div>
  <div class="updates-element-info"><a href="/manga/${work.name}">${work.title} <span class="new">NEW</span></a>
    <div class="chap-date"><a href="${chapterPath(work, work.chapters[0] ?? '1')}">Chapter ${work.chapters[0]}</a></div>
  </div>
</div>`,
    )
    .join('\n');
  const ad = `<div class="updates-element"><div class="thumb"><a href="/manga/Sponsored-Thing"><img src="/ad.jpg"></a></div>
  <div class="updates-element-info"><a href="/manga/Sponsored-Thing">Play now</a><div class="toffee-badge">AD</div></div></div>`;
  return `<html><head><title>Read Manga At demonicscans</title></head><body>
<nav><a href="/">Home</a><a href="/lastupdates.php">Latest</a></nav>
<div id="updates-container">${ad}${cards}</div>
<div class="pagination"><ul><a href="/lastupdates.php?list=2"><li>Next</li></a></ul></div>
</body></html>`;
}

/** The answer of /search.php: not a page, a bare list of links. */
export function searchAnswer(works: readonly PretendWork[]): string {
  return works.map((work) => `<a href="/manga/${work.name}"><img src="${work.cover}"><div class="seach-right"><div>${work.title}</div><div>${work.chapters.length} chapters</div></div></a>`).join('');
}

export function seriesPage(work: PretendWork): string {
  const chapters = work.chapters
    .map((number) => `<li><a class="chplinks" href="${chapterPath(work, number)}">Chapter ${number} <span>2025-07-2${number.charAt(0)}</span></a></li>`)
    .join('');
  return `<html><head><title>${work.title}</title><meta property="og:image" content="${work.cover}"></head><body>
<div id="manga-info-container">
  <div id="manga-page"><img src="${work.cover}"></div>
  <h1 class="big-fat-titles">${work.title} <span class="rating">4.8</span></h1>
  <div id="manga-info-stats">
    <div><li>Author</li><li>${work.author}</li></div>
    <div><li>Status</li><li>${work.status}</li></div>
    <div><li>Chapters</li><li>${work.chapters.length}</li></div>
  </div>
  <div class="genres-list">${work.genres.map((genre) => `<li>${genre}</li>`).join('')}</div>
  <div id="manga-info-rightColumn"><div><div class="white-font">${work.synopsis}</div></div></div>
</div>
<div id="chapters-list">${chapters}</div>
</body></html>`;
}

export function chapterPage(work: PretendWork, number: string, count: number): string {
  const pictures = Array.from({ length: count }, (_, n) => `<div><img class="imgholder" src="${picture(work, number, n + 1)}"></div>`).join('\n');
  return `<html><head><title>${work.title} Chapter ${number}</title></head><body>
<div class="navigate"><a href="/manga/${work.name}">${work.title}</a><a href="${chapterPath(work, String(Number(number) + 1))}">Next</a></div>
${pictures}
<img src="/images/logo.png" class="logo">
</body></html>`;
}
