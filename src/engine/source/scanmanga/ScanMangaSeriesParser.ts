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
const ABOUT = /\s-\s[^/()]+\/\s*([^()]+?)\s*\((\d{4})\s-\s(.+)\)\s*$/;

// A card whose picture is still to come shows a placeholder (lazy_130x45.jpg).
const PLACEHOLDER = /lazy_/i;
const LAZY_SOURCES = ['data-original', 'data-src', 'src'];

/** Reads Scan-Manga's mobile pages: a series (its chapters) and the listings (the home, the list of all titles, rankings). */
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
      author: about?.[3] ?? '',
      status: '',
      genres: about?.[1] ? [about[1]] : [],
      description: this.meta(doc, 'og:description'),
      chapters,
    };
  }

  /**
   * The series a page lists, in the order it shows them, each with the picture of its card. A link
   * to a series can also be a menu entry or a breadcrumb, whose text is not the name: the name
   * comes from the picture's description or the link's title first.
   */
  parseList(doc: DomDocument, pageUrl: string): SeriesSummary[] {
    const found = new Map<string, { title: string; cover: string | null }>();
    for (const link of doc.querySelectorAll('a[href]')) {
      const target = ScanMangaUrls.resolve(absolute(link.getAttribute('href'), pageUrl) ?? '');
      if (target?.kind !== 'series') continue;
      const seen = found.get(target.url);
      const title = this.cardTitle(link);
      const cover = this.cover(link, pageUrl);
      found.set(target.url, { title: seen?.title || title, cover: seen?.cover ?? cover });
    }
    return [...found].map(([url, card]) => ({ url, title: (card.title || titled(ScanMangaUrls.slugOf(url))).slice(0, 120), cover: card.cover }));
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
      if (!target?.key || !Number.isFinite(number) || kept.has(target.key)) continue;
      kept.set(target.key, { url, key: target.key, number, title: `Chapitre ${number}`, date: '' });
    }
    // The series page lists its own chapters. Where their address does not carry the series' name (it was
    // renamed), what the page links to is taken as it is rather than shown as empty.
    return [...(own.size > 0 ? own : others).values()].sort((a, b) => a.number - b.number);
  }

  private title(doc: DomDocument): string {
    return clean(doc.querySelector('title')?.textContent).replace(/\s*\|\s*Scan-Manga$/i, '');
  }

  private meta(doc: DomDocument, property: string): string {
    return clean(doc.querySelector(`meta[property="${property}"]`)?.getAttribute('content'));
  }

  /** What a link to a series says of the series: the description of its picture, its title, its text. */
  private cardTitle(link: DomNode): string {
    return clean(link.querySelector('img')?.getAttribute('alt') || link.getAttribute('title') || link.textContent);
  }

  private cover(link: DomNode, pageUrl: string): string | null {
    for (const img of link.querySelectorAll('img')) {
      for (const attribute of LAZY_SOURCES) {
        const source = absolute(img.getAttribute(attribute), pageUrl);
        if (source && !PLACEHOLDER.test(source)) return secure(source);
      }
    }
    return null;
  }
}
