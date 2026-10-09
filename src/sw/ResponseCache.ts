import type { CacheBudget } from './CacheBudget.ts';
import { withCacheLock } from '../platform/web/CacheBudget.ts';
import { MATCH } from './Strategy.ts';

/** An offline copy is optional: blocked storage and quota must not break online reads. */
export class ResponseCache {
  private readonly name: string;
  private readonly budget: CacheBudget | undefined;

  constructor(name: string, budget?: CacheBudget) {
    this.name = name;
    this.budget = budget;
  }

  async match(key: Request | string): Promise<Response | undefined> {
    try {
      return await (await caches.open(this.name)).match(key, MATCH);
    } catch {
      return undefined;
    }
  }

  async put(key: Request | string, response: Response): Promise<void> {
    try {
      await withCacheLock(this.name, async () => {
        const cache = await caches.open(this.name);
        if (this.budget) await this.budget.put(cache, key, response);
        else await cache.put(key, response.clone());
      });
    } catch {
      // The network response still belongs to the reader.
    }
  }
}
