import { SourceError } from '../../errors.ts';
import type { ChapterPages, Series, SeriesSummary, SourceTarget } from '../../model.ts';
import type { SourceIO } from '../../ports.ts';
import type { ReadingStyle } from '../../reader/ReadingStyle.ts';
import { looksBlocked } from '../../text.ts';
import { Source } from '../Source.ts';
import { LelScanChapterReader } from './LelScanChapterReader.ts';
import { LelScanSeriesParser } from './LelScanSeriesParser.ts';
import { LelScanUrls } from './LelScanUrls.ts';

/** LelScan (lelscans.net): French scans of a few dozen series, one image a page. */
export class LelScanSource extends Source {
  readonly id = 'lelscan';
  readonly name = 'LelScan';
  /** The site only publishes in French. */
  readonly languages = ['fr'];
  /** Manga: page by page, from right to left. */
  readonly reading: ReadingStyle = { mode: 'paged', rtl: true };
  /** Its series pages say no genres. */
  override readonly genres = false;

  private readonly series = new LelScanSeriesParser();
  private readonly chapters: LelScanChapterReader;

  constructor(io: SourceIO) {
    super(io);
    this.chapters = new LelScanChapterReader(io);
  }

  resolve(input: string): SourceTarget | null {
    return LelScanUrls.resolve(input);
  }

  protected homeIn(): string {
    return `${LelScanUrls.origin}/`;
  }

  protected searchIn(query: string): string {
    return LelScanUrls.search(query);
  }

  async getSeries(url: string): Promise<Series> {
    const { doc, text } = await this.load(url);
    return this.series.parseSeries(doc, text, url);
  }

  async getList(url: string): Promise<SeriesSummary[]> {
    const query = LelScanUrls.queryOf(url);
    // The site does not know `q`: it is answered from the list the home page gives.
    const { doc, text } = await this.load(LelScanUrls.withoutQuery(url));
    const items = this.series.parseList(doc, url);
    if (items.length === 0 && looksBlocked(text)) {
      throw new SourceError('blocked', 'The site asked for a human check.', { url, htmlLength: text.length });
    }
    return query ? LelScanSeriesParser.matching(items, query) : items;
  }

  getChapter(url: string): Promise<ChapterPages> {
    return this.chapters.read(url);
  }
}
