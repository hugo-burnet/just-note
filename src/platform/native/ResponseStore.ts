import { CacheBudget, withCacheLock } from '../web/CacheBudget.ts';

/** A place where answers are kept by address, so that what was read stays readable offline. */
export interface ResponseStore {
  get(key: string): Promise<Response | undefined>;
  put(key: string, response: Response): Promise<void>;
}

/**
 * The WebView's Cache API, under the names the service worker uses on the web, so that
 * Settings → Data empties both alike. Past the limit the oldest answers go first
 * (Cache.keys() lists them in the order they were added). A cache that cannot be opened
 * or written (storage full, blocked) only costs the offline copy, never the reading.
 */
export class CacheApiStore implements ResponseStore {
  private readonly name: string;
  private readonly budget: CacheBudget;

  constructor(name: string, limit: number, bytes = Infinity) {
    this.name = name;
    this.budget = new CacheBudget(limit, bytes);
  }

  async get(key: string): Promise<Response | undefined> {
    try {
      return await (await caches.open(this.name)).match(key);
    } catch {
      return undefined;
    }
  }

  async put(key: string, response: Response): Promise<void> {
    try {
      await withCacheLock(this.name, async () => {
        await this.budget.put(await caches.open(this.name), key, response);
      });
    } catch {
      // No offline copy of this one.
    }
  }
}
