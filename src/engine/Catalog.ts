import { SourceError } from './errors.ts';
import type { CoverShelf } from './library/CoverShelf.ts';
import type { GenreShelf } from './library/GenreShelf.ts';
import type { Library } from './library/Library.ts';
import { Limiter } from './Limiter.ts';
import { Memo } from './Memo.ts';
import type { ChapterPages, Series, SeriesSummary, SourceTarget } from './model.ts';
import type { ChapterOptions, Glance, Source } from './source/Source.ts';
import type { ResolvedLink, SourceRegistry } from './source/SourceRegistry.ts';

const TTL_MS = 5 * 60_000;

/** What was downloaded to be read offline (see Downloads): consulted before the sites. */
export interface SavedContent {
  pages(chapterUrl: string): Promise<ChapterPages | null>;
  series(seriesUrl: string): Promise<Series | null>;
}
// The series pages asked for their covers, at the same time: the site is not a thing to hammer.
const COVERS_AT_ONCE = 3;
// The same for the genres of the series of a listing (their pages say them; listings do not).
const GENRES_AT_ONCE = 3;

/** The page of a series being read for its cover or its genres, and whether each of those who asked for it still wants it. */
interface Reading {
  readonly result: Promise<Glance | null>;
  readonly wanted: Set<() => boolean>;
}

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
  private readonly saved: SavedContent | undefined;
  private readonly genreShelf: GenreShelf | undefined;
  private readonly genreLimit = new Limiter(GENRES_AT_ONCE);
  /** The pages of series of listings being read for their cover or their genres: one reading for both. */
  private readonly glancing = new Map<string, Reading>();

  /**
   * `covers` and `genres`: where the covers and the genres found for listings are kept from one start to the next.
   * `saved`: what was downloaded.
   */
  constructor(registry: SourceRegistry, library: Library, now: () => number = Date.now, covers?: CoverShelf, saved?: SavedContent, genres?: GenreShelf) {
    this.saved = saved;
    this.genreShelf = genres;
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
    this.genreShelf?.set(url, series.genres);
    return series;
  }

  /**
   * The genres of a series of a listing, which only its page says: what is known of it (kept, or in the library),
   * else its page, a few at a time, and only for a series still wanted when its turn comes. Null when they
   * cannot be had (the page could not be read, or is not a series' page): nothing is kept of that, and the next
   * ask is a new try. It never puts the series in the library.
   */
  genres(url: string, wanted: () => boolean = () => true): Promise<readonly string[] | null> {
    const known = this.genreShelf?.get(url) ?? this.library.get(url)?.genres;
    if (known) return Promise.resolve(known);
    return this.glance(url, wanted, this.genreLimit).then((seen) => seen?.genres ?? null);
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
    return this.glance(url, wanted, this.coverLimit).then((seen) => seen?.cover ?? null);
  }

  /**
   * The first page of a series of a listing, read once for its cover and its genres alike (a site behind an
   * anti-bot check answers slowly: one reading, not two), and what it says kept. Never the series whole: a
   * listing does not ask for its chapters, and a series whose chapters cannot be made out has its genres all
   * the same. Asked for by more than one (its card for the cover, the filter for the genres), the page is read
   * when its turn comes if any of them still wants it: a card scrolled out of sight does not cancel the filter.
   */
  private glance(url: string, wanted: () => boolean, limit: Limiter): Promise<Glance | null> {
    const reading = this.glancing.get(url);
    if (reading) {
      reading.wanted.add(wanted);
      return reading.result;
    }
    const asked = new Set([wanted]);
    // Only this reading is forgotten: a new one may have taken its place.
    const forget = (): void => {
      if (this.glancing.get(url)?.wanted === asked) this.glancing.delete(url);
    };
    // Not started in this very turn: whoever asks next in it is one of those the reading is for.
    const result = Promise.resolve()
      .then(() =>
        limit.run(async (): Promise<Glance | null> => {
          if (![...asked].some((one) => one())) {
            forget();
            return null;
          }
          const source = this.sourceFor(url);
          const seen = await source.glance(url);
          if (seen.cover && source.betterCovers) this.shelf?.set(url, seen.cover);
          this.genreShelf?.set(url, seen.genres);
          return seen;
        }),
      )
      .catch(() => null)
      .finally(forget);
    this.glancing.set(url, { result, wanted: asked });
    return result;
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
