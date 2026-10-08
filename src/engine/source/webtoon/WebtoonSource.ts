import { SourceError } from '../../errors.ts';
import type { ChapterPages, Series, SeriesSummary, SourceTarget } from '../../model.ts';
import type { SourceIO } from '../../ports.ts';
import type { ReadingStyle } from '../../reader/ReadingStyle.ts';
import { looksBlocked } from '../../text.ts';
import { Source } from '../Source.ts';
import { WebtoonEpisodes } from './WebtoonEpisodes.ts';
import { looksAgeGated, WebtoonSeriesParser } from './WebtoonSeriesParser.ts';
import { WebtoonUrls } from './WebtoonUrls.ts';
import { WebtoonViewer } from './WebtoonViewer.ts';

/**
 * WEBTOON (webtoons.com). The site has one catalogue per language, all on the same
 * addresses but for their first segment: a link in any of them is read the same way.
 */
export class WebtoonSource extends Source {
  readonly id = 'webtoon';
  readonly name = 'WEBTOON';
  /** The catalogues the app can browse (the site has more); English is the default. */
  readonly languages = ['en', 'fr'];
  /** A webtoon is one long column, read downwards. */
  readonly reading: ReadingStyle = { mode: 'scroll', rtl: false };

  private readonly series = new WebtoonSeriesParser();
  private readonly viewer = new WebtoonViewer();
  private readonly episodes: WebtoonEpisodes;

  constructor(io: SourceIO) {
    super(io);
    this.episodes = new WebtoonEpisodes(this.series, (url) => this.load(url));
  }

  resolve(input: string): SourceTarget | null {
    return WebtoonUrls.resolve(input);
  }

  protected homeIn(language: string): string {
    return WebtoonUrls.home(language);
  }

  protected searchIn(query: string, language: string): string {
    return WebtoonUrls.search(language, query);
  }

  async getSeries(url: string): Promise<Series> {
    const first = await this.load(url);
    const chapters = await this.episodes.collect(first.doc, url);
    return this.series.parseSeries(first.doc, first.text, url, chapters);
  }

  async getList(url: string): Promise<SeriesSummary[]> {
    const { doc, text } = await this.load(url);
    const items = this.series.parseList(doc, url);
    if (items.length === 0 && looksBlocked(text)) {
      throw new SourceError('blocked', 'The site asked for a human check.', { url, htmlLength: text.length });
    }
    return items;
  }

  async getChapter(url: string): Promise<ChapterPages> {
    const { doc, text } = await this.load(url);
    const pages = this.viewer.images(doc, url);
    if (pages.length > 0) return { pages };
    const code = looksBlocked(text) ? 'blocked' : looksAgeGated(text) ? 'age_gated' : 'no_pages';
    throw new SourceError(code, 'No images found in the episode.', { url, htmlLength: text.length });
  }
}
