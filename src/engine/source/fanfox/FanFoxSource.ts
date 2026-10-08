import { SourceError } from '../../errors.ts';
import type { ChapterPages, Series, SeriesSummary, SourceTarget } from '../../model.ts';
import type { SourceIO } from '../../ports.ts';
import type { ReadingStyle } from '../../reader/ReadingStyle.ts';
import { looksBlocked } from '../../text.ts';
import { Source } from '../Source.ts';
import { FanFoxChapterReader } from './FanFoxChapterReader.ts';
import { FanFoxSeriesParser } from './FanFoxSeriesParser.ts';
import { FanFoxUrls } from './FanFoxUrls.ts';

/** FanFox, a.k.a. MangaFox. */
export class FanFoxSource extends Source {
  readonly id = 'fanfox';
  readonly name = 'FanFox';
  /** The site only publishes in English. */
  readonly languages = ['en'];
  /** Manga: page by page, from right to left. */
  readonly reading: ReadingStyle = { mode: 'paged', rtl: true };

  private readonly series = new FanFoxSeriesParser();
  private readonly chapters: FanFoxChapterReader;

  constructor(io: SourceIO) {
    super(io);
    this.chapters = new FanFoxChapterReader(io);
  }

  resolve(input: string): SourceTarget | null {
    return FanFoxUrls.resolve(input);
  }

  protected homeIn(): string {
    return `${FanFoxUrls.origin}/`;
  }

  protected searchIn(query: string): string {
    return FanFoxUrls.search(query);
  }

  async getSeries(url: string): Promise<Series> {
    const { doc, text } = await this.load(url);
    return this.series.parseSeries(doc, text, url);
  }

  async getList(url: string): Promise<SeriesSummary[]> {
    const { doc, text } = await this.load(url);
    const items = this.series.parseList(doc, url);
    if (items.length === 0 && looksBlocked(text)) {
      throw new SourceError('blocked', 'The site asked for a human check.', { url, htmlLength: text.length });
    }
    return items;
  }

  getChapter(url: string): Promise<ChapterPages> {
    return this.chapters.read(url);
  }
}
