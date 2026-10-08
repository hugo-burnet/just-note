// Pages shaped like LelScan's, with made-up series. Used by the unit tests and by the
// end-to-end run's pretend site. What was copied from the real site is the shape: two
// <select>s on every page (the chapters of the series, then all the series), numbered
// page links, one image a page, and an address that depends on the series' spelling.
export const LELSCAN = 'https://lelscans.net';

export interface PretendChapter {
  /** As written in the address: "3", "2.5". */
  readonly number: string;
  readonly pages: number;
}

export interface PretendSeries {
  readonly slug: string;
  readonly title: string;
  /** How the site spells this series' address: the three ways it has been seen. */
  readonly spelling: 'plain' | 'php' | 'old';
  /** The images of a series are named 00, 01... or 1, 2... (never both). */
  readonly files: 'zero-based' | 'one-based';
  /** Newest first, as the site lists them. */
  readonly chapters: readonly PretendChapter[];
}

export const SERIES: readonly PretendSeries[] = [
  {
    slug: 'lanterne-des-marees',
    title: 'Lanterne des Marées',
    spelling: 'plain',
    files: 'zero-based',
    chapters: [
      { number: '3', pages: 3 },
      { number: '2.5', pages: 2 },
      { number: '2', pages: 3 },
      { number: '1', pages: 4 },
    ],
  },
  {
    slug: 'jardin-d-horloge',
    title: "Jardin d'Horloge",
    spelling: 'php',
    files: 'one-based',
    chapters: [
      { number: '2', pages: 2 },
      { number: '1', pages: 3 },
    ],
  },
  {
    slug: 'chemin-des-corbeaux',
    title: 'Chemin des Corbeaux',
    spelling: 'old',
    files: 'one-based',
    chapters: [{ number: '12', pages: 2 }],
  },
];

export const [LANTERN, GARDEN] = SERIES as readonly [PretendSeries, PretendSeries, PretendSeries];

const pathOf = (series: PretendSeries): string =>
  series.spelling === 'plain' ? `lecture-en-ligne-${series.slug}` : series.spelling === 'php' ? `lecture-en-ligne-${series.slug}.php` : `lecture-ligne-${series.slug}.php`;

/** The address the site gives for a series (not always the one this app keeps it under). */
export const seriesAddress = (series: PretendSeries): string => `${LELSCAN}/${pathOf(series)}`;

export const chapterAddress = (series: PretendSeries, number: string, page?: number): string =>
  `${LELSCAN}/scan-${series.slug}/${number}${page === undefined ? '' : `/${page}`}`;

/** Where the image of page `page` (from 1) of a chapter lives, with the cache-buster the site adds. */
export const imagePath = (series: PretendSeries, number: string, page: number): string => {
  const file = series.files === 'zero-based' ? String(page - 1).padStart(2, '0') : String(page);
  return `/mangas/${series.slug}/${number}/${file}.jpg?v=fr1700000000`;
};

export const coverPath = (series: PretendSeries): string => `/mangas/${series.slug}/thumb_cover.jpg`;

const chapterOptions = (series: PretendSeries, current: string): string =>
  series.chapters
    .map((chapter) => `<option value="${chapterAddress(series, chapter.number)}"${chapter.number === current ? ' selected' : ''}>${chapter.number}</option>`)
    .join('');

const seriesOptions = (current: PretendSeries): string =>
  [...SERIES]
    .sort((a, b) => a.title.localeCompare(b.title))
    .map((series) => `<option value='${seriesAddress(series)}' ${series === current ? 'selected' : ''}>${series.title}</option>`)
    .join('');

const hotCards = (): string =>
  SERIES.map((series) => {
    const latest = series.chapters[0]?.number ?? '1';
    return `<li><a class="hot_manga_img" href="${seriesAddress(series)}" title="${series.title} Scan"><img src="${coverPath(series)}" alt="${series.title}"></a>
<h3><a href="${chapterAddress(series, latest)}" title="Scan ${series.title} ${latest}">${series.title} ${latest}</a></h3></li>`;
  }).join('\n');

// Links to a series that are not cards: a breadcrumb ("Lecture en ligne X") and a footer list ("X lecture en ligne").
const breadcrumb = (series: PretendSeries, number: string): string =>
  `<div id="breadcrumb"><a href="${LELSCAN}/"><span itemprop="title">Lelscan</span></a> » <a href="${seriesAddress(series)}"><span itemprop="title">Lecture en ligne ${series.title}</span></a> » <span itemprop="title">${number}</span></div>`;

const footer = (): string => `<div id="footer">${SERIES.map((series) => `<a href="${seriesAddress(series)}">${series.title} lecture en ligne</a>`).join(' ')}</div>`;

/** One page of a chapter, as the site shows it: the image, the page links, and the two lists. */
export function chapterPage(series: PretendSeries, number: string, page: number): string {
  const count = series.chapters.find((chapter) => chapter.number === number)?.pages ?? 1;
  const links = Array.from({ length: count }, (_, i) => i + 1)
    .map((n) => `<a href="${chapterAddress(series, number, n)}"${n === page ? ' class="active"' : ''}>${n}</a>`)
    .join('');
  const previous = chapterAddress(series, number, Math.max(1, page - 1));
  const next = page < count ? chapterAddress(series, number, page + 1) : chapterAddress(series, number, page);
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd"><html xmlns="http://www.w3.org/1999/xhtml"><head>
<title>Scan ${series.title} ${number} Page ${page}</title>
<meta name="description" content="${series.title} lecture en ligne." />
<meta name="lelscan" content="${series.title}" />
</head><body><h1>${series.title} ${number} lecture en ligne scan</h1>
<div id="header-image"><h2><form method="get" action="/lecture-en-ligne.php">
<select onchange="window.open(this.options[this.selectedIndex].value,'_top')">${chapterOptions(series, number)}</select>
<select onchange="window.open(this.options[this.selectedIndex].value,'_top')">${seriesOptions(series)}</select>
</form></h2></div>
${breadcrumb(series, number)}
<div id="navigation"><strong>Pages:</strong> <a href="${previous}">Prec</a>${links}<a href="${next}">Suiv</a></div>
<table><tr><td><a href="${next}" title="Suivant"><img src="${imagePath(series, number, page)}" alt="Lecture en ligne ${series.title} ${number} page ${page}" /></a></td>
<td><ul class="manga_hot">${hotCards()}</ul></td></tr></table>
${footer()}
</body></html>`;
}

/** A series' own page is the reading page of its latest chapter, opened at the first page. */
export const seriesPage = (series: PretendSeries): string => chapterPage(series, series.chapters[0]?.number ?? '1', 1);

/** The home page opens on the reading page of one of the series (the first, here). */
export const homePage = (): string => seriesPage(LANTERN);
