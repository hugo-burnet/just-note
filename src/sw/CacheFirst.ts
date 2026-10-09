import type { CacheBudget } from './CacheBudget.ts';
import { ResponseCache } from './ResponseCache.ts';
import type { Strategy } from './Strategy.ts';

/** What never changes (a file whose name carries its hash): the copy we have, else the network. */
export class CacheFirst implements Strategy {
  private readonly cache: ResponseCache;

  constructor(cacheName: string, budget: CacheBudget | null = null) {
    this.cache = new ResponseCache(cacheName, budget ?? undefined);
  }

  async handle(request: Request): Promise<Response> {
    const hit = await this.cache.match(request);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok) await this.cache.put(request, response);
    return response;
  }
}
