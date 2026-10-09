// Pages shaped like SushiScan's, with made-up series. What was copied from the real site, as a phone's
// reports showed it (the markup around the first of each kind of link): the cards of a listing are a
// div.bs > div.bsx > a[title] with the cover in div.limit and the name in div.tt; a series page has an
// og:image, a table of facts (table.infotable: label, value), its genres in div.seriestugenre, its synopsis in
// div.entry-content-single[itemprop=description] and its chapters in div#chapterlist, newest first, each
// li[data-num] > div.chbox > div.eph-num > a with span.chapternum and span.chapterdate; a chapter page has
// no <img> of its own for the pictures: its reader's script is given them (as JSON, slashes escaped), and the
// way back to the series is the one link to /catalogue/<slug>/ in it. A link nobody sees (display:none), to
// /cdn-cgi/content?id=…, is in every page: a trap for robots.
export const SUSHI = 'https://sushiscan.net';
export const CDN = 'https://c.sushiscan.net';

export interface PretendWork {
  /** The name in the address of the series: "1-lantern-keeper". */
  readonly slug: string;
  /** The name in the address of its chapters: "lantern-keeper" (not always the series'). */
  readonly chapterSlug: string;
  readonly title: string;
  readonly type: string;
  readonly status: string;
  readonly author: string;
  readonly genres: readonly string[];
  readonly synopsis: string;
  readonly cover: string;
  /** As written in the address: "3", "2-5" for 2.5. Newest first, as the site lists them. */
  readonly chapters: readonly string[];
  /** "chapitre" or "volume". */
  readonly kind?: string;
  /** Volumes, in a list of their own after that of the chapters, newest first. */
  readonly volumes?: readonly string[];
}

export const LANTERN: PretendWork = {
  slug: '1-lantern-keeper',
  chapterSlug: 'lantern-keeper',
  title: 'Lantern Keeper',
  type: 'Manga',
  status: 'En Cours',
  author: 'Mara Quill',
  genres: ['Action', 'Fantasy'],
  synopsis: 'Mara keeps the last lantern of a city that no longer sleeps, and learns why it must never go out',
  cover: `${SUSHI}/wp-content/uploads/LanternKeeperCover.webp`,
  chapters: ['3', '2-5', '2', '1'],
};

export const EMBER: PretendWork = {
  slug: 'ember-courier',
  chapterSlug: 'ember-courier',
  title: 'Ember Courier',
  type: 'Manhua',
  status: 'Terminé',
  author: 'Ilo Vance',
  genres: ['Aventure'],
  synopsis: 'A courier crosses a burning country with one letter',
  cover: `${SUSHI}/wp-content/uploads/EmberCourierCover.jpg`,
  chapters: ['2', '1'],
};

export const WORKS: readonly PretendWork[] = [LANTERN, EMBER];

export const seriesAddress = (work: PretendWork): string => `${SUSHI}/catalogue/${work.slug}/`;
export const chapterAddress = (work: PretendWork, written: string): string => `${SUSHI}/${work.chapterSlug}-${work.kind ?? 'chapitre'}-${written}/`;

const trap = '<a href="https://sushiscan.net/cdn-cgi/content?id=Wf2gnMssot59h2tK" aria-hidden="true" rel="nofollow noopener" style="display: none !important; visibility: hidden !important"></a>';
const icons =
  `<link rel="icon" href="${SUSHI}/wp-content/uploads/cropped-IconSushiScan-32x32.png" sizes="32x32" />` +
  `<link rel="apple-touch-icon" href="${SUSHI}/wp-content/uploads/cropped-IconSushiScan-180x180.png" />`;
const header = `<div class="th headerni"><a title="Sushiscan" href="${SUSHI}/"><img src="${SUSHI}/wp-content/uploads/sushiscanlogo.webp" width="195" height="50" alt="Sushiscan"></a></div>`;

function page(head: string, body: string): string {
  return `<!DOCTYPE html><html lang="fr-FR"><head><meta charset="UTF-8">${head}${icons}</head><body class="darkmode">${trap}${header}${body}</body></html>`;
}

/** A card of a listing: the series' link carries its name, the cover is in the link, and so is the latest chapter. */
export function card(work: PretendWork, lazy = false): string {
  const picture = lazy
    ? `<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" data-src="${work.cover}?ver=1790341491" class="ts-post-image lazyload" title="${work.title}" alt="${work.title}"/>`
    : `<img src="${work.cover}?ver=1790341491" class="ts-post-image wp-post-image attachment-full size-full" loading="lazy" title="${work.title}" alt="${work.title}"/>`;
  return (
    `<div class="bs"><div class="bsx"><a href="${seriesAddress(work)}" title="${work.title}"><div class="limit"><div class="ply"></div>` +
    `<span class="typename ${work.type}">${work.type}</span>${picture}</div><div class="bigor"><div class="tt">\n${work.title}</div>` +
    `<div class="adds"><div class="epxs"> Chapitre ${work.chapters[0]?.replace('-', '.') ?? ''}</div></div></div></a></div></div>`
  );
}

/** Another way the home page shows a series: its cover, its name and its latest chapters, in separate links. */
function latest(work: PretendWork): string {
  const [first = '1', second] = work.chapters;
  const row = (written: string): string => `<li><a href="${chapterAddress(work, written)}">Chapitre ${written.replace('-', '.')}</a><span>il y a 1 heure</span></li>`;
  return (
    `<div class="utao"><div class="uta"><div class="imgu"><a class="series" href="${seriesAddress(work)}" rel="123"><img src="${work.cover}" alt="${work.title}"></a></div>` +
    `<div class="luf"><a class="series" href="${seriesAddress(work)}" rel="123"><h4>${work.title}</h4></a><ul>${row(first)}${second ? row(second) : ''}</ul></div></div></div>`
  );
}

