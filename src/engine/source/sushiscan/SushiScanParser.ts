import { SourceError } from '../../errors.ts';
import type { Chapter, Series, SeriesSummary } from '../../model.ts';
import type { DomDocument, DomNode } from '../../ports.ts';
import type { ReadingStyle } from '../../reader/ReadingStyle.ts';
import { absolute, clean, looksBlocked, secure } from '../../text.ts';
import { SushiScanUrls } from './SushiScanUrls.ts';

/** A page of results never has to show more than this. */
export const MAX_ITEMS = 300;

const titled = (slug: string): string => slug.replace(/[-_]+/g, ' ').trim();

// "Magic Emperor - Scan FR / VF - Sushiscan"
const TITLE_SUFFIX = /\s*-\s*Scan\s+FR\s*\/\s*VF\s*-\s*Sushiscan\s*$/i;

// Cards that are lazy keep the picture in data-src and a placeholder in src.
const PICTURE_SOURCES = ['data-src', 'data-lazy-src', 'data-original', 'src'];
const PLACEHOLDER = /^data:|lazy|readerarea|loading|placeholder/i;

/** How each kind of work is read: the Japanese way round for a manga, in a long column for what is made for a phone. */
function readingOf(type: string): ReadingStyle | undefined {
  const kind = type.toLowerCase();
  if (/manga/.test(kind)) return { mode: 'paged', rtl: true };
  if (/manhwa|manhua|webtoon|webcomic/.test(kind)) return { mode: 'scroll', rtl: false };
  if (/comic|bd|bande/.test(kind)) return { mode: 'paged', rtl: false };
  return undefined;
}

/**
 * Reads SushiScan's pages. A series page has its facts in a table (table.infotable: a label and a value
 * a row), its genres, its synopsis (itemprop=description) and its chapters, newest first, one li of
 * #chapterlist each. A listing (the home page, a search) is cards: a div.bs per series, whose link carries the
 * series' name (title) and the cover in a picture.
 */
export class SushiScanParser {
  parseSeries(doc: DomDocument, text: string, url: string): Series {
    const chapters = this.chapters(doc, url);
    if (chapters.length === 0) {
      throw new SourceError(looksBlocked(text) ? 'blocked' : 'no_chapters', 'No chapters found on the series page.', {
        url,
        htmlLength: text.length,
        pageTitle: clean(doc.querySelector('title')?.textContent),
      });
    }
    const facts = this.facts(doc);
    const cover = absolute(this.meta(doc, 'og:image') || doc.querySelector('.thumb img')?.getAttribute('src'), url);
    const author = [facts.get('auteur'), facts.get('artiste')].filter((name, index, all): name is string => Boolean(name) && all.indexOf(name) === index).join(', ');
    const reading = readingOf(facts.get('type') ?? '');
    return {
      url,
      title: clean(doc.querySelector('h1.entry-title')?.textContent) || this.meta(doc, 'og:title').replace(TITLE_SUFFIX, '') || titled(SushiScanUrls.slugOf(url)) || url,
      cover: cover ? secure(cover) : null,
      author,
      status: facts.get('statut') ?? '',
      genres: [...doc.querySelectorAll('.seriestugenre a')].map((link) => clean(link.textContent)).filter(Boolean),
      description: clean(doc.querySelector('.entry-content-single')?.textContent) || this.meta(doc, 'og:description').replace(TITLE_SUFFIX, ''),
      chapters,
      ...(reading ? { reading } : {}),
    };
  }

  /**
   * The series a page lists, in the order it shows them, each with its cover. A series is linked more than once
   * (its cover, its name, its latest chapters): what the first link did not say, the next completes.
   */
  parseList(doc: DomDocument, pageUrl: string, limit = MAX_ITEMS): SeriesSummary[] {
    const found = new Map<string, { title: string; cover: string | null }>();
    for (const link of doc.querySelectorAll('a[href]')) {
      const target = SushiScanUrls.resolve(absolute(link.getAttribute('href'), pageUrl) ?? '');
      if (target?.kind !== 'series') continue;
      const seen = found.get(target.url);
      found.set(target.url, { title: seen?.title || this.cardTitle(link), cover: seen?.cover ?? this.cover(link, pageUrl) });
    }
    return [...found].slice(0, limit).map(([url, card]) => ({ url, title: (card.title || titled(SushiScanUrls.slugOf(url))).slice(0, 120), cover: card.cover }));
  }

  /** The rows of the table of facts, by their label in lower case ("statut", "type", "auteur"...). */
  private facts(doc: DomDocument): Map<string, string> {
    const rows = new Map<string, string>();
    for (const row of doc.querySelectorAll('.infotable tr')) {
      const cells = [...row.querySelectorAll('td')];
      const label = clean(cells[0]?.textContent).toLowerCase().replace(/\s*:\s*$/, '');
      const value = clean(cells.at(-1)?.textContent);
      if (label && cells.length > 1 && value && !rows.has(label)) rows.set(label, value);
    }
    return rows;
  }

  /** Oldest first: the page lists the newest first. */
  private chapters(doc: DomDocument, seriesUrl: string): Chapter[] {
    const listed = [...doc.querySelectorAll('#chapterlist li')];
    const rows = listed.length > 0 ? listed : [...doc.querySelectorAll('a[href]')];
    const found = new Map<string, Chapter>();
    for (const row of rows) {
      const link = row.querySelector('a[href]') ?? row;
      const url = SushiScanUrls.chapter(absolute(link.getAttribute('href'), seriesUrl) ?? '', seriesUrl);
      const key = url ? SushiScanUrls.resolve(url)?.key : undefined;
      const number = SushiScanUrls.chapterNumber(key ?? '');
      if (!url || !key || !Number.isFinite(number) || found.has(key)) continue;
      const title = clean(row.querySelector('.chapternum')?.textContent) || clean(row.getAttribute('data-num')) || `Chapitre ${number}`;
      found.set(key, { url, key, number, title, date: clean(row.querySelector('.chapterdate')?.textContent) });
    }
    return [...found.values()].reverse();
  }

  private meta(doc: DomDocument, property: string): string {
    return clean(doc.querySelector(`meta[property="${property}"]`)?.getAttribute('content'));
  }

  /** What a link to a series says of the series: its title, its name in the card, the description of its picture, its text. */
  private cardTitle(link: DomNode): string {
    const card = link.closest('.bs, .bsx, li') ?? link;
    return clean(link.getAttribute('title') || card.querySelector('.tt')?.textContent || link.querySelector('img')?.getAttribute('alt') || link.textContent);
  }

  /** The cover of the card a link is in. */
  private cover(link: DomNode, pageUrl: string): string | null {
    const card = link.closest('.bs, .bsx, li') ?? link;
    for (const img of card.querySelectorAll('img')) {
      for (const attribute of PICTURE_SOURCES) {
        const source = absolute(img.getAttribute(attribute), pageUrl);
        if (source && !PLACEHOLDER.test(source)) return secure(source);
      }
    }
    return null;
  }
}
