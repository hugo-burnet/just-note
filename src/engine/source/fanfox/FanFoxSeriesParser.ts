import { SourceError } from '../../errors.ts';
import type { Chapter, Series, SeriesSummary } from '../../model.ts';
import type { DomDocument, DomNode } from '../../ports.ts';
import { absolute, clean, looksBlocked } from '../../text.ts';
import type { Glance } from '../Source.ts';
import { FanFoxUrls } from './FanFoxUrls.ts';

interface Card {
  url: string;
  title: string;
  cover: string | null;
}

// Reads FanFox's series pages and listings. Addresses and <meta> tags are
// trusted before CSS class names: they survive redesigns better.
export class FanFoxSeriesParser {
  parseSeries(doc: DomDocument, text: string, url: string): Series {
    const chapters = this.chapters(doc, url);
    if (chapters.length === 0) {
      throw new SourceError(looksBlocked(text) ? 'blocked' : 'no_chapters', 'No chapters found on the series page.', {
        url,
        htmlLength: text.length,
        pageTitle: clean(doc.querySelector('title')?.textContent),
      });
    }
    const { cover, genres } = this.parseGlance(doc, url);
    return {
      url,
      title: this.title(doc) || url,
      cover,
      author: this.texts(doc, '.detail-info-right-say a').join(', '),
      status: clean(doc.querySelector('.detail-info-right-title-tip')?.textContent),
      genres,
      description: this.description(doc),
      chapters,
    };
  }

  /** What the page says of a series before its chapters: its cover and its genres (see Source.glance). */
  parseGlance(doc: DomDocument, url: string): Glance {
    const coverSrc = doc.querySelector('img.detail-info-cover-img')?.getAttribute('src') || this.meta(doc, 'og:image');
    return { cover: absolute(coverSrc, url), genres: this.texts(doc, '.detail-info-right-tag-list a') };
  }

  /** Series found on a listing page (home, directory, search results). */
  parseList(doc: DomDocument, pageUrl: string): SeriesSummary[] {
    const found = new Map<string, Card>();
    for (const link of doc.querySelectorAll('a[href]')) {
      const target = FanFoxUrls.resolve(absolute(link.getAttribute('href'), pageUrl) ?? '');
      if (target?.kind !== 'series') continue;
      // A card usually has one link around the cover and another around the title.
      const card = found.get(target.url) ?? { url: target.url, title: '', cover: null };
      if (!card.title) {
        card.title = clean(link.getAttribute('title') || link.querySelector('img')?.getAttribute('alt') || link.textContent).slice(0, 120);
      }
      card.cover ??= absolute(this.coverOf(link) ?? this.coverOf(link.closest('li, article')), pageUrl);
      found.set(target.url, card);
    }
    return [...found.values()].filter((card) => card.title);
  }

  private chapters(doc: DomDocument, seriesUrl: string): Chapter[] {
    const found = new Map<string, Chapter>();
    for (const link of doc.querySelectorAll('a[href]')) {
      const target = FanFoxUrls.resolve(absolute(link.getAttribute('href'), seriesUrl) ?? '');
      if (target?.kind !== 'chapter' || target.seriesUrl !== seriesUrl || found.has(target.url)) continue;
      const key = target.key ?? '';
      const number = FanFoxUrls.chapterNumber(key);
      found.set(target.url, {
        url: target.url,
        key,
        number,
        title:
          clean(link.querySelector('.title3')?.textContent) ||
          clean(link.getAttribute('title') || link.textContent) ||
          `Chapter ${number}`,
        date: clean(link.querySelector('.title2')?.textContent),
      });
    }
    // The site lists the newest first; we hand back the oldest first.
    const chapters = [...found.values()].reverse();
    if (chapters.every((chapter) => Number.isFinite(chapter.number))) chapters.sort((a, b) => a.number - b.number);
    return chapters;
  }

  private title(doc: DomDocument): string {
    const heading = clean(doc.querySelector('.detail-info-right-title-font')?.textContent) || clean(doc.querySelector('h1')?.textContent);
    if (heading) return heading;
    // "Some Title Manga - Read Some Title Online For Free - Fan Fox"
    const raw = clean(this.meta(doc, 'og:title') || doc.querySelector('title')?.textContent);
    return (raw.split(' - ')[0] ?? '').replace(/\s+(manga|manhwa|manhua)$/i, '');
  }

  private description(doc: DomDocument): string {
    const text =
      clean(doc.querySelector('p.fullcontent')?.textContent) ||
      clean(doc.querySelector('.detail-info-right-content')?.textContent) ||
      clean(this.meta(doc, 'og:description') || this.meta(doc, 'description'));
    return text.replace(/\s*show (more|less)$/i, '');
  }

  private meta(doc: DomDocument, name: string): string {
    return doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content') ?? '';
  }

  private texts(doc: DomDocument, selector: string): string[] {
    return [...doc.querySelectorAll(selector)].map((node) => clean(node.textContent)).filter(Boolean);
  }

  private coverOf(element: DomNode | null): string | null {
    const img = element?.querySelector('img');
    if (!img) return null;
    for (const name of ['data-original', 'data-src', 'src']) {
      const value = img.getAttribute(name);
      if (value && !value.startsWith('data:')) return value;
    }
    return null;
  }
}
