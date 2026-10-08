import type { CacheBudget } from './CacheBudget.ts';
import { MATCH } from './Strategy.ts';
import type { Strategy } from './Strategy.ts';

export interface NetworkFirstOptions {
  readonly cacheName: string;
  /** What the answer is kept under, when it is not the request itself (every page of the app is index.html). */
  readonly key?: Request;
  /** Give up on the network after this long and serve the cached copy. */
  readonly timeoutMs?: number;
  readonly budget?: CacheBudget;
  /**
   * Ask the server whether the copy the browser itself keeps is still good, instead of
   * trusting it. GitHub Pages lets a browser keep any file for ten minutes: without this,
   * the app opened right after an update would still be the old one.
   */
  readonly revalidate?: boolean;
  /** A cached copy also stands in for a server that is failing, not only for a missing network. */
  readonly staleOnServerError?: boolean;
}

/** Fresh when online, the last copy when offline. */
export class NetworkFirst implements Strategy {
  private readonly options: NetworkFirstOptions;

  constructor(options: NetworkFirstOptions) {
    this.options = options;
  }

  async handle(request: Request): Promise<Response> {
    const { cacheName, budget, staleOnServerError } = this.options;
    const cache = await caches.open(cacheName);
    const key = this.options.key ?? request;
    try {
      const response = await this.fetch(request);
      if (response.ok) {
        await cache.put(key, response.clone());
        void budget?.trim(cache);
        return response;
      }
      if (staleOnServerError && response.status >= 500) {
        const stale = await cache.match(key, MATCH);
        if (stale) return stale;
      }
      return response;
    } catch (error) {
      const cached = await cache.match(key, MATCH);
      if (cached) return cached;
      throw error;
    }
  }

  private fetch(request: Request): Promise<Response> {
    const { timeoutMs, revalidate } = this.options;
    const init: RequestInit = timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {};
    // The address rather than the request: a navigation cannot be sent again with other options.
    return revalidate ? fetch(request.url, { ...init, cache: 'no-cache' }) : fetch(request, init);
  }
}
