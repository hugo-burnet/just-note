// Pages shaped like Scan-Manga's mobile site, with made-up series. What was copied from the real
// site is the shape: a <title> that ends with " | Scan-Manga", Open Graph tags for the cover, the
// kind, genre, year and author, and the synopsis; chapters linked by /lecture-en-ligne/ addresses
// that carry a number and an id; a menu of rankings; cards on the home page whose picture is a
// placeholder until a script swaps in data-original.
export const SCANMANGA = 'https://m.scan-manga.com';
export const STATIC = 'https://static.scan-manga.com';

export interface PretendSeries {
  /** As in the address: "13001", or "13002-45678" (some carry a second number). */
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly genre: string;
  readonly year: string;
  readonly author: string;
  readonly synopsis: string;
  /** As written in the address: "3", "2-5" for 2.5. Newest first, as the site lists them. */
  readonly chapters: readonly string[];
}

export const SERIES: readonly PretendSeries[] = [
  {
    id: '13001',
    slug: 'Lantern-Keeper',
    title: 'Lantern Keeper',
    genre: 'Seinen',
    year: '2023',
    author: 'Mara Quill et Tov Reed',
    synopsis: 'Mara keeps the last lantern of a city that no longer sleeps, and learns why it must never go out',
    chapters: ['3', '2-5', '2', '1'],
  },
  {
    id: '13002-45678',
    slug: 'Ember-Courier-The-Last-Mile',
    title: 'Ember Courier: The Last Mile',
    genre: 'Shonen',
    year: '2021',
    author: 'Ilo Vance',
    synopsis: 'A courier crosses a burning country with one letter',
    chapters: ['2', '1'],
  },
];

export const seriesAddress = (series: PretendSeries): string => `${SCANMANGA}/${series.id}/${series.slug}.html`;
export const chapterPath = (series: PretendSeries, number: string): string => `/lecture-en-ligne/${series.slug}-Chapitre-${number}-FR_${series.id.slice(0, 5)}${number.replace('-', '')}.html`;
/** The address this source gives a chapter: the page's, and the series it belongs to. */
export const chapterAddress = (series: PretendSeries, number: string): string => `${SCANMANGA}${chapterPath(series, number)}#/${series.id}/${series.slug}.html`;
export const coverAddress = (series: PretendSeries, size: 1 | 2): string => `${STATIC}/img/manga/${series.slug.replaceAll('-', '_')}_${size}_${series.id.slice(-3)}.jpg`;

const MENU = ['Adulte-55', 'Seinen-13', 'Shonen-56'].map((genre) => `<li><a href="/TOP-${genre}.html">${genre}</a></li>`).join('');
// The consent dialog sits in the page, ahead of everything else.
const CONSENT = '<div class="qc-cmp2-container"><div id="qc-cmp2-ui"><a href="#">Continuer sans accepter</a><button id="accept-btn">Accepter et fermer</button></div></div>';

function page(head: string, body: string): string {
  return `<html lang="fr"><head><meta charset="utf-8">${head}</head><body>${CONSENT}<nav class="menu"><ul><li><a href="/?po">Dernières publications</a></li><li><a href="/scanlation/liste_series.html">Titres</a></li>${MENU}</ul></nav>${body}</body></html>`;
}

/** A series page: its own chapters, and a block of the latest chapters of other series. */
export function seriesPage(series: PretendSeries, others: readonly PretendSeries[] = []): string {
  const head = [
    `<title>${series.title} | Scan-Manga</title>`,
    `<meta name="description" content="Lire ${series.title} VF - Manga / ${series.genre} (${series.year} - ${series.author})">`,
    `<meta property="og:title" content="Lire ${series.title} VF - Manga / ${series.genre} (${series.year} - ${series.author})">`,
    `<meta property="og:image" content="${coverAddress(series, 1)}">`,
    `<meta property="og:description" content="${series.synopsis}...">`,
    `<link rel="canonical" href="https://www.scan-manga.com/${series.id}/${series.slug}.html">`,
  ].join('');
  const chapters = series.chapters.map((number) => `<li><a href="${chapterPath(series, number)}">Chapitre ${number.replace('-', '.')}</a></li>`).join('');
  const latest = others.map((other) => `<li><a href="${chapterPath(other, other.chapters[0] ?? '1')}">${other.title}</a></li>`).join('');
  return page(head, `<div id="all"><h1>${series.title}</h1><p class="synopsis">${series.synopsis}, even for a night.</p><ul class="chapters">${chapters}</ul><aside><ul>${latest}</ul></aside></div>`);
}

/** The home page: a card for each series, with a placeholder picture the page swaps for the cover, then a chapter link. */
export function homePage(series: readonly PretendSeries[] = SERIES): string {
  const cards = series
    .map(
      (one) =>
        `<div class="card"><a href="/${one.id}/${one.slug}.html"><img src="${STATIC}/img/lazy_130x45.jpg" data-original="${coverAddress(one, 2)}" alt="${one.title}"></a>` +
        `<a href="${chapterPath(one, one.chapters[0] ?? '1')}">Chapitre ${one.chapters[0]}</a></div>`,
    )
    .join('');
  return page('<title>Dernières publications | Scan-Manga</title>', `<div id="all">${cards}</div>`);
}

/** The list of all the titles: a link to each series, with only its name. */
export function allTitlesPage(series: readonly PretendSeries[] = SERIES): string {
  return page('<title>Liste des titres | Scan-Manga</title>', `<div id="all">${series.map((one) => `<a href="/${one.id}/${one.slug}.html">${one.title}</a>`).join('')}</div>`);
}
