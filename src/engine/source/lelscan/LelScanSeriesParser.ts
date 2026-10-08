import { SourceError } from '../../errors.ts';
import type { Chapter, Series, SeriesSummary } from '../../model.ts';
import type { DomDocument, DomNode } from '../../ports.ts';
import { absolute, clean, looksBlocked } from '../../text.ts';
import { LelScanUrls } from './LelScanUrls.ts';

/** Words reduced to what they sound like: no accents, no capitals, no punctuation. */
const plain = (text: string): string =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const titled = (slug: string): string => slug.replace(/-/g, ' ').replace(/\b[a-z]/g, (letter) => letter.toUpperCase());

// Reads LelScan's pages. Every page carries two <select>s: the chapters of the series
// being read and all the series of the site, which is also what makes the listing.
export class LelScanSeriesParser {
  parseSeries(doc: DomDocument, text: string, url: string): Series {
    const chapters = this.chapters(doc, url);
    if (chapters.length === 0) {
      throw new SourceError(looksBlocked(text) ? 'blocked' : 'no_chapters', 'No chapters found on the series page.', {
        url,
        htmlLength: text.length,
        pageTitle: clean(doc.querySelector('title')?.textContent),
      });
    }
    const slug = LelScanUrls.slugOf(url);
    return {
      url,
      title: this.title(doc) || titled(slug) || url,
      cover: LelScanUrls.cover(slug),
      author: '',
      status: '',
      genres: [],
      description: '',
      chapters,
    };
  }

  /** The series the site lists, the ones it shows first (most recently updated) coming first. */
  parseList(doc: DomDocument, pageUrl: string): SeriesSummary[] {
    const found = new Map<string, SeriesSummary>();
    const add = (href: string | null, title: string): void => {
      const target = LelScanUrls.resolve(absolute(href, pageUrl) ?? '');
      if (target?.kind !== 'series' || !title || found.has(target.url)) return;
      found.set(target.url, { url: target.url, title: title.slice(0, 120), cover: LelScanUrls.cover(LelScanUrls.slugOf(target.url)) });
    };
    for (const link of doc.querySelectorAll('a[href]')) add(link.getAttribute('href'), this.cardTitle(link));
    for (const option of doc.querySelectorAll('option[value]')) add(option.getAttribute('value'), clean(option.textContent));
    return [...found.values()];
  }

  /** What `query` finds among `items`: every word of it has to be in the title. */
  static matching(items: readonly SeriesSummary[], query: string): SeriesSummary[] {
    const words = plain(query).split(' ').filter(Boolean);
    return items.filter((item) => words.every((word) => plain(item.title).includes(word)));
  }

  private chapters(doc: DomDocument, seriesUrl: string): Chapter[] {
    const found = new Map<string, Chapter>();
    const add = (href: string | null, label: string): void => {
      const target = LelScanUrls.resolve(absolute(href, seriesUrl) ?? '');
      if (target?.kind !== 'chapter' || target.seriesUrl !== seriesUrl || found.has(target.url)) return;
      const key = target.key ?? '';
      const number = LelScanUrls.chapterNumber(key);
      found.set(target.url, { url: target.url, key, number, title: `Chapitre ${label || number}`, date: '' });
    };
    // Only the <select> lists them all. Were it to change, failing loudly (no chapters, with details to copy)
    // beats showing the one or two the links of the page happen to name.
    for (const option of doc.querySelectorAll('option[value]')) add(option.getAttribute('value'), clean(option.textContent));
    // The site lists the newest first; we hand back the oldest first.
    return [...found.values()].filter((chapter) => Number.isFinite(chapter.number)).sort((a, b) => a.number - b.number);
  }

  private title(doc: DomDocument): string {
    const named = clean(doc.querySelector('meta[name="lelscan"]')?.getAttribute('content'));
    if (named) return named;
    // "Lecture en ligne Some Title scan"
    return clean(doc.querySelector('h1')?.textContent)
      .replace(/^lecture en ligne\s+/i, '')
      .replace(/\s+scan$/i, '');
  }

  private cardTitle(link: DomNode): string {
    return clean(link.querySelector('img')?.getAttribute('alt') || link.getAttribute('title')?.replace(/\s+scan$/i, '') || link.textContent);
  }
}
