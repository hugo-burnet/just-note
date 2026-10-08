import type { CacheBudget } from './CacheBudget.ts';
import { MATCH } from './Strategy.ts';
import type { Strategy } from './Strategy.ts';

/**
 * Pages already read stay readable offline: images are kept the first time they
 * are shown. An <img> asks without CORS, which would give an opaque answer: the
 * browser cannot tell how big it is and charges several megabytes of quota for
 * each. So the worker asks again with CORS, which the proxy allows for the
 * origin of the app, and keeps a plain answer. A proxy that does not allow it
 * (still being set up) loses nothing but the offline copy.
 */
export class ProxiedImages implements Strategy {
  private readonly cacheName: string;
  private readonly budget: CacheBudget;

  constructor(cacheName: string, budget: CacheBudget) {
    this.cacheName = cacheName;
    this.budget = budget;
  }

  async handle(request: Request): Promise<Response> {
    const cache = await caches.open(this.cacheName);
    const hit = await cache.match(request.url, MATCH);
    if (hit) return hit;
    let response: Response;
    try {
      response = await fetch(request.url, { mode: 'cors', credentials: 'omit' });
    } catch {
      return fetch(request);
    }
    if (response.ok) void cache.put(request.url, response.clone()).then(() => this.budget.trim(cache));
    return response;
  }
}
