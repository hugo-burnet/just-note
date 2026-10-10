import { SourceError } from '../../errors.ts';
import type { ChapterPages, Series, SeriesSummary, SourceTarget } from '../../model.ts';
import type { ReadingStyle } from '../../reader/ReadingStyle.ts';
import { absolute, clean, looksBlocked } from '../../text.ts';
import { Source } from '../Source.ts';
import type { Glance } from '../Source.ts';
import { chapterPictures, readerHint } from './SushiScanPictures.ts';
import { MAX_ITEMS, SushiScanParser } from './SushiScanParser.ts';
import { SushiScanUrls } from './SushiScanUrls.ts';

/**
 * SushiScan (sushiscan.net): French scans, manga, manhua and manhwa alike. The pages answer the phone's own
 * network (Cloudflare is behind them, and may ask for its check, which the app's WebView passes: see
 * ChallengeGate). The pictures of a chapter are listed in the page, in a script of its reader.
 */
export class SushiScanSource extends Source {
  readonly id = 'sushiscan';
  readonly name = 'SushiScan';
  /** The site only publishes in French. */
  readonly languages = ['fr'];
  /** Mostly manga, read the Japanese way; a series says otherwise (Series.reading) when it is a manhua or a manhwa. */
  readonly reading: ReadingStyle = { mode: 'paged', rtl: true };

  private readonly site = new SushiScanParser();

  resolve(input: string): SourceTarget | null {
    return SushiScanUrls.resolve(input);
  }

  protected homeIn(): string {
    return `${SushiScanUrls.origin}/`;
  }

  protected searchIn(query: string): string {
    return SushiScanUrls.search(query);
  }

  async getSeries(url: string): Promise<Series> {
    const { doc, text } = await this.load(url);
    return this.site.parseSeries(doc, text, url);
  }

  override glance(url: string): Promise<Glance> {
    return this.glanceWith(url, (doc) => this.site.parseGlance(doc, url));
  }

  async getList(url: string): Promise<SeriesSummary[]> {
    const { doc, text } = await this.load(url);
    const items = this.site.parseList(doc, url, MAX_ITEMS);
    if (items.length === 0 && looksBlocked(text)) throw new SourceError('blocked', 'The site asked for a human check.', { url, htmlLength: text.length });
    return items;
  }

  /** A chapter link pasted from the site does not name its series: the page does, in the way back it offers. */
  override async complete(target: SourceTarget): Promise<SourceTarget | null> {
    if (target.kind !== 'chapter' || target.seriesUrl) return target;
    const { doc } = await this.load(SushiScanUrls.page(target.url));
    for (const link of doc.querySelectorAll('a[href]')) {
      const series = SushiScanUrls.resolve(absolute(link.getAttribute('href'), target.url) ?? '');
      if (series?.kind !== 'series') continue;
      const url = SushiScanUrls.chapter(target.url, series.url);
      return url ? SushiScanUrls.resolve(url) : null;
    }
    return null;
  }

  async getChapter(url: string): Promise<ChapterPages> {
    const page = SushiScanUrls.page(url);
    const { doc, text } = await this.load(page);
    const pages = chapterPictures(text, page);
    if (pages.length === 0) {
      throw new SourceError(looksBlocked(text) ? 'blocked' : 'no_pages', 'No pages found in the chapter.', {
        url,
        htmlLength: text.length,
        pageTitle: clean(doc.querySelector('title')?.textContent),
        reader: readerHint(text),
      });
    }
    return { pages };
  }
}
