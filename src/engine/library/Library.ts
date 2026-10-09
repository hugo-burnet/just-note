import type { SeriesSummary } from '../model.ts';
import type { KeyValueStore } from '../ports.ts';
import { LibraryStore } from './LibraryStore.ts';
import { parseLibraryBackup } from './LibraryBackup.ts';

export interface ReadingPosition {
  readonly chapter: string;
  readonly key: string;
  readonly title: string;
  readonly page: number;
}

export interface LibraryEntry extends SeriesSummary {
  readonly addedAt: number;
  readonly updatedAt: number;
  readonly chapterCount?: number;
  /** The genres its site gives it, as the site writes them; unknown until its page was read since they were kept. */
  readonly genres?: readonly string[];
  /** How many chapters the series had when it was last opened: those past it are new. */
  readonly seenCount?: number;
  /** When the series was last read from its site (opened, or checked for new chapters). */
  readonly checkedAt?: number;
  readonly position?: ReadingPosition;
}

interface StoredEntry extends Omit<LibraryEntry, 'position'> {
  readonly generation: string;
  readonly removed?: true;
}

interface StoredPosition {
  readonly generation: string;
  readonly position: ReadingPosition;
  readonly updatedAt: number;
}

const ENTRY = 'jr:entry:';
const POSITION = 'jr:position:';
const READ = 'jr:finished:';
const readPrefix = (url: string): string => `${READ}${encodeURIComponent(url)}:`;
const ownedKey = (key: string): boolean => [ENTRY, POSITION, READ].some((prefix) => key.startsWith(prefix));

/** Each series, position and finished chapter has its own key; reads use current storage. */
export class Library {
  private readonly storage: LibraryStore;
  private readonly store: KeyValueStore;
  private readonly now: () => number;

  constructor(store: KeyValueStore, now: () => number = Date.now) {
    this.store = store;
    this.storage = new LibraryStore(store);
    this.now = now;
    this.migrate();
  }

