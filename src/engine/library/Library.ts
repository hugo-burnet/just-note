import type { SeriesSummary } from '../model.ts';
import type { KeyValueStore } from '../ports.ts';

export interface ReadingPosition {
  /** Address of the chapter being read. */
  readonly chapter: string;
  readonly key: string;
  readonly title: string;
  readonly page: number;
}

export interface LibraryEntry extends SeriesSummary {
  readonly addedAt: number;
  readonly updatedAt: number;
  readonly position?: ReadingPosition;
}

const LIBRARY_KEY = 'jr:library';
const FINISHED_KEY = 'jr:read';

/**
 * The series the user opened, where they stopped, and the chapters they
 * finished. Chapters are kept as short keys ("c012"), not as addresses, so that
 * a long series stays small.
 */
export class Library {
  private readonly store: KeyValueStore;
  private readonly now: () => number;
  private entries: Record<string, LibraryEntry>;
  private finished: Record<string, string[]>;

  constructor(store: KeyValueStore, now: () => number = Date.now) {
    this.store = store;
    this.now = now;
    this.entries = this.load<LibraryEntry>(LIBRARY_KEY);
    this.finished = this.load<string[]>(FINISHED_KEY);
  }

  /** Most recently read first. */
  list(): LibraryEntry[] {
    return Object.values(this.entries).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(url: string): LibraryEntry | null {
    return this.entries[url] ?? null;
  }

  /** Adds the series, or refreshes what is known of it. Never touches the position. */
  save(series: SeriesSummary): void {
    const old = this.entries[series.url];
    const now = this.now();
    this.entries[series.url] = {
      ...old,
      url: series.url,
      title: series.title,
      cover: series.cover,
      addedAt: old?.addedAt ?? now,
      updatedAt: old?.updatedAt ?? now,
    };
    this.persist();
  }

  remove(url: string): void {
    delete this.entries[url];
    delete this.finished[url];
    this.persist();
  }

  clear(): void {
    this.entries = {};
    this.finished = {};
    this.persist();
  }

  position(url: string): ReadingPosition | null {
    return this.entries[url]?.position ?? null;
  }

  /** Ignored when the series is not in the library. */
  setPosition(url: string, position: ReadingPosition): void {
    const entry = this.entries[url];
    if (!entry) return;
    this.entries[url] = { ...entry, position, updatedAt: this.now() };
    this.persist();
  }

  isRead(url: string, key: string): boolean {
    return this.finished[url]?.includes(key) ?? false;
  }

  markRead(url: string, key: string): void {
    const keys = (this.finished[url] ??= []);
    if (keys.includes(key)) return;
    keys.push(key);
    this.persist();
  }

  readCount(url: string): number {
    return this.finished[url]?.length ?? 0;
  }

  private load<T>(key: string): Record<string, T> {
    try {
      const value: unknown = JSON.parse(this.store.get(key) ?? 'null');
      return value && typeof value === 'object' ? (value as Record<string, T>) : {};
    } catch {
      return {};
    }
  }

  private persist(): void {
    try {
      this.store.set(LIBRARY_KEY, JSON.stringify(this.entries));
      this.store.set(FINISHED_KEY, JSON.stringify(this.finished));
    } catch {
      // Storage blocked or full: this session keeps working from memory.
    }
  }
}
