import type { KeyValueStore } from '../../engine/index.ts';

/** Reads shared storage afresh; only writes that could not be persisted stay in memory. */
export class LocalStorageStore implements KeyValueStore {
  private readonly pending = new Map<string, string | null>();

  get(key: string): string | null {
    if (this.pending.has(key)) return this.pending.get(key) ?? null;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): boolean {
    try {
      localStorage.setItem(key, value);
      this.pending.delete(key);
      return true;
    } catch {
      this.pending.set(key, value);
      return false;
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
      this.pending.delete(key);
    } catch {
      this.pending.set(key, null);
    }
  }

  keys(): string[] {
    const keys = new Set<string>();
    try {
      for (let index = 0; index < localStorage.length; index++) {
        const key = localStorage.key(index);
        if (key !== null) keys.add(key);
      }
    } catch {
      // Only the session's writes are available when storage is blocked.
    }
    for (const [key, value] of this.pending) {
      if (value === null) keys.delete(key);
      else keys.add(key);
    }
    return [...keys];
  }

  subscribe(listener: (key: string | null) => void): () => void {
    const changed = (event: StorageEvent): void => {
      if (event.storageArea === localStorage) listener(event.key);
    };
    window.addEventListener('storage', changed);
    return () => window.removeEventListener('storage', changed);
  }
}
