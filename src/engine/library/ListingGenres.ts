/** How the genres of one series are had: null when they cannot be (its page could not be read, or is not a series' page). */
export type GenreReader = (url: string) => Promise<readonly string[] | null>;

/**
 * The genres of the series of one listing, as they are learned from the pages of the series: which are known, which
 * could not be had, and how far the reading is. Each series is read once; asked to start again, it reads only those
 * whose genres are not known (the ones that could not be had, never the ones being read), so that a try again does
 * not ask the site for what it already gave.
 */
export class ListingGenres {
  private readonly urls: readonly string[];
  private readonly read: GenreReader;
  private readonly changed: () => void;
  private readonly known = new Map<string, readonly string[]>();
  private readonly failed = new Set<string>();
  private readonly pending = new Set<string>();
  private begun = false;

  /** `changed`: something was learned (or a reading began). */
  constructor(urls: readonly string[], read: GenreReader, changed: () => void = () => {}) {
    this.urls = urls;
    this.read = read;
    this.changed = changed;
  }

  /** Whether the reading was asked for. */
  get started(): boolean {
    return this.begun;
  }

  /** Whether some series are still being read. */
  get reading(): boolean {
    return this.pending.size > 0;
  }

  get total(): number {
    return this.urls.length;
  }

  /** How many series have an answer: their genres, or the news that they could not be had. */
  get answered(): number {
    return this.known.size + this.failed.size;
  }

  /** How many series could not be had (and are asked for again by `start`). */
  get unread(): number {
    return this.failed.size;
  }

  /** The genres of a series, none at all being an answer too; undefined while they are not known. */
  of(url: string): readonly string[] | undefined {
    return this.known.get(url);
  }

  /** Reads the genres of every series that has none known, and is not being read. */
  start(): void {
    this.begun = true;
    for (const url of this.urls) {
      if (this.known.has(url) || this.pending.has(url)) continue;
      this.failed.delete(url);
      this.pending.add(url);
      void this.ask(url);
    }
    this.changed();
  }

  private async ask(url: string): Promise<void> {
    let genres: readonly string[] | null = null;
    try {
      genres = await this.read(url);
    } catch {
      // Nothing to learn from it: the series is counted as one that could not be had.
    }
    this.pending.delete(url);
    if (genres) this.known.set(url, genres);
    else this.failed.add(url);
    this.changed();
  }
}
