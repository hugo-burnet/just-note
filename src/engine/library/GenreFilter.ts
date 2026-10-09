import type { KeyValueStore } from '../ports.ts';
import type { LibraryEntry } from './Library.ts';

/** What a genre does to the shelf: nothing, kept (a series must have it), or left out (a series must not). */
export type GenreChoice = 'none' | 'include' | 'exclude';

/** A genre of the shelf, under the name most of its series give it, with how many series have it. */
export interface ShelfGenre {
  readonly key: string;
  readonly name: string;
  readonly count: number;
  readonly choice: GenreChoice;
}

interface Stored {
  readonly include: readonly string[];
  readonly exclude: readonly string[];
}

const KEY = 'jr:genre-filter';

/**
 * Two sites rarely write a genre alike ("Sci-fi", "Sci Fi", "science-fiction"...): case, accents, spaces and
 * dashes are not what tells one genre from another.
 */
export const genreKey = (genre: string): string =>
  genre
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * The shelf filtered by genre: a series is shown when it has every genre kept and none of those left out.
 * The choice is remembered from one start of the app to the next. A series whose genres are not known yet
 * (its page not read since they were kept) passes a filter that only leaves genres out.
 */
export class GenreFilter {
  private readonly store: KeyValueStore;

  constructor(store: KeyValueStore) {
    this.store = store;
  }

  get active(): boolean {
    const { include, exclude } = this.read();
    return include.length > 0 || exclude.length > 0;
  }

  choice(genre: string): GenreChoice {
    const key = genreKey(genre);
    const { include, exclude } = this.read();
    return include.includes(key) ? 'include' : exclude.includes(key) ? 'exclude' : 'none';
  }

  /** One tap on a genre: kept, then left out, then nothing again. */
  cycle(genre: string): GenreChoice {
    const next: GenreChoice = { none: 'include', include: 'exclude', exclude: 'none' }[this.choice(genre)] as GenreChoice;
    this.set(genre, next);
    return next;
  }

  set(genre: string, choice: GenreChoice): void {
    const key = genreKey(genre);
    const { include, exclude } = this.read();
    this.write({
      include: [...include.filter((one) => one !== key), ...(choice === 'include' ? [key] : [])],
      exclude: [...exclude.filter((one) => one !== key), ...(choice === 'exclude' ? [key] : [])],
    });
  }

  clear(): void {
    this.store.remove(KEY);
  }

  matches(entry: LibraryEntry): boolean {
    const { include, exclude } = this.read();
    const has = new Set((entry.genres ?? []).map(genreKey));
    if (exclude.some((key) => has.has(key))) return false;
    if (include.length > 0 && entry.genres === undefined) return false;
    return include.every((key) => has.has(key));
  }

  /**
   * The genres of the shelf, the commonest first (then by name), each under the spelling most of its series
   * use. A genre chosen earlier is listed even when no series has it any more, so that it can be let go.
   */
  genres(entries: readonly LibraryEntry[]): ShelfGenre[] {
    const found = new Map<string, { spellings: Map<string, number>; count: number }>();
    for (const entry of entries) {
      for (const key of new Set((entry.genres ?? []).map(genreKey))) {
        const genre = found.get(key) ?? { spellings: new Map<string, number>(), count: 0 };
        genre.count++;
        found.set(key, genre);
      }
      for (const name of entry.genres ?? []) {
        const spellings = found.get(genreKey(name))?.spellings;
        spellings?.set(name.trim(), (spellings.get(name.trim()) ?? 0) + 1);
      }
    }
    const { include, exclude } = this.read();
    for (const key of [...include, ...exclude]) if (!found.has(key)) found.set(key, { spellings: new Map([[key, 1]]), count: 0 });
    return [...found]
      .filter(([key]) => key !== '')
      .map(([key, { spellings, count }]) => {
        // On a tie, the spelling with a capital, as a name of a genre is usually written.
        const capital = (name: string): number => Number(name.charAt(0) !== name.charAt(0).toLowerCase());
        const name = [...spellings].sort((a, b) => b[1] - a[1] || capital(b[0]) - capital(a[0]) || a[0].localeCompare(b[0]))[0]?.[0] ?? key;
        return { key, name, count, choice: include.includes(key) ? 'include' : exclude.includes(key) ? 'exclude' : 'none' } as const;
      })
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  private read(): Stored {
    try {
      const stored = JSON.parse(this.store.get(KEY) ?? '{}') as Partial<Stored>;
      const keys = (value: unknown): string[] => (Array.isArray(value) ? value.filter((one): one is string => typeof one === 'string') : []);
      return { include: keys(stored.include), exclude: keys(stored.exclude) };
    } catch {
      return { include: [], exclude: [] };
    }
  }

  private write(value: Stored): void {
    if (value.include.length === 0 && value.exclude.length === 0) this.store.remove(KEY);
    else this.store.set(KEY, JSON.stringify(value));
  }
}
