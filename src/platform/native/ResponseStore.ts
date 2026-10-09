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
  private readonly limit: number;

  constructor(name: string, limit: number) {
    this.name = name;
    this.limit = limit;
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
      const cache = await caches.open(this.name);
      await cache.put(key, response);
      const keys = await cache.keys();
      for (const oldest of keys.slice(0, Math.max(0, keys.length - this.limit))) await cache.delete(oldest);
    } catch {
      // No offline copy of this one.
    }
  }
}
