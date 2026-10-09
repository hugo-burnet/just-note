import type { KeyValueStore } from '../ports.ts';

const KEY = 'jr:genres';
const MAX_SERIES = 600;

/**
 * The genres found for series that were looked at in a listing (see Catalog.genres), kept so that a page
 * of results filtered by genre does not read every series again at each start: a few hundred, the oldest
 * forgotten first.
 */
export class GenreShelf {
  private readonly store: KeyValueStore;
  private genres: Record<string, readonly string[]>;

  constructor(store: KeyValueStore) {
    this.store = store;
    this.genres = this.load();
  }

  get(url: string): readonly string[] | undefined {
    return this.genres[url];
  }

  set(url: string, genres: readonly string[]): void {
    // Deleted first so that it goes to the end: the order of the keys is the order they were last set.
    delete this.genres[url];
    this.genres[url] = [...genres];
    for (const old of Object.keys(this.genres).slice(0, Math.max(0, Object.keys(this.genres).length - MAX_SERIES))) delete this.genres[old];
    try {
      this.store.set(KEY, JSON.stringify(this.genres));
    } catch {
      // Storage blocked or full: this session keeps working from memory.
    }
  }

  private load(): Record<string, readonly string[]> {
    try {
      const value: unknown = JSON.parse(this.store.get(KEY) ?? 'null');
      return value && typeof value === 'object' ? (value as Record<string, readonly string[]>) : {};
    } catch {
      return {};
    }
  }
}
