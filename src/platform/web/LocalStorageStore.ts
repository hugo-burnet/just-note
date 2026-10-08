import type { KeyValueStore } from '../../engine/index.ts';

/**
 * localStorage, with a memory copy in front: when the storage is blocked or
 * full (private windows, quota) the app keeps working for the session.
 */
export class LocalStorageStore implements KeyValueStore {
  private readonly memory = new Map<string, string>();

  get(key: string): string | null {
    const cached = this.memory.get(key);
    if (cached !== undefined) return cached;
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    this.memory.set(key, value);
    try {
      localStorage.setItem(key, value);
    } catch {
      // Kept in memory only.
    }
  }

  remove(key: string): void {
    this.memory.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing more to do.
    }
  }
}
