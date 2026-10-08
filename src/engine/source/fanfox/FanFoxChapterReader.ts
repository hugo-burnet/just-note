import { SourceError } from '../../errors.ts';
import type { ChapterPages } from '../../model.ts';
import type { DomDocument, HtmlParser, SourceIO, Transport } from '../../ports.ts';
import { looksBlocked, mapLimit, secure } from '../../text.ts';
import { PackedScript } from '../PackedScript.ts';

const PAGE_FETCHES_IN_FLIGHT = 6;

interface LegacyChapter {
  readonly chapterId: string;
  readonly count: number;
  readonly key: string;
}

const quoted = (list: string): string[] => [...list.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2] ?? '');

// FanFox has shipped two layouts for a chapter, and both are handled:
//  A. the whole chapter is listed in a packed inline script (newImgs=[...]);
//  B. the page only knows the chapter id and its page count, and each image
//     address comes from chapterfun.ashx (itself a packed script).
export class FanFoxChapterReader {
  private readonly transport: Transport;
  private readonly parser: HtmlParser;

  constructor(io: SourceIO) {
    this.transport = io.transport;
    this.parser = io.parser;
  }

  async read(url: string): Promise<ChapterPages> {
    const { text } = await this.transport.text(url);

    const inline = this.inlinePages(text);
    if (inline.length > 0) return { pages: inline };

    const legacy = this.legacyChapter(this.parser.parse(text), text);
    if (legacy) {
      const numbers = Array.from({ length: legacy.count }, (_, i) => i + 1);
      return { pages: await mapLimit(numbers, PAGE_FETCHES_IN_FLIGHT, (page) => this.legacyPage(url, legacy, page)) };
    }

    throw new SourceError(looksBlocked(text) ? 'blocked' : 'no_pages', 'No pages found in the chapter.', {
      url,
      htmlLength: text.length,
    });
  }

  private inlinePages(html: string): string[] {
    for (const code of PackedScript.decodeAll(html)) {
      const list = /newImgs\s*=\s*\[([^\]]*)\]/.exec(code)?.[1];
      if (list) return quoted(list).map(secure);
    }
    return [];
  }

  private legacyChapter(doc: DomDocument, html: string): LegacyChapter | null {
    const chapterId = /\bchapterid\s*=\s*(\d+)/i.exec(html)?.[1];
    let count = Number(/\bimagecount\s*=\s*(\d+)/i.exec(html)?.[1]);
    if (!count) {
      count = Math.max(0, ...[...doc.querySelectorAll('.pager-list-left a[data-page]')].map((a) => Number(a.getAttribute('data-page')) || 0));
    }
    const key = doc.querySelector('#dm5_key')?.getAttribute('value') ?? '';
    return chapterId && count ? { chapterId, count, key } : null;
  }

  private async legacyPage(chapterUrl: string, chapter: LegacyChapter, page: number): Promise<string> {
    const endpoint = new URL('chapterfun.ashx', chapterUrl);
    endpoint.search = new URLSearchParams({ cid: chapter.chapterId, page: String(page), key: chapter.key }).toString();
    // The answer carries a one-off token: it is not worth keeping for offline use.
    const { text } = await this.transport.text(endpoint.href, { referer: chapterUrl, cache: false });
    const code = PackedScript.decode(text) ?? text;
    const base = /\bpix\s*=\s*["']([^"']+)["']/.exec(code)?.[1];
    const first = /\bpvalue\s*=\s*\[\s*["']([^"']+)["']/.exec(code)?.[1];
    if (!base || !first) {
      throw new SourceError('no_pages', `Page ${page} did not contain an image address.`, {
        url: endpoint.href,
        responseLength: text.length,
      });
    }
    return secure(base + first);
  }
}
