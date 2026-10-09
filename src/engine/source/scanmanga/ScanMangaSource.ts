import { SourceError } from '../../errors.ts';
import type { ChapterPages, Series, SeriesSummary, SourceTarget } from '../../model.ts';
import type { ReadingStyle } from '../../reader/ReadingStyle.ts';
import { absolute, clean, looksBlocked } from '../../text.ts';
import { Source } from '../Source.ts';
import type { ChapterOptions, Glance } from '../Source.ts';
import { Memo } from '../../Memo.ts';
import { MAX_ITEMS, ScanMangaSeriesParser } from './ScanMangaSeriesParser.ts';
import { ScanMangaUrls } from './ScanMangaUrls.ts';

// The pages of a chapter are <img> elements the site's reader fills in with blob: addresses, each in a
// div.image-container that is there (numbered, with the size of its picture) before the picture is. A
// manga chapter has twice as many elements numbered `data-page` as pictures (44 for 22); the pictures sit
// in the `strip` ones.
const PAGE_PICTURES = 'img[src^="blob:"]';
const PAGE_PLACES = '.image-container.strip[data-page]';

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

  /** The covers of its listings are thumbnails of a hundred and thirty pixels: the series page has the real one. */
  override readonly betterCovers = true;

  private readonly series = new ScanMangaSeriesParser();
  private readonly everything = new Memo<SeriesSummary[]>(10 * 60_000);

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

  /** Of the many series a listing shows, none is worth keeping the page of, as it is asked for only for the cover and the genres. */
  override async glance(url: string): Promise<Glance> {
    const { doc, text } = await this.load(url, { cache: false });
    const { cover, genres } = this.series.parseSeries(doc, text, url);
    return { cover, genres };
  }

  async getList(url: string): Promise<SeriesSummary[]> {
    const query = ScanMangaUrls.queryOf(url);
    // The site's search needs a script: it is answered from the list of all the titles, read whole (sixteen
    // thousand series, a couple of megabytes) and kept for a few minutes, as the next words typed ask for it again.
    const address = ScanMangaUrls.withoutQuery(url);
    const items = await (query ? this.everything.get(address, () => this.read(address, Infinity)) : this.read(address, MAX_ITEMS));
    return query ? ScanMangaSeriesParser.matching(items, query).slice(0, MAX_ITEMS) : items;
  }

  private async read(address: string, limit: number): Promise<SeriesSummary[]> {
    const { doc, text } = await this.load(address);
    const items = this.series.parseList(doc, address, limit);
    if (items.length === 0 && looksBlocked(text)) {
      throw new SourceError('blocked', 'The site asked for a human check.', { url: address, htmlLength: text.length });
    }
    return items;
  }

  /** A chapter link pasted from the site does not name its series: the page does, in the way back it offers. */
  override async complete(target: SourceTarget): Promise<SourceTarget | null> {
    if (target.kind !== 'chapter' || target.seriesUrl) return target;
    const { doc } = await this.load(ScanMangaUrls.page(target.url));
    const slug = ScanMangaUrls.slugOf(target.url);
    const links = [doc.querySelector('a.lelHgHistoryBack'), ...doc.querySelectorAll('a[href]')];
    for (const link of links) {
      const series = ScanMangaUrls.resolve(absolute(link?.getAttribute('href'), target.url) ?? '');
      // The way back first; failing it, any link to the series that has the chapter's name.
      if (series?.kind === 'series' && (link === links[0] || ScanMangaUrls.slugOf(series.url) === slug)) {
        const url = ScanMangaUrls.chapter(target.url, series.url);
        return url ? ScanMangaUrls.resolve(url) : null;
      }
    }
    return null;
  }

  async getChapter(url: string, options: ChapterOptions = {}): Promise<ChapterPages> {
    const page = ScanMangaUrls.page(url);
    if (!this.transport.render) {
      throw new SourceError('unsupported', 'The pictures of this site are built by its scripts: only the installed app can read them.', { url });
    }
    const rendered = await this.transport.render(page, { pictures: PAGE_PICTURES, slots: PAGE_PLACES, ...(options.background ? { background: true } : {}) });
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
