import type { KeyValueStore } from '../ports.ts';

const KEY = 'jr:covers';
const MAX_COVERS = 400;

/**
 * The better covers that were found for series (see Catalog.cover), kept so that they are not looked for
 * again at every start: a few hundred, the oldest forgotten first.
 */
export class CoverShelf {
  private readonly store: KeyValueStore;
  private covers: Record<string, string>;

  constructor(store: KeyValueStore) {
    this.store = store;
    this.covers = this.load();
  }

  get(url: string): string | undefined {
    return this.covers[url];
  }

  set(url: string, cover: string): void {
    // Deleted first so that it goes to the end: the order of the keys is the order they were last set.
    delete this.covers[url];
    this.covers[url] = cover;
    for (const old of Object.keys(this.covers).slice(0, Math.max(0, Object.keys(this.covers).length - MAX_COVERS))) delete this.covers[old];
    try {
      this.store.set(KEY, JSON.stringify(this.covers));
    } catch {
      // Storage blocked or full: this session keeps working from memory.
    }
  }

  private load(): Record<string, string> {
    try {
      const value: unknown = JSON.parse(this.store.get(KEY) ?? 'null');
      return value && typeof value === 'object' ? (value as Record<string, string>) : {};
    } catch {
      return {};
    }
  }
}
