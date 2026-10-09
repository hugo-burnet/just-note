// Pages shaped like Scan-Manga's mobile site, with made-up series. What was copied from the real
// site, as three phones' reports showed it: a <title> that ends with " | Scan-Manga", Open Graph tags
// for the cover, the kind, genre, year and author; a synopsis in div.titres_desc, cut short in the
// tags; chapters in div.chapt_m rows (the number, then the name when there is one) beside buttons that
// start reading; on the home page a div.publi per series, a table with the cover in one cell and the
// series' link in the next, the cover swapped in for a placeholder by a script; in the list of all the
// titles a div.listing per series, with a note on those that were updated.
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
  /** The name some chapters have besides their number, by number. */
  readonly names?: Readonly<Record<string, string>>;
  readonly novel?: boolean;
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
    names: { '2-5': 'Lantern Night' },
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

/** A text novel: the site lists it with the others, and a reader of pictures has nothing to show of it. */
export const NOVEL: PretendSeries = {
  id: '13003',
  slug: 'Salt-Road-Journal-Novel',
  title: 'Salt Road Journal (Novel)',
  genre: 'Fantasy',
  year: '2020',
  author: 'Pel Anders',
  synopsis: 'A journal of a long walk',
  chapters: ['1'],
  novel: true,
};

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

/** The row of a chapter in the list of a series. */
function row(series: PretendSeries, number: string): string {
  const name = series.names?.[number] ?? number.replace('-', '.');
  return (
    `<div class="chapt_m seinenlisting"><table cellpadding="0" cellspacing="1"><tbody><tr><td class="publimg"><span class="i"><a href="${chapterPath(series, number)}">Ch. ${number.replace('-', '.')}</a></span></td>` +
    `<td class="publititle">${name}</td><td class="publi_read"><a class="l_read typcn typcn-document" href="${chapterPath(series, number)}"></a></td></tr></tbody></table></div>`
  );
}

/** A series page: the buttons that start reading, the synopsis, its own chapters, and a block of the latest chapters of other series. */
export function seriesPage(series: PretendSeries, others: readonly PretendSeries[] = []): string {
  const head = [
    `<title>${series.title} | Scan-Manga</title>`,
    `<meta name="description" content="Lire ${series.title} VF - Manga / ${series.genre} (${series.year} - ${series.author})">`,
    `<meta property="og:title" content="Lire ${series.title} VF - Manga / ${series.genre} (${series.year} - ${series.author})">`,
    `<meta property="og:image" content="${coverAddress(series, 1)}">`,
    `<meta property="og:description" content="${series.synopsis}...">`,
    `<link rel="canonical" href="https://www.scan-manga.com/${series.id}/${series.slug}.html">`,
  ].join('');
  const first = series.chapters[series.chapters.length - 1] ?? '1';
  const last = series.chapters[0] ?? '1';
  const buttons =
    `<div style="text-align:center"><a href="${SCANMANGA}${chapterPath(series, first)}" class="startRead">Commencer à lire</a>` +
    `<a href="${SCANMANGA}${chapterPath(series, last)}" class="ReadLast">Lire le dernier chapitre</a></div>`;
  const synopsis = `<div class="titres_souspart"><div>Synopsis </div></div><div class="titres_desc" itemprop="description" property="og:description"> ${series.synopsis}, even for a night.<br>\nA spin-off of <a href="https://www.scan-manga.com/11667/Bocchi-the-Rock.html">Another Series</a>.<span style="visibility:hidden">**</span></div>`;
  const latest = others.map((other) => `<li><a href="${chapterPath(other, other.chapters[0] ?? '1')}">${other.title}</a></li>`).join('');
  return page(head, `<div id="all">${buttons}<h1 class="main_title">${series.title}</h1>${synopsis}${series.chapters.map((number) => row(series, number)).join('')}<aside><ul>${latest}</ul></aside></div>`);
}

/** One card of the home page: the cover in one cell (swapped in for a placeholder, or already there), the series' link in the next. */
function card(series: PretendSeries, lazy: boolean): string {
  const cover = lazy
    ? `<img width="110px" height="38px" src="${STATIC}/img/lazy_130x45.jpg" data-original="${coverAddress(series, 2)}">`
    : `<img width="110px" height="38px" src="${coverAddress(series, 2)}">`;
  const latest = series.chapters[0] ?? '1';
  return (
    `<div class="${series.novel ? 'novel_ly ' : ''}publi shonenlisting" datetime="1791531618"><span class="nouveaute_cc" style="display: block;">N</span><table cellpadding="0" cellspacing="1"><tbody><tr>` +
    `<td class="publimg">${cover}</td><td><a class="l_manga" href="/${series.id}/${series.slug}.html">${series.title}</a><span class="i"><a href="${chapterPath(series, latest)}">Ch. ${latest}</a></span></td>` +
    `<td width="15%" class="publi_read"><a class="l_read typcn typcn-document" href="${chapterPath(series, latest)}"></a></td></tr></tbody></table></div>`
  );
}

/** The home page: a card for each series, the first covers already in, the others waiting for the script. */
export function homePage(series: readonly PretendSeries[] = SERIES): string {
  return page('<title>Dernières publications | Scan-Manga</title>', `<div id="all">${series.map((one, index) => card(one, index > 0)).join('')}</div>`);
}

/** The list of all the titles: a link to each series, with only its name, and a note on those that were updated. */
export function allTitlesPage(series: readonly PretendSeries[] = SERIES): string {
  const listing = series
    .map((one, index) => `<div class="listing seinenlisting"><a href="${SCANMANGA}/${one.id}/${one.slug}.html">${one.title} ${index === 0 ? '<span class="info_update" style="color:#65b901">Mise à jour</span>' : ''}</a></div>`)
    .join('');
  return page('<title>Scantrad | Scan-Manga</title>', `<div id="all"><div class="lettres"><a name="#"></a>#</div>${listing}</div>`);
}
