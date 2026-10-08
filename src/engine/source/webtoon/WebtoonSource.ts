import { SourceError } from '../../errors.ts';
import type { ChapterPages, Series, SeriesSummary, SourceTarget } from '../../model.ts';
import type { SourceIO } from '../../ports.ts';
import { looksBlocked } from '../../text.ts';
import { Source } from '../Source.ts';
import { WebtoonEpisodes } from './WebtoonEpisodes.ts';
import { looksAgeGated, WebtoonSeriesParser } from './WebtoonSeriesParser.ts';
import { WebtoonUrls } from './WebtoonUrls.ts';
import { WebtoonViewer } from './WebtoonViewer.ts';

export interface WebtoonOptions {
  /** Language of the site to browse and search: en, fr, es, de... */
  language?: string;
}

/** WEBTOON (webtoons.com). */
export class WebtoonSource extends Source {
  readonly id = 'webtoon';
  readonly name = 'WEBTOON';
  readonly home: string;

  private readonly language: string;
  private readonly series = new WebtoonSeriesParser();
  private readonly viewer = new WebtoonViewer();
  private readonly episodes: WebtoonEpisodes;

  constructor(io: SourceIO, options: WebtoonOptions = {}) {
    super(io);
    this.language = options.language ?? 'en';
    this.home = WebtoonUrls.home(this.language);
    this.episodes = new WebtoonEpisodes(this.series, (url) => this.load(url));
  }

  resolve(input: string): SourceTarget | null {
    return WebtoonUrls.resolve(input);
  }

  searchUrl(query: string): string {
    return WebtoonUrls.search(this.language, query);
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
