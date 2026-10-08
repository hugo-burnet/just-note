/**
 * Keeps a cache from growing without end, so the phone's storage is not eaten:
 * past the limit the oldest entries go first (Cache.keys() lists them in the
 * order they were added).
 */
export class CacheBudget {
  private readonly limit: number;

  constructor(limit: number) {
    this.limit = limit;
  }

  async trim(cache: Cache): Promise<void> {
    const keys = await cache.keys();
    for (const key of keys.slice(0, Math.max(0, keys.length - this.limit))) await cache.delete(key);
  }
}
