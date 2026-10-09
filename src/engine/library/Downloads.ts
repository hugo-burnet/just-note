import type { Chapter, ChapterPages, Series } from '../model.ts';
import type { KeyValueStore, OfflineShelf } from '../ports.ts';
import { mapLimit } from '../text.ts';

/** A chapter kept on the device, as the list of downloads knows it. */
export interface SavedChapter {
  readonly url: string;
  readonly series: string;
  readonly seriesTitle: string;
  readonly key: string;
  readonly number: number;
  readonly title: string;
  readonly pictures: number;
  readonly bytes: number;
  readonly savedAt: number;
}

/** Where a chapter is in its download: waiting its turn, coming in (`done` of `total` pictures), kept, or failed. */
export interface DownloadState {
  readonly status: 'queued' | 'running' | 'saved' | 'failed';
  readonly done: number;
  readonly total: number;
}

interface Job {
  readonly series: Series;
  readonly chapter: Chapter;
}

const SAVED = 'jr:saved:';
// A few pictures at a time: the site's server (or the phone's network) gives up on more.
const PICTURES_AT_ONCE = 3;
const pagesKey = (chapterUrl: string): string => `chapter:${chapterUrl}`;
const seriesKey = (seriesUrl: string): string => `series:${seriesUrl}`;

/**
 * Chapters downloaded to be read with no network (on a train): one at a time, in the order they were
 * asked for. A chapter is kept whole or not at all: its list of pictures (so that its site is not asked
 * again), every picture, and the page of its series (so that the series opens offline too). What is kept
 * is listed in the key-value store; the bytes are on the platform's shelf, which nothing clears by itself.
 * `read` gives the pictures of a chapter, as the reader would have them.
 */
export class Downloads {
  private readonly store: KeyValueStore;
  private readonly shelf: OfflineShelf | null;
  private readonly read: (chapterUrl: string) => Promise<ChapterPages>;
  private readonly now: () => number;
  private readonly queue: Job[] = [];
  private readonly live = new Map<string, DownloadState>();
  private readonly listeners = new Set<() => void>();
  private working = false;
  /** The chapter coming in. */
  private current: Job | undefined;
  /** Let go while it was coming in: it is not kept when it ends. */
  private abandoned = false;
  private persisted = false;

  constructor(store: KeyValueStore, shelf: OfflineShelf | null, read: (chapterUrl: string) => Promise<ChapterPages>, now: () => number = Date.now) {
    this.store = store;
    this.shelf = shelf;
    this.read = read;
    this.now = now;
  }

  /** Whether this platform can keep chapters at all. */
  get available(): boolean {
    return this.shelf !== null;
  }

  /** Every chapter kept, or those of one series: by series, then in reading order. */
  saved(seriesUrl?: string): SavedChapter[] {
    return this.store
      .keys()
      .filter((key) => key.startsWith(SAVED))
      .map((key) => this.record(key.slice(SAVED.length)))
      .filter((saved): saved is SavedChapter => saved !== null && (seriesUrl === undefined || saved.series === seriesUrl))
      .sort((a, b) => a.series.localeCompare(b.series) || a.number - b.number);
  }

  isSaved(chapterUrl: string): boolean {
    return this.record(chapterUrl) !== null;
  }

  state(chapterUrl: string): DownloadState | null {
    const live = this.live.get(chapterUrl);
    if (live) return live;
    const saved = this.record(chapterUrl);
    return saved ? { status: 'saved', done: saved.pictures, total: saved.pictures } : null;
  }

  /** How many chapters of a series are waiting or coming in. */
  pending(seriesUrl: string): number {
    return this.queue.filter((job) => job.series.url === seriesUrl).length + (this.current?.series.url === seriesUrl ? 1 : 0);
  }

  /** What all the downloads weigh. */
  usage(): { chapters: number; bytes: number } {
    const all = this.saved();
    return { chapters: all.length, bytes: all.reduce((sum, saved) => sum + saved.bytes, 0) };
  }

  /** Puts chapters in the queue (those kept or already waiting are left as they are). */
  download(series: Series, chapters: readonly Chapter[]): void {
    if (!this.shelf) return;
    for (const chapter of chapters) {
      if (this.isSaved(chapter.url) || this.queue.some((job) => job.chapter.url === chapter.url) || this.live.get(chapter.url)?.status === 'running') continue;
      this.queue.push({ series, chapter });
      this.live.set(chapter.url, { status: 'queued', done: 0, total: 0 });
    }
    this.changed();
    void this.work();
  }

  /** Takes chapters out of the queue, has the one coming in let go when it ends, and forgets failures. */
  cancel(chapterUrls: readonly string[]): void {
    for (const url of chapterUrls) {
      const index = this.queue.findIndex((job) => job.chapter.url === url);
      if (index >= 0) this.queue.splice(index, 1);
      if (this.current?.chapter.url === url) this.abandoned = true;
      else this.live.delete(url);
    }
    this.changed();
  }