/** The home page: a slider of what is popular, then what was updated, with the same series in both. */
export function homePage(works: readonly PretendWork[] = WORKS): string {
  return page(
    '<title>Sushiscan - Bibliothèque de scans, festin de lectures</title>',
    `<div class="listupd popularslider"><div class="popconslide">${works.map((work, index) => card(work, index > 0)).join('')}</div></div>` +
      `<div class="listupd">${works.map(latest).join('')}</div>`,
  );
}

/** What the site's search answers: the cards of what it found, and (after them) a widget of other series. */
export function searchPage(found: readonly PretendWork[], others: readonly PretendWork[] = []): string {
  const widget = others
    .map((work) => `<li><div class="imgseries"><a class="series" href="${seriesAddress(work)}" rel="9"><img src="${work.cover}" alt="${work.title}"></a></div><h2><a class="series" href="${seriesAddress(work)}" rel="9">${work.title}</a></h2><span><b>Genres</b>: <a href="${SUSHI}/genres/action/" rel="tag">Action</a></span></li>`)
    .join('');
  return page('<title>Searched: lantern - Sushiscan</title>', `<div class="listupd">${found.map((work) => card(work)).join('')}</div><div id="sidebar"><ul>${widget}</ul></div>`);
}

const row = (label: string, value: string): string => `<tr><td>${label}</td><td>${value}</td></tr>`;

/** The page of a series. `facts` can be changed to leave out what a series does not have. */
export function seriesPage(work: PretendWork, facts: Readonly<Record<string, string>> = { Statut: work.status, Type: work.type, Auteur: work.author }): string {
  const chapters = work.chapters
    .map((written) => {
      const label = `${work.kind === 'volume' ? 'Volume' : 'Chapitre'} ${written.replace('-', '.')}`;
      return `<li data-num="${label}"><div class="chbox"><div class="eph-num"><a href="${chapterAddress(work, written)}">\n<span class="chapternum"> ${label}</span>\n<span class="chapterdate">29 juillet 2025</span>\n</a></div></div></li>`;
    })
    .join('');
  const others = WORKS.filter((other) => other !== work).map((other) => card(other)).join('');
  const volumes = work.volumes
    ? `<div class="eplister" id="volumelist"><ul>${work.volumes.map((n) => `<li data-num="Volume ${n}"><div class="chbox"><div class="eph-num"><a href="${SUSHI}/${work.chapterSlug}-volume-${n}/"><span class="chapternum">Volume ${n}</span><span class="chapterdate">1 janvier 2020</span></a></div></div></li>`).join('')}</ul></div>`
    : '';
  const head =
    `<title>${work.title} - Scan FR / VF - Sushiscan</title><link rel="canonical" href="${seriesAddress(work)}">` +
    `<meta property="og:image" content="${work.cover}"><meta property="og:title" content="${work.title} - Scan FR / VF - Sushiscan">` +
    `<meta property="og:description" content="${work.synopsis.slice(0, 40)} - Scan FR / VF">`;
  const body =
    `<div class="seriestucon"><div class="seriestuheader"><h1 class="entry-title" itemprop="name">${work.title}</h1></div><div class="seriestucontent">` +
    `<div class="seriestucontl"><div class="thumb"><img width="711" height="1000" src="${work.cover}" class="attachment- size- wp-post-image" alt="${work.title}" itemprop="image"></div></div>` +
    `<div class="seriestucontentr"><div class="seriestuhead"><div class="entry-content entry-content-single" itemprop="description"><p>${work.synopsis}, even for a night.</p></div></div>` +
    `<div class="seriestucont"><div class="seriestucontr"><table class="infotable"><tbody>${Object.entries(facts).map(([label, value]) => row(label, value)).join('')}</tbody></table>` +
    `<div class="seriestugenre">${work.genres.map((genre) => `<a href="${SUSHI}/genres/${genre.toLowerCase()}/" rel="tag">${genre}</a>`).join(' ')}</div></div></div></div></div></div>` +
    `<div class="eplister" id="chapterlist"><ul >${chapters}</ul></div>${volumes}<div class="listupd">${others}</div>`;
  return page(head, body);
}

/** The page of a chapter: the reader gets its pictures from a script, and the page itself shows none. */
export function chapterPage(work: PretendWork, written: string, pictures: readonly string[]): string {
  const escaped = pictures.map((address) => JSON.stringify(address).replaceAll('/', '\\/')).join(',');
  const config = `{"post_id":4242,"noimagehtml":"<img src=\\"${SUSHI}/wp-content/themes/sushiscan/assets/img/readerarea.svg\\" />","sources":[{"source":"Server 1","images":[${escaped}]}],"lazyload":false,"mode":"full","prevUrl":"","nextUrl":""}`;
  return page(
    `<title>${work.title} : Chapitre ${written} - Sushiscan</title>`,
    `<div class="chdesc"><a href="${SUSHI}/">Accueil</a> › <a href="${seriesAddress(work)}">${work.title}</a> › Chapitre ${written}</div>` +
      `<a href="#/prev/" class="ch-prev-btn">Précédent</a><a href="#/next/" class="ch-next-btn">Suivant</a><a href="${SUSHI}/catalogue">Catalogue</a>` +
      `<div id="readerarea"><img src="${SUSHI}/wp-content/themes/sushiscan/assets/img/readerarea.svg" /></div>` +
      `<script>ts_reader.run(${config});</script>`,
  );
}
