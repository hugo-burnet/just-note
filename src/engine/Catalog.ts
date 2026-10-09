import { SourceError } from './errors.ts';
import type { Library } from './library/Library.ts';
import { Memo } from './Memo.ts';
import type { ChapterPages, Series, SeriesSummary, SourceTarget } from './model.ts';
import type { Source } from './source/Source.ts';
import type { ResolvedLink, SourceRegistry } from './source/SourceRegistry.ts';

const TTL_MS = 5 * 60_000;

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

  constructor(registry: SourceRegistry, library: Library, now: () => number = Date.now) {
    this.registry = registry;
    this.library = library;
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
    const series = await this.seriesMemo.get(url, () => this.sourceFor(url).getSeries(url));
    this.library.save(series);
    return series;
  }

  chapter(url: string): Promise<ChapterPages> {
    return this.chapterMemo.get(url, () => this.sourceFor(url).getChapter(url));
  }

  list(url: string): Promise<SeriesSummary[]> {
    return this.listMemo.get(url, () => this.sourceFor(url).getList(url));
  }

  private sourceFor(url: string): Source {
    const link = this.registry.resolve(url);
    if (!link) throw new SourceError('unsupported', `No source understands ${url}.`, { url });
    return link.source;
  }
}