  list(): LibraryEntry[] {
    return this.storage.keys().filter((key) => key.startsWith(ENTRY))
      .map((key) => this.get(key.slice(ENTRY.length)))
      .filter((entry): entry is LibraryEntry => entry !== null)
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  get(url: string): LibraryEntry | null {
    const entry = this.entry(url);
    if (!entry) return null;
    const { generation, removed: _removed, ...summary } = entry;
    const saved = this.savedPosition(url, generation);
    return { ...summary, updatedAt: Math.max(entry.updatedAt, saved?.updatedAt ?? 0), ...(saved ? { position: saved.position } : {}) };
  }

  /**
   * Refreshes details without writing over the independently stored position. A series met for the first
   * time has nothing new; one known before keeps what had been seen of it, so that what came since shows.
   */
  save(series: SeriesSummary & { readonly chapters?: readonly unknown[]; readonly genres?: readonly string[] }): void {
    const old = this.entry(series.url);
    const previous = this.storage.read<StoredEntry>(ENTRY + series.url);
    const now = this.now();
    const chapterCount = series.chapters?.length ?? old?.chapterCount;
    const seenCount = old ? (old.seenCount ?? old.chapterCount) : chapterCount;
    const genres = series.genres ?? old?.genres;
    this.storage.write(ENTRY + series.url, {
      url: series.url, title: series.title, cover: series.cover,
      chapterCount,
      ...(genres === undefined ? {} : { genres: [...genres] }),
      ...(seenCount === undefined ? {} : { seenCount }),
      ...(series.chapters ? { checkedAt: now } : old?.checkedAt === undefined ? {} : { checkedAt: old.checkedAt }),
      addedAt: old?.addedAt ?? now, updatedAt: old?.updatedAt ?? now,
      generation: old?.generation ?? previous?.generation ?? 'initial',
    } satisfies StoredEntry);
  }

  /** How many chapters came out since the series was last opened. */
  newChapters(url: string): number {
    const entry = this.entry(url);
    if (!entry?.chapterCount) return 0;
    return Math.max(0, entry.chapterCount - (entry.seenCount ?? entry.chapterCount));
  }

  /** The series was opened: what it has now is no longer new. */
  markSeen(url: string): void {
    const entry = this.entry(url);
    if (entry && entry.chapterCount !== undefined && entry.seenCount !== entry.chapterCount) {
      this.storage.write(ENTRY + url, { ...entry, seenCount: entry.chapterCount } satisfies StoredEntry);
    }
  }

  remove(url: string): void {
    // A tombstone also keeps concurrent first saves on the same generation after re-adding.
    this.storage.write(ENTRY + url, { url, generation: `${this.now()}-${Math.random().toString(36).slice(2)}`, removed: true });
    this.storage.remove(POSITION + url);
    for (const key of this.storage.keys()) if (key.startsWith(readPrefix(url))) this.storage.remove(key);
  }

  clear(): void {
    for (const key of this.storage.keys()) {
      if (key.startsWith(ENTRY)) this.remove(key.slice(ENTRY.length));
      else if (ownedKey(key)) this.storage.remove(key);
    }
    this.storage.remove('jr:library');
    this.storage.remove('jr:read');
  }

  position(url: string): ReadingPosition | null {
    const entry = this.entry(url);
    return entry ? this.savedPosition(url, entry.generation)?.position ?? null : null;
  }

  /** A stale reader cannot bring back a series another tab removed. */
  setPosition(url: string, position: ReadingPosition): void {
    const entry = this.entry(url);
    if (entry) this.storage.write(POSITION + url, { generation: entry.generation, position, updatedAt: this.now() } satisfies StoredPosition);
  }

  isRead(url: string, key: string): boolean {
    const entry = this.entry(url);
    return !!entry && this.storage.read<string>(readPrefix(url) + encodeURIComponent(key)) === entry.generation;
  }

  markRead(url: string, key: string): void {
    const entry = this.entry(url);
    if (entry && !this.isRead(url, key)) this.storage.write(readPrefix(url) + encodeURIComponent(key), entry.generation);
  }

  readCount(url: string): number {
    const entry = this.entry(url);
    if (!entry) return 0;
    return this.storage.keys().filter((key) => key.startsWith(readPrefix(url)) && this.storage.read<string>(key) === entry.generation).length;
  }

  exportBackup(): string {
    const entries = this.list().map((entry) => {
      const prefix = readPrefix(entry.url);
      const finished = this.storage.keys().filter((key) => key.startsWith(prefix) && this.isRead(entry.url, decodeURIComponent(key.slice(prefix.length))))
        .map((key) => decodeURIComponent(key.slice(prefix.length)));
      return { ...entry, finished };
    });
    return JSON.stringify({ format: 'just-read-library', version: 1, exportedAt: this.now(), entries }, null, 2);
  }

  /** Merges finished chapters and keeps the newer details and position. Re-importing is harmless. */
  importBackup(raw: string): { count: number; persisted: boolean } {
    const backup = parseLibraryBackup(raw);
    let persisted = true;
    for (const imported of backup.entries) {
      const existing = this.get(imported.url);
      const previous = this.storage.read<StoredEntry>(ENTRY + imported.url);
      const generation = this.entry(imported.url)?.generation ?? previous?.generation ?? 'initial';
      const { finished, position, ...summary } = imported;
      if (!existing || imported.updatedAt > existing.updatedAt) {
        persisted = this.storage.write(ENTRY + imported.url, { ...summary, addedAt: Math.min(existing?.addedAt ?? imported.addedAt, imported.addedAt), generation }) && persisted;
      }
      if (position && (!existing?.position || imported.updatedAt > existing.updatedAt)) {
        persisted = this.storage.write(POSITION + imported.url, { generation, position, updatedAt: imported.updatedAt } satisfies StoredPosition) && persisted;
      }
      for (const key of finished) persisted = this.storage.write(readPrefix(imported.url) + encodeURIComponent(key), generation) && persisted;
    }
    return { count: backup.entries.length, persisted };
  }

  subscribe(listener: () => void): () => void {
    return this.store.subscribe?.((key) => {
      if (key === null || ownedKey(key)) listener();
    }) ?? (() => {});
  }

  private entry(url: string): StoredEntry | null {
    const entry = this.storage.read<StoredEntry>(ENTRY + url);
    return entry && !entry.removed && typeof entry.url === 'string' && typeof entry.generation === 'string' ? entry : null;
  }

  private savedPosition(url: string, generation: string): StoredPosition | null {
    const saved = this.storage.read<StoredPosition>(POSITION + url);
    return saved?.generation === generation ? saved : null;
  }

  /** Migrates old data while retaining a recovery copy; existing new records always win. */
  private migrate(): void {
    if (this.storage.read('jr:library-migrated') === true) return;
    let complete = true;
    const entries = this.storage.read<Record<string, LibraryEntry>>('jr:library');
    const finished = this.storage.read<Record<string, string[]>>('jr:read');
    if (entries && typeof entries === 'object' && !Array.isArray(entries)) {
      for (const [url, legacy] of Object.entries(entries)) {
        if (!legacy || typeof legacy.title !== 'string') continue;
        const { position, ...summary } = legacy;
        if (this.storage.read<StoredEntry>(ENTRY + url)?.removed) continue;
        const entry = this.entry(url) ?? { ...summary, url, generation: 'legacy' };
        if (!this.entry(url)) complete = this.storage.write(ENTRY + url, entry) && complete;
        if (position && !this.storage.read(POSITION + url)) {
          complete = this.storage.write(POSITION + url, { generation: entry.generation, position, updatedAt: legacy.updatedAt } satisfies StoredPosition) && complete;
        }
        const keys = finished?.[url];
        if (Array.isArray(keys)) for (const key of keys) {
          if (typeof key === 'string') complete = this.storage.write(readPrefix(url) + encodeURIComponent(key), entry.generation) && complete;
        }
      }
    }
    // Keep the old data as a recovery copy. A failed migration must be retried after restart.
    if (complete) this.storage.write('jr:library-migrated', true);
  }
}
