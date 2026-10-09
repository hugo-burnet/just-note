import type { CacheBudget } from './CacheBudget.ts';
import { ResponseCache } from './ResponseCache.ts';
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
  private readonly cache: ResponseCache;
  private readonly saved: ResponseCache | undefined;

  /** `savedCache`: the downloaded chapters, whose pictures are kept under the address of the site (the proxy's `u`). */
  constructor(cacheName: string, budget: CacheBudget, savedCache?: string) {
    this.cache = new ResponseCache(cacheName, budget);
    this.saved = savedCache ? new ResponseCache(savedCache) : undefined;
  }

  async handle(request: Request): Promise<Response> {
    const address = new URL(request.url).searchParams.get('u');
    const saved = address ? await this.saved?.match(address) : undefined;
    if (saved) return saved;
    const hit = await this.cache.match(request.url);
    if (hit) return hit;
    let response: Response;
    try {
      response = await fetch(request.url, { mode: 'cors', credentials: 'omit' });
    } catch {
      return fetch(request);
    }
    if (response.ok) await this.cache.put(request.url, response);
    return response;
  }
}
