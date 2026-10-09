import { SourceError } from '../../errors.ts';
import type { Chapter, Series, SeriesSummary } from '../../model.ts';
import type { DomDocument, DomNode } from '../../ports.ts';
import { absolute, clean, looksBlocked, secure } from '../../text.ts';
import { DemonicScansUrls } from './DemonicScansUrls.ts';

/** At most this many series from one listing: a page of the site has a few dozen. */
export const MAX_ITEMS = 60;

// The cards of a listing: the latest updates (div.updates-element), the advanced list (div.advanced-element),
// the answer of a search (bare links, the name in div.seach-right). A card with div.toffee-badge is an
// advertisement dressed as a series.
const CARD = '.updates-element, .advanced-element';
const AD = '.toffee-badge';
// Where a lazy picture keeps its address before it is shown.
const PICTURE_SOURCES = ['src', 'data-src', 'data-lazy-src'];

/** A node's own text, without what its children say (a title followed by a badge, a chapter name followed by its date). */
function ownText(node: DomNode | null): string {
  if (!node) return '';
  let text = node.textContent ?? '';
  for (const child of node.querySelectorAll('*')) {
    const said = child.textContent ?? '';
    if (said) text = text.replace(said, ' ');
  }
  return clean(text);
}

/** The address of the first picture of `node` that has one. */
function picture(node: DomNode | null, base: string): string | null {
  for (const img of node?.querySelectorAll('img') ?? []) {
    for (const attribute of PICTURE_SOURCES) {
      const source = absolute(clean(img.getAttribute(attribute)), base);
      if (source) return secure(source);
    }
  }
  return null;
}

// Reads Demonic Scans' pages. What is known of them comes from the readers that already read the site
// (Mihon's and Kotatsu's modules for it, which agree): see README.md.
export class DemonicScansParser {
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
    return {
      url,
      title: ownText(doc.querySelector('h1.big-fat-titles')) || this.meta(doc, 'og:title') || DemonicScansUrls.nameOf(url),
      cover: picture(doc.querySelector('#manga-page'), url) ?? (absolute(this.meta(doc, 'og:image'), url) || null),
      author: facts.get('author') ?? '',
      status: facts.get('status') ?? '',
      genres: [...doc.querySelectorAll('.genres-list > li')].map((li) => clean(li.textContent)).filter(Boolean),
      description: clean(doc.querySelector('#manga-info-rightColumn .white-font')?.textContent) || this.meta(doc, 'og:description'),
      chapters,
    };
  }

  /** The series a page lists, in the order it shows them, each with its cover; what the first link to one did not say, the next completes. */
  parseList(doc: DomDocument, pageUrl: string, limit = MAX_ITEMS): SeriesSummary[] {
    const found = new Map<string, { title: string; cover: string | null }>();
    for (const link of doc.querySelectorAll('a[href]')) {
      const target = DemonicScansUrls.resolve(absolute(link.getAttribute('href'), pageUrl) ?? '');
      if (target?.kind !== 'series') continue;
      const card = link.closest(CARD) ?? link;
      if (card.querySelector(AD)) continue;
      const seen = found.get(target.url);
      found.set(target.url, { title: seen?.title || this.cardTitle(link, card), cover: seen?.cover ?? picture(card, pageUrl) });
    }
    return [...found].slice(0, limit).map(([url, card]) => ({ url, title: (card.title || DemonicScansUrls.nameOf(url)).slice(0, 120), cover: card.cover }));
  }

  /** The pictures of a chapter, in reading order. */
  parsePictures(doc: DomDocument, pageUrl: string): string[] {
    const pages: string[] = [];
    for (const img of doc.querySelectorAll('img.imgholder')) {
      for (const attribute of PICTURE_SOURCES) {
        const source = absolute(clean(img.getAttribute(attribute)), pageUrl);
        if (source) {
          if (!pages.includes(secure(source))) pages.push(secure(source));
          break;
        }
      }
    }
    return pages;
  }

  /** The series a chapter's page leads back to; null when none of its links does. */
  seriesOf(doc: DomDocument, pageUrl: string): string | null {
    for (const link of doc.querySelectorAll('a[href]')) {
      const target = DemonicScansUrls.resolve(absolute(link.getAttribute('href'), pageUrl) ?? '');
      if (target?.kind === 'series') return target.url;
    }
    return null;
  }

  /** Oldest first: the page lists the newest first. A chapter whose address has no number is numbered by its place. */
  private chapters(doc: DomDocument, seriesUrl: string): Chapter[] {
    const found = new Map<string, Chapter>();
    const links = [...doc.querySelectorAll('#chapters-list a.chplinks')];
    for (const link of links.length > 0 ? links : doc.querySelectorAll('a[href]')) {
      const url = DemonicScansUrls.chapter(absolute(link.getAttribute('href'), seriesUrl) ?? '', seriesUrl);
      const key = url ? DemonicScansUrls.resolve(url)?.key : undefined;
      const number = DemonicScansUrls.chapterNumber(key ?? '');
      if (!url || !key || !Number.isFinite(number) || found.has(key)) continue;
      const date = clean(link.querySelector('span')?.textContent);
      found.set(key, { url, key, number, title: ownText(link) || `Chapter ${number}`, date });
    }
    return [...found.values()].sort((a, b) => a.number - b.number);
  }

  /** The facts of a series (`#manga-info-stats`: label, value), by their label in lower case ("author", "status"...). */
  private facts(doc: DomDocument): Map<string, string> {
    const rows = new Map<string, string>();
    for (const row of doc.querySelectorAll('#manga-info-stats > div')) {
      const cells = [...row.querySelectorAll('li')];
      const label = clean(cells[0]?.textContent).toLowerCase().replace(/\s*:\s*$/, '');
      const value = clean(cells[1]?.textContent);
      if (label && value && !rows.has(label)) rows.set(label, value);
    }
    return rows;
  }

  private meta(doc: DomDocument, property: string): string {
    return clean(doc.querySelector(`meta[property="${property}"]`)?.getAttribute('content'));
  }

  /** What a card says of its series: its heading, the name beside a search result, the link's own words, its picture's description. */
  private cardTitle(link: DomNode, card: DomNode): string {
    return (
      ownText(card.querySelector('h1')) ||
      ownText(card.querySelector('.seach-right > div')) ||
      ownText(link) ||
      clean(link.getAttribute('title')) ||
      clean(card.querySelector('img')?.getAttribute('alt'))
    );
  }
}
