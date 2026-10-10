import type { KeyValueStore } from '../ports.ts';

const KEY = 'jr:genres';
const MAX_SERIES = 600;

/**
 * The genres found for series that were looked at in a listing (see Catalog.genres), kept so that a page
 * of results filtered by genre does not read every series again at each start: a few hundred, the oldest
 * forgotten first. A page that said no genre at all is not kept: that is as likely a page that was not made
 * out as a series with none, and kept, it would hide the genres of that series for good, even from a reading
 * that has since improved. It is remembered for this start of the app only.
 */
export class GenreShelf {
  private readonly store: KeyValueStore;
  private genres: Record<string, readonly string[]>;
  /** The series whose page said no genre, in this session. */
  private readonly none = new Set<string>();

  constructor(store: KeyValueStore) {
    this.store = store;
    this.genres = this.load();
  }

  get(url: string): readonly string[] | undefined {
    return this.genres[url] ?? (this.none.has(url) ? [] : undefined);
  }

  set(url: string, genres: readonly string[]): void {
    if (genres.length === 0) {
      this.none.add(url);
      // What an earlier answer kept is let go; when nothing was kept, there is nothing to write.
      if (!(url in this.genres)) return;
      delete this.genres[url];
    } else {
      this.none.delete(url);
      // Deleted first so that it goes to the end: the order of the keys is the order they were last set.
      delete this.genres[url];
      this.genres[url] = [...genres];
    }
    for (const old of Object.keys(this.genres).slice(0, Math.max(0, Object.keys(this.genres).length - MAX_SERIES))) delete this.genres[old];
    try {
      this.store.set(KEY, JSON.stringify(this.genres));
    } catch {
      // Storage blocked or full: this session keeps working from memory.
    }
  }

  /** What was kept, without the series that were kept with no genre (an earlier version kept them). */
  private load(): Record<string, readonly string[]> {
    try {
      const value: unknown = JSON.parse(this.store.get(KEY) ?? 'null');
      if (!value || typeof value !== 'object') return {};
      return Object.fromEntries(Object.entries(value).filter(([, genres]) => Array.isArray(genres) && genres.length > 0)) as Record<string, readonly string[]>;
    } catch {
      return {};
    }
  }
}
