import { SourceError } from '../../errors.ts';
import type { ChapterPages } from '../../model.ts';
import type { DomDocument, HtmlParser, SourceIO, Transport } from '../../ports.ts';
import { absolute, clean, looksBlocked, mapLimit, secure } from '../../text.ts';
import { LelScanUrls } from './LelScanUrls.ts';

const PAGE_FETCHES_IN_FLIGHT = 6;

// A chapter's page image: /mangas/<series>/<chapter>/<file>. (The cover has one level less.)
const PAGE_IMAGE = /\/mangas\/[^/]+\/[^/]+\/[^/?#]+\.(?:jpe?g|png|webp|gif)/i;

// A chapter of LelScan is one page of HTML per image, each with the address of its own
// image. The files are not named alike from one series to the next (1.jpg, 00.jpg...), so
// none is guessed: every page is read, and the first one tells how many there are.
export class LelScanChapterReader {
  private readonly transport: Transport;
  private readonly parser: HtmlParser;

  constructor(io: SourceIO) {
    this.transport = io.transport;
    this.parser = io.parser;
  }

  async read(url: string): Promise<ChapterPages> {
    const first = await this.transport.text(url);
    const doc = this.parser.parse(first.text);
    const count = this.pageCount(doc);
    if (count === 0) {
      throw new SourceError(looksBlocked(first.text) ? 'blocked' : 'no_pages', 'No pages found in the chapter.', {
        url,
        htmlLength: first.text.length,
        pageTitle: clean(doc.querySelector('title')?.textContent),
      });
    }
    const numbers = Array.from({ length: count }, (_, i) => i + 1);
    const pages = await mapLimit(numbers, PAGE_FETCHES_IN_FLIGHT, async (page) => {
      if (page === 1) return this.image(doc, url, first.text.length, page);
      const address = LelScanUrls.page(url, page);
      const { text } = await this.transport.text(address);
      return this.image(this.parser.parse(text), address, text.length, page);
    });
    return { pages };
  }

  /** The pages are numbered links under the image: the highest number is the count. */
  private pageCount(doc: DomDocument): number {
    return Math.max(0, ...[...doc.querySelectorAll('#navigation a')].map((link) => (/^\d+$/.test(clean(link.textContent)) ? Number(clean(link.textContent)) : 0)));
  }

  private image(doc: DomDocument, pageUrl: string, htmlLength: number, page: number): string {
    for (const img of doc.querySelectorAll('img')) {
      const src = img.getAttribute('src');
      if (src && PAGE_IMAGE.test(src)) {
        const address = absolute(src, pageUrl);
        if (address) return secure(address);
      }
    }
    throw new SourceError('no_pages', `Page ${page} did not contain an image address.`, { url: pageUrl, htmlLength });
  }
}
