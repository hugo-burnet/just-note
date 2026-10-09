import type { KeyValueStore } from '../ports.ts';

/** Storage failures cost persistence, not this session's library or progress. */
export class LibraryStore {
  private readonly store: KeyValueStore;
  private readonly pending = new Map<string, string | null>();

  constructor(store: KeyValueStore) {
    this.store = store;
  }

  read<T>(key: string): T | null {
    try {
      const text = this.pending.has(key) ? this.pending.get(key) : this.store.get(key);
      return JSON.parse(text ?? 'null') as T | null;
    } catch {
      return null;
    }
  }

  write(key: string, value: unknown): boolean {
    const text = JSON.stringify(value);
    try {
      if (this.store.set(key, text) === false) {
        this.pending.set(key, text);
        return false;
      }
      this.pending.delete(key);
      return true;
    } catch {
      this.pending.set(key, text);
      return false;
    }
  }

  remove(key: string): void {
    try {
      this.store.remove(key);
      this.pending.delete(key);
    } catch {
      this.pending.set(key, null);
    }
  }

  keys(): string[] {
    let persisted: string[] = [];
    try {
      persisted = this.store.keys();
    } catch {
      // The session's writes remain available.
    }
    const keys = new Set(persisted);
    for (const [key, value] of this.pending) {
      if (value === null) keys.delete(key);
      else keys.add(key);
    }
    return [...keys];
  }
}
