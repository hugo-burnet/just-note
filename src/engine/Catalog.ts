import { SourceError } from './errors.ts';
import type { CoverShelf } from './library/CoverShelf.ts';
import type { Library } from './library/Library.ts';
import { Limiter } from './Limiter.ts';
import { Memo } from './Memo.ts';
import type { ChapterPages, Series, SeriesSummary, SourceTarget } from './model.ts';
import type { ChapterOptions, Source } from './source/Source.ts';
import type { ResolvedLink, SourceRegistry } from './source/SourceRegistry.ts';

const TTL_MS = 5 * 60_000;

/** What was downloaded to be read offline (see Downloads): consulted before the sites. */
export interface SavedContent {
  pages(chapterUrl: string): Promise<ChapterPages | null>;
  series(seriesUrl: string): Promise<Series | null>;
}
// The series pages asked for their covers, at the same time: the site is not a thing to hammer.
const COVERS_AT_ONCE = 3;

/**
 * What the views ask for: series, chapters, listings. Looking at a series puts
 * it in the library, even when the answer comes from memory: a series removed a
 * minute ago comes back when it is opened again.
 */
export class Catalog {
  private readonly registry: SourceRegistry;
  private readonly library: Library;
  private readonly seriesMemo: Memo<Series>;
  private readonly chapterMemo: Memo<ChapterPages>;
  private readonly listMemo: Memo<SeriesSummary[]>;
  private readonly completeMemo: Memo<SourceTarget | null>;
  private readonly shelf: CoverShelf | undefined;
  private readonly coverLimit = new Limiter(COVERS_AT_ONCE);
  private readonly askingCover = new Map<string, Promise<string | null>>();
  private readonly saved: SavedContent | undefined;

  /** `covers`: where the covers found for listings are kept from one start to the next. `saved`: what was downloaded. */
  constructor(registry: SourceRegistry, library: Library, now: () => number = Date.now, covers?: CoverShelf, saved?: SavedContent) {
    this.saved = saved;
    this.registry = registry;
    this.library = library;
    this.shelf = covers;
    this.seriesMemo = new Memo(TTL_MS, now);
    this.chapterMemo = new Memo(TTL_MS, now);
    this.listMemo = new Memo(TTL_MS, now);
    this.completeMemo = new Memo(TTL_MS, now);
  }

  /** What a link points at, whole: a chapter that does not name its series is looked up. Null when no site knows the link. */
  async resolve(input: string): Promise<ResolvedLink | null> {
    const link = this.registry.resolve(input);
    if (!link || link.kind !== 'chapter' || link.seriesUrl) return link;
    const whole = await this.completeMemo.get(link.url, () => link.source.complete(link));
    return whole ? { ...whole, source: link.source } : null;
  }

  async series(url: string, options: { fresh?: boolean } = {}): Promise<Series> {
    if (options.fresh) this.seriesMemo.forget(url);
    const series = await this.seriesMemo.get(url, () => this.readSeries(url));
    this.library.save(series);
    return series;
  }

  /**
   * `options.background`: the chapter is read ahead. Asked for again while that goes on, it is the same answer, not a second reading;
   * and where the read ahead failed (a check that wants a person), the next ask is a new one, not remembered.
   */
  chapter(url: string, options: ChapterOptions = {}): Promise<ChapterPages> {
    // A chapter downloaded is read from the device, network or not: it is the same, and it is there.
    return this.chapterMemo.get(url, async () => (await this.saved?.pages(url)) ?? this.sourceFor(url).getChapter(url, options));
  }

  /**
   * The cover on the page of a series, for a listing whose own covers are poor (`Source.betterCovers`): a few at a
   * time, and only for a series someone still looks at when its turn comes (`wanted`). Null when there is none to be
   * had, or the page cannot be read: the listing's cover stays. It never puts the series in the library.
   */
  cover(url: string, wanted: () => boolean = () => true): Promise<string | null> {
    const known = this.shelf?.get(url);
    if (known) return Promise.resolve(known);
    const pending = this.askingCover.get(url);
    if (pending) return pending;
    const asked = this.coverLimit
      .run(async () => {
        if (!wanted()) return null;
        const cover = await this.sourceFor(url).coverOf(url);
        if (cover) this.shelf?.set(url, cover);
        return cover;
      })
      .catch(() => null)
      .finally(() => this.askingCover.delete(url));
    this.askingCover.set(url, asked);
    return asked;
  }

  list(url: string): Promise<SeriesSummary[]> {
    return this.listMemo.get(url, () => this.sourceFor(url).getList(url));
  }

  /** From its site; when the site cannot be had (no network on a train), as it was when one of its chapters was downloaded. */
  private async readSeries(url: string): Promise<Series> {
    const source = this.sourceFor(url);
    try {
      return await source.getSeries(url);
    } catch (error) {
      const kept = await this.saved?.series(url);
      if (kept) return kept;
      throw error;
    }
  }

  private sourceFor(url: string): Source {
    const link = this.registry.resolve(url);
    if (!link) throw new SourceError('unsupported', `No source understands ${url}.`, { url });
    return link.source;
  }
}
