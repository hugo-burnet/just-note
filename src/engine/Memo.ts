/**
 * Remembers the answer of an asynchronous call for a few minutes, so that going
 * back and forth (series, chapter, series) does not hit the site again.
 * Failures are not remembered.
 */
export class Memo<T> {
  private readonly entries = new Map<string, { readonly at: number; readonly value: Promise<T> }>();
  private readonly ttlMs: number;
  private readonly now: () => number;

  constructor(ttlMs: number, now: () => number = Date.now) {
    this.ttlMs = ttlMs;
    this.now = now;
  }

  get(key: string, load: () => Promise<T>): Promise<T> {
    const hit = this.entries.get(key);
    if (hit && this.now() - hit.at < this.ttlMs) return hit.value;
    // new Promise turns a synchronous throw inside load() into a rejection.
    const value = new Promise<T>((resolve) => resolve(load()));
    this.entries.set(key, { at: this.now(), value });
    value.catch(() => this.entries.delete(key));
    return value;
  }

  forget(key: string): void {
    this.entries.delete(key);
  }
}
