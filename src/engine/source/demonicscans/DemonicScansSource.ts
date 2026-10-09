import { SourceError } from '../../errors.ts';
import type { ChapterPages, Series, SeriesSummary, SourceTarget } from '../../model.ts';
import type { ReadingStyle } from '../../reader/ReadingStyle.ts';
import { clean, looksBlocked } from '../../text.ts';
import { Source } from '../Source.ts';
import { DemonicScansParser } from './DemonicScansParser.ts';
import { DemonicScansUrls } from './DemonicScansUrls.ts';

/**
 * Demonic Scans (demonicscans.org, once Manga Demon): English scans, manhwa above all. Its pages are plain
 * HTML: a series lists its chapters, a chapter page has its pictures as <img>s.
 */
export class DemonicScansSource extends Source {
  readonly id = 'demonicscans';
  readonly name = 'Demonic Scans';
  /** The site only publishes in English. */
  readonly languages = ['en'];
  /** Mostly manhwa: one long column. */
  readonly reading: ReadingStyle = { mode: 'scroll', rtl: false };

  private readonly site = new DemonicScansParser();

  resolve(input: string): SourceTarget | null {
    return DemonicScansUrls.resolve(input);
  }

  protected homeIn(): string {
    return DemonicScansUrls.latest();
  }

  protected searchIn(query: string): string {
    return DemonicScansUrls.search(query);
  }

  async getSeries(url: string): Promise<Series> {
    const { doc, text } = await this.load(url);
    return this.site.parseSeries(doc, text, url);
  }

  async getList(url: string): Promise<SeriesSummary[]> {
    const { doc, text } = await this.load(url);
    const items = this.site.parseList(doc, url);
    if (items.length === 0 && looksBlocked(text)) throw new SourceError('blocked', 'The site asked for a human check.', { url, htmlLength: text.length });
    return items;
  }

  /** A chapter link pasted from the site does not name its series: the page does, in the way back it offers. */
  override async complete(target: SourceTarget): Promise<SourceTarget | null> {
    if (target.kind !== 'chapter' || target.seriesUrl) return target;
    const { doc } = await this.load(DemonicScansUrls.page(target.url));
    const series = this.site.seriesOf(doc, target.url);
    const url = series ? DemonicScansUrls.chapter(target.url, series) : null;
    return url ? DemonicScansUrls.resolve(url) : null;
  }

  async getChapter(url: string): Promise<ChapterPages> {
    const page = DemonicScansUrls.page(url);
    const { doc, text } = await this.load(page);
    const pages = this.site.parsePictures(doc, page);
    if (pages.length === 0) {
      throw new SourceError(looksBlocked(text) ? 'blocked' : 'no_pages', 'No pages found in the chapter.', {
        url,
        htmlLength: text.length,
        pageTitle: clean(doc.querySelector('title')?.textContent),
      });
    }
    return { pages };
  }
}
