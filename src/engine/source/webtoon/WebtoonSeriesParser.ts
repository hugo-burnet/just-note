import { SourceError } from '../../errors.ts';
import type { Chapter, Series, SeriesSummary } from '../../model.ts';
import type { DomDocument, DomNode } from '../../ports.ts';
import { absolute, clean, looksBlocked } from '../../text.ts';
import type { Glance } from '../Source.ts';
import { WebtoonUrls } from './WebtoonUrls.ts';

interface Card {
  url: string;
  title: string;
  cover: string | null;
}

const PLACEHOLDER = /bg_transparency|^data:/i;
const SITE_SUFFIX = /\s*\|\s*WEBTOON.*$/i;

export const looksAgeGated = (html: string): boolean => /age[-_ ]?gate/i.test(html);

// Reads WEBTOON's series pages and listings. Addresses and <meta> tags are
// trusted before CSS class names: they survive redesigns better.
export class WebtoonSeriesParser {
  /** The episodes one page of a series' list links to, oldest first. */
  episodes(doc: DomDocument, seriesUrl: string): Chapter[] {
    const titleNo = WebtoonUrls.titleNumber(seriesUrl);
    const found = new Map<number, Chapter>();
    for (const link of doc.querySelectorAll('a[href]')) {
      const target = WebtoonUrls.resolve(absolute(link.getAttribute('href'), seriesUrl) ?? '');
      if (target?.kind !== 'chapter' || WebtoonUrls.titleNumber(target.url) !== titleNo) continue;
      const number = WebtoonUrls.episodeNumber(target.url);
      if (number === null || found.has(number)) continue;
      found.set(number, {
        url: target.url,
        key: target.key ?? `e${number}`,
        number,
        title:
          clean(link.querySelector('.subj span')?.textContent) ||
          clean(link.querySelector('.subj')?.textContent) ||
          clean(link.getAttribute('title')) ||
          `Episode ${number}`,
        date: clean(link.querySelector('.date')?.textContent),
      });
    }
    return [...found.values()].sort((a, b) => a.number - b.number);
  }

  /** The numbers of the list pages this page links to (the paginator shows a window of them). */
  pageNumbers(doc: DomDocument, seriesUrl: string): number[] {
    const titleNo = WebtoonUrls.titleNumber(seriesUrl);
    const numbers = new Set<number>();
    for (const link of doc.querySelectorAll('a[href]')) {
      const href = absolute(link.getAttribute('href'), seriesUrl);
      if (!href) continue;
      const url = new URL(href);
      if (!url.pathname.endsWith('/list') || url.searchParams.get('title_no') !== titleNo) continue;
      const page = Number(url.searchParams.get('page'));
      if (Number.isInteger(page) && page > 0) numbers.add(page);
    }
    return [...numbers];
  }

  parseSeries(doc: DomDocument, text: string, url: string, chapters: readonly Chapter[]): Series {
    if (chapters.length === 0) {
      const code = looksBlocked(text) ? 'blocked' : looksAgeGated(text) ? 'age_gated' : 'no_chapters';
      throw new SourceError(code, 'No episodes found on the series page.', {
        url,
        htmlLength: text.length,
        pageTitle: clean(doc.querySelector('title')?.textContent),
      });
    }
    const title =
      clean(this.meta(doc, 'og:title')).replace(SITE_SUFFIX, '') ||
      clean(doc.querySelector('h1.subj, .detail_header h1')?.textContent) ||
      clean(doc.querySelector('title')?.textContent).replace(SITE_SUFFIX, '');
    const { cover, genres } = this.parseGlance(doc, url);
    return {
      url,
      title: title || url,
      cover,
      author: this.author(doc),
      status: clean(doc.querySelector('.day_info')?.textContent),
      genres,
      description: clean(doc.querySelector('p.summary')?.textContent) || clean(this.meta(doc, 'og:description')),
      chapters,
    };
  }

  /** What the first page of a series says of it before its episodes: its cover and its genre (see Source.glance). */
  parseGlance(doc: DomDocument, url: string): Glance {
    const genre = clean(doc.querySelector('.detail_header .genre, h2.genre')?.textContent);
    return { cover: absolute(this.meta(doc, 'og:image'), url), genres: genre ? [genre] : [] };
  }

  /** Series found on a listing page (home, a genre, search results). */
  parseList(doc: DomDocument, pageUrl: string): SeriesSummary[] {
    const found = new Map<string, Card>();
    for (const link of doc.querySelectorAll('a[href]')) {
      const target = WebtoonUrls.resolve(absolute(link.getAttribute('href'), pageUrl) ?? '');
      if (target?.kind !== 'series') continue;
      // A card can have several links to the same series: keep the first of each thing.
      const card = found.get(target.url) ?? { url: target.url, title: '', cover: null };
      if (!card.title) card.title = this.cardTitle(link);
      card.cover ??= absolute(this.coverOf(link), pageUrl);
      found.set(target.url, card);
    }
    return [...found.values()].filter((card) => card.title);
  }

  private cardTitle(link: DomNode): string {
    const text =
      clean(link.querySelector('.title, strong.title, .subj')?.textContent) ||
      clean(link.getAttribute('title')) ||
      clean(link.querySelector('img')?.getAttribute('alt')) ||
      clean(link.textContent);
    return text.slice(0, 120);
  }

  private coverOf(link: DomNode): string | null {
    for (const img of link.querySelectorAll('img')) {
      for (const name of ['data-url', 'data-src', 'src']) {
        const value = img.getAttribute(name);
        if (value && !PLACEHOLDER.test(value)) return value;
      }
    }
    return null;
  }

  private author(doc: DomDocument): string {
    const named = this.meta(doc, 'com-linewebtoon:webtoon:author');
    const shown = doc.querySelector('.detail_header .author_area, .detail_header a.author')?.textContent;
    return clean(named || shown).replace(/\s*author info.*$/i, '');
  }

  private meta(doc: DomDocument, name: string): string {
    return doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content') ?? '';
  }
}
