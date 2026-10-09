import { SourceError } from '../../errors.ts';
import type { Chapter, Series, SeriesSummary } from '../../model.ts';
import type { DomDocument, DomNode } from '../../ports.ts';
import { absolute, clean, looksBlocked, secure } from '../../text.ts';
import { ScanMangaUrls } from './ScanMangaUrls.ts';

/** Words reduced to what they sound like: no accents, no capitals, no punctuation. */
const plain = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const titled = (slug: string): string => slug.replace(/[-_]+/g, ' ').trim();

// "Lire Some Title VF - Manga / Seinen (2023 - Some Author)": the kind of work, its genre, its year and its author.
// A title may have " - " of its own: the kind is what comes after the last one before the slash.
const ABOUT = /\s-\s((?:(?!\s-\s)[^/()])+?)\s*\/\s*([^()]+?)\s*\((\d{4})\s-\s(.+)\)\s*$/;

// A card whose picture is still to come shows a placeholder (lazy_130x45.jpg), and keeps the real one in data-original.
const PLACEHOLDER = /lazy_/i;
const LAZY_SOURCES = ['data-original', 'data-src', 'src'];

// The site also publishes novels: text, which a reader of pictures cannot show. Their address ends with -Novel.
const NOVEL = /-Novel$/i;

/** A page of results never has to show more than this: the list of all the titles has sixteen thousand. */
export const MAX_ITEMS = 300;

// The name a chapter has besides its number, when it has one (the column is the number again when it has none).
const JUST_A_NUMBER = /^[\d.,\s-]*$/;

/**
 * Reads Scan-Manga's mobile pages. A series page has a synopsis (div.titres_desc) and its chapters, one
 * div.chapt_m each. A listing is a div.publi per series on the home page (a table: the cover in one cell,
 * the series' link in the next), or a div.listing per series in the list of all the titles.
 */
export class ScanMangaSeriesParser {
  parseSeries(doc: DomDocument, text: string, url: string): Series {
    const chapters = this.chapters(doc, url);
    if (chapters.length === 0) {
      throw new SourceError(looksBlocked(text) ? 'blocked' : 'no_chapters', 'No chapters found on the series page.', {
        url,
        htmlLength: text.length,
        pageTitle: clean(doc.querySelector('title')?.textContent),
      });
    }
    const about = ABOUT.exec(this.meta(doc, 'og:title'));
    const cover = absolute(this.meta(doc, 'og:image'), url);
    return {
      url,
      title: this.title(doc) || titled(ScanMangaUrls.slugOf(url)) || url,
      cover: cover ? secure(cover) : null,
      author: about?.[4] ?? '',
      status: '',
      // Both are filtered by: the kind (Manga, Manhwa, Webtoon...) as much as the genre.
      genres: [...new Set([about?.[1], about?.[2]].map((one) => clean(one)).filter(Boolean))],
      description: this.description(doc),
      chapters,
    };
  }

  /**
   * The series a page lists, in the order it shows them, each with the cover of its card. The name is
   * the text of the series' link; a link that says nothing (a picture, a menu entry) is named by the
   * picture's description or the link's title, and failing those by its address. At most `limit` of them.
   */
  parseList(doc: DomDocument, pageUrl: string, limit = MAX_ITEMS): SeriesSummary[] {
    const found = new Map<string, { title: string; cover: string | null }>();
    for (const link of doc.querySelectorAll('a[href]')) {
      const target = ScanMangaUrls.resolve(absolute(link.getAttribute('href'), pageUrl) ?? '');
      if (target?.kind !== 'series' || NOVEL.test(ScanMangaUrls.slugOf(target.url)) || link.closest('.novel_ly')) continue;
      const seen = found.get(target.url);
      found.set(target.url, { title: seen?.title || this.cardTitle(link), cover: seen?.cover ?? this.cover(link, pageUrl) });
    }
    return [...found]
      .slice(0, limit)
      .map(([url, card]) => ({ url, title: (card.title || titled(ScanMangaUrls.slugOf(url))).slice(0, 120), cover: card.cover }));
  }

  /** What `query` finds among `items`: every word of it has to be in the title. */
  static matching(items: readonly SeriesSummary[], query: string): SeriesSummary[] {
    const words = plain(query).split(' ').filter(Boolean);
    return items.filter((item) => words.every((word) => plain(item.title).includes(word)));
  }

  private chapters(doc: DomDocument, seriesUrl: string): Chapter[] {
    const slug = ScanMangaUrls.slugOf(seriesUrl);
    const own = new Map<string, Chapter>();
    const others = new Map<string, Chapter>();
    for (const link of doc.querySelectorAll('a[href]')) {
      const url = ScanMangaUrls.chapter(absolute(link.getAttribute('href'), seriesUrl) ?? '', seriesUrl);
      if (!url) continue;
      const target = ScanMangaUrls.resolve(url);
      const number = ScanMangaUrls.chapterNumber(target?.key ?? '');
      const kept = ScanMangaUrls.slugOf(url) === slug ? own : others;
      if (!target?.key || !Number.isFinite(number)) continue;
      // The same chapter is linked several times (its row, the buttons that start reading): the first link
      // keeps it, and the row, which may name it, completes it.
      const named = this.name(link);
      const known = kept.get(target.key);
      if (known && (!named || known.title !== this.titleOf(number, ''))) continue;
      kept.set(target.key, { url, key: target.key, number, title: this.titleOf(number, named), date: '' });
    }
    // The series page lists its own chapters. Where their address does not carry the series' name (it was
    // renamed), what the page links to is taken as it is rather than shown as empty.
    return [...(own.size > 0 ? own : others).values()].sort((a, b) => a.number - b.number);
  }

  /** The name a row of the chapter list gives a chapter, when it has one besides the number. */
  private name(link: DomNode): string {
    const name = clean(link.closest('.chapt_m, tr')?.querySelector('.publititle')?.textContent);
    return JUST_A_NUMBER.test(name) ? '' : name;
  }

  private titleOf(number: number, name: string): string {
    return name ? `Chapitre ${number} – ${name}` : `Chapitre ${number}`;
  }

  private title(doc: DomDocument): string {
    return clean(doc.querySelector('title')?.textContent).replace(/\s*\|\s*Scan-Manga$/i, '');
  }

  private meta(doc: DomDocument, property: string): string {
    return clean(doc.querySelector(`meta[property="${property}"]`)?.getAttribute('content'));
  }

  /** The synopsis in full (the meta tag cuts it short); it ends with a hidden mark, "**". */
  private description(doc: DomDocument): string {
    const text = clean(doc.querySelector('.titres_desc')?.textContent).replace(/\s*\*{2,}$/, '');
    return text || this.meta(doc, 'og:description');
  }

  /** What a link to a series says of the series: the description of its picture, its title, its text (without the note the list adds). */
  private cardTitle(link: DomNode): string {
    const text = clean(link.textContent);
    const note = clean(link.querySelector('.info_update')?.textContent);
    return clean(link.querySelector('img')?.getAttribute('alt') || link.getAttribute('title') || (note ? text.replace(note, '') : text));
  }

  /** The cover of the card a link is in: the picture sits in the cell beside the link, not in the link. */
  private cover(link: DomNode, pageUrl: string): string | null {
    const card = link.closest('tr, .publi, li') ?? link;
    for (const img of card.querySelectorAll('img')) {
      for (const attribute of LAZY_SOURCES) {
        const source = absolute(img.getAttribute(attribute), pageUrl);
        if (source && !PLACEHOLDER.test(source)) return secure(source);
      }
    }
    return null;
  }
}
