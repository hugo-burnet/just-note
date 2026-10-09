import { Limiter } from '../Limiter.ts';
import type { Series } from '../model.ts';
import type { Library } from './Library.ts';

/** A series is read again from its site at most this often to see whether chapters came out. */
export const CHECK_EVERY_MS = 30 * 60_000;
// Two sites at a time at most: a library of fifty series is not fifty requests at once.
const CHECKS_AT_ONCE = 2;

/**
 * Looks for new chapters of the series in the library: each one not read from its site for a while is
 * read again, a few at a time, and what it has now is saved (Library.newChapters says what is new).
 * `readSeries` reads a series without bothering anyone: no anti-bot check is shown for it (see App).
 * A series that cannot be read (offline, a site down, a check) is simply tried again next time.
 */
export class UpdateChecker {
  private readonly library: Library;
  private readonly readSeries: (url: string) => Promise<Series>;
  private readonly now: () => number;
  private readonly limiter = new Limiter(CHECKS_AT_ONCE);
  private running: Promise<number> | null = null;

  constructor(library: Library, readSeries: (url: string) => Promise<Series>, now: () => number = Date.now) {
    this.library = library;
    this.readSeries = readSeries;
    this.now = now;
  }

  /**
   * Checks what is due, and calls `changed` for each series that has new chapters since its last check.
   * One run at a time: asked again meanwhile, it is the same run. Answers how many series were read.
   */
  run(changed: (url: string) => void = () => {}): Promise<number> {
    this.running ??= this.check(changed).finally(() => {
      this.running = null;
    });
    return this.running;
  }

  private async check(changed: (url: string) => void): Promise<number> {
    const due = this.library.list().filter((entry) => entry.checkedAt === undefined || this.now() - entry.checkedAt >= CHECK_EVERY_MS);
    const read = await Promise.all(
      due.map((entry) =>
        this.limiter.run(async () => {
          try {
            const series = await this.readSeries(entry.url);
            // Removed while it was being read: it does not come back.
            if (!this.library.get(entry.url)) return false;
            const before = this.library.newChapters(entry.url);
            this.library.save(series);
            if (this.library.newChapters(entry.url) > before) changed(entry.url);
            return true;
          } catch {
            return false;
          }
        }),
      ),
    );
    return read.filter(Boolean).length;
  }
}
