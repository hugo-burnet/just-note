import type { CacheBudget } from './CacheBudget.ts';
import { MATCH } from './Strategy.ts';
import type { Strategy } from './Strategy.ts';

/** What never changes (a file whose name carries its hash): the copy we have, else the network. */
export class CacheFirst implements Strategy {
  private readonly cacheName: string;
  private readonly budget: CacheBudget | null;

  constructor(cacheName: string, budget: CacheBudget | null = null) {
    this.cacheName = cacheName;
    this.budget = budget;
  }

  async handle(request: Request): Promise<Response> {
    const cache = await caches.open(this.cacheName);
    const hit = await cache.match(request, MATCH);
    if (hit) return hit;
    const response = await fetch(request);
    if (response.ok) void cache.put(request, response.clone()).then(() => this.budget?.trim(cache));
    return response;
  }
}
