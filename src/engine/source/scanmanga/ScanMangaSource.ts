import { SourceError } from '../../errors.ts';
import type { ChapterPages, Series, SeriesSummary, SourceTarget } from '../../model.ts';
import type { ReadingStyle } from '../../reader/ReadingStyle.ts';
import { clean, looksBlocked } from '../../text.ts';
import { Source } from '../Source.ts';
import { ScanMangaSeriesParser } from './ScanMangaSeriesParser.ts';
import { ScanMangaUrls } from './ScanMangaUrls.ts';

// The pages of a chapter are <img> elements the site's reader fills in with blob: addresses.
const PAGE_PICTURES = 'img[src^="blob:"]';

/**
 * Scan-Manga (scan-manga.com): French scans, mostly manhwa and webtoons. Cloudflare checks its
 * visitors, which only the installed app can pass (see ChallengeGate), and its reader builds
 * the pictures of a chapter with scripts, so a chapter is read from a browser of the app's own.
 */
export class ScanMangaSource extends Source {
  readonly id = 'scanmanga';
  readonly name = 'Scan-Manga';
  /** The site only publishes in French. */
  readonly languages = ['fr'];
  /** Mostly vertical works (webtoons, manhwa): one long column, left to right. */
  readonly reading: ReadingStyle = { mode: 'scroll', rtl: false };

  private readonly series = new ScanMangaSeriesParser();

  resolve(input: string): SourceTarget | null {
    return ScanMangaUrls.resolve(input);
  }

  protected homeIn(): string {
    return `${ScanMangaUrls.origin}/?po`;
  }

  protected searchIn(query: string): string {
    return ScanMangaUrls.search(query);
  }

  async getSeries(url: string): Promise<Series> {
    const { doc, text } = await this.load(url);
    return this.series.parseSeries(doc, text, url);
  }

  async getList(url: string): Promise<SeriesSummary[]> {
    const query = ScanMangaUrls.queryOf(url);
    // The site's search needs a script: it is answered from the list of all the titles.
    const address = ScanMangaUrls.withoutQuery(url);
    const { doc, text } = await this.load(address);
    const items = this.series.parseList(doc, address);
    if (items.length === 0 && looksBlocked(text)) {
      throw new SourceError('blocked', 'The site asked for a human check.', { url, htmlLength: text.length });
    }
    return query ? ScanMangaSeriesParser.matching(items, query) : items;
  }

  async getChapter(url: string): Promise<ChapterPages> {
    const page = ScanMangaUrls.page(url);
    if (!this.transport.render) {
      throw new SourceError('unsupported', 'The pictures of this site are built by its scripts: only the installed app can read them.', { url });
    }
    const rendered = await this.transport.render(page, { pictures: PAGE_PICTURES });
    if (rendered.pictures.length === 0) {
      throw new SourceError(looksBlocked(rendered.text) ? 'blocked' : 'no_pages', 'No pages found in the chapter.', {
        url,
        htmlLength: rendered.text.length,
        pageTitle: clean(this.parser.parse(rendered.text).querySelector('title')?.textContent),
      });
    }
    return { pages: rendered.pictures };
  }
}