  /** Lets kept chapters go, pictures and all. */
  async remove(chapterUrls: readonly string[]): Promise<void> {
    this.cancel(chapterUrls);
    const series = new Set<string>();
    for (const url of chapterUrls) {
      const saved = this.record(url);
      if (!saved) continue;
      series.add(saved.series);
      this.store.remove(SAVED + url);
      await this.drop(url);
    }
    // A series with nothing kept any more does not need its page kept either.
    for (const url of series) if (this.saved(url).length === 0) await this.shelf?.dropText(seriesKey(url)).catch(() => {});
    this.changed();
  }

  /** Every download of a series, waiting or kept. */
  async removeSeries(seriesUrl: string): Promise<void> {
    const coming = [...this.queue, ...(this.current ? [this.current] : [])].filter((job) => job.series.url === seriesUrl);
    this.cancel(coming.map((job) => job.chapter.url));
    await this.remove(this.saved(seriesUrl).map((saved) => saved.url));
  }

  /** The pictures of a kept chapter; null when it is not kept (or its list cannot be read). */
  async pages(chapterUrl: string): Promise<ChapterPages | null> {
    if (!this.shelf || !this.isSaved(chapterUrl)) return null;
    return this.json<ChapterPages>(pagesKey(chapterUrl));
  }

  /** The page of a series as it was when one of its chapters was kept; null when none is. */
  async series(seriesUrl: string): Promise<Series | null> {
    if (!this.shelf || this.saved(seriesUrl).length === 0) return null;
    return this.json<Series>(seriesKey(seriesUrl));
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private async work(): Promise<void> {
    if (this.working || !this.shelf) return;
    this.working = true;
    try {
      if (!this.persisted) this.persisted = await this.shelf.persist().catch(() => false);
      while ((this.current = this.queue.shift())) await this.take(this.shelf, this.current);
    } finally {
      this.current = undefined;
      this.working = false;
    }
  }

  private async take(shelf: OfflineShelf, { series, chapter }: Job): Promise<void> {
    const url = chapter.url;
    this.live.set(url, { status: 'running', done: 0, total: 0 });
    this.abandoned = false;
    this.changed();
    let pages: readonly string[] = [];
    // Every picture asked for, to wait for those still coming in when one fails, before letting them go.
    const asked: Array<Promise<number>> = [];
    try {
      ({ pages } = await this.read(url));
      let done = 0;
      const sizes = await mapLimit(pages, PICTURES_AT_ONCE, (picture) => {
        const kept = shelf.keepPicture(picture).then((size) => {
          this.live.set(url, { status: 'running', done: ++done, total: pages.length });
          this.changed();
          return size;
        });
        asked.push(kept);
        return kept;
      });
      if (this.abandoned) throw new Error('Let go while it was coming in.');
      await shelf.keepText(pagesKey(url), JSON.stringify({ pages }));
      await shelf.keepText(seriesKey(series.url), JSON.stringify(series));
      const saved: SavedChapter = {
        url,
        series: series.url,
        seriesTitle: series.title,
        key: chapter.key,
        number: chapter.number,
        title: chapter.title,
        pictures: pages.length,
        bytes: sizes.reduce((sum, size) => sum + size, 0),
        savedAt: this.now(),
      };
      if (this.store.set(SAVED + url, JSON.stringify(saved)) === false) throw new Error('The list of downloads could not be written.');
      this.live.delete(url);
    } catch {
      // Half a chapter is no use on a train: what came is let go.
      await Promise.allSettled(asked);
      await shelf.dropPictures(pages).catch(() => {});
      await shelf.dropText(pagesKey(url)).catch(() => {});
      if (this.abandoned) this.live.delete(url);
      else this.live.set(url, { status: 'failed', done: 0, total: 0 });
    }
    // Over, kept or not: it is no longer coming in when the listeners look.
    this.current = undefined;
    this.changed();
  }

  /** The pictures and the list of a chapter, off the shelf. */
  private async drop(chapterUrl: string): Promise<void> {
    if (!this.shelf) return;
    const kept = await this.json<ChapterPages>(pagesKey(chapterUrl));
    if (kept) await this.shelf.dropPictures(kept.pages).catch(() => {});
    await this.shelf.dropText(pagesKey(chapterUrl)).catch(() => {});
  }

  private async json<T>(key: string): Promise<T | null> {
    try {
      const text = await this.shelf?.text(key);
      return text ? (JSON.parse(text) as T) : null;
    } catch {
      return null;
    }
  }

  private record(chapterUrl: string): SavedChapter | null {
    const raw = this.store.get(SAVED + chapterUrl);
    if (!raw) return null;
    try {
      const saved = JSON.parse(raw) as SavedChapter;
      return typeof saved.series === 'string' ? { ...saved, url: chapterUrl } : null;
    } catch {
      return null;
    }
  }

  private changed(): void {
    for (const listener of this.listeners) listener();
  }
}
