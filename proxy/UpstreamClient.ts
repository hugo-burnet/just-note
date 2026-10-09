import { ProxyError } from './ProxyError.ts';
import type { HostPolicy } from './HostPolicy.ts';

export type FetchFunction = (input: string, init: RequestInit) => Promise<Response>;

export interface Upstream {
  readonly res: Response;
  readonly url: URL;
}

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 30_000;
// Also what the installed app presents itself as, so that a site answers it the way it answers the proxy.
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

// Fetches from the sites on behalf of the app. Every hop, redirects included,
// has to pass the host policy: this is what keeps the proxy from being open.
export class UpstreamClient {
  private readonly policy: HostPolicy;
  private readonly fetchFunction: FetchFunction;

  constructor(policy: HostPolicy, fetchFunction: FetchFunction = (input, init) => fetch(input, init)) {
    this.policy = policy;
    this.fetchFunction = fetchFunction;
  }

  // `params` carries u (what to fetch) and, optionally, ref (the Referer to send).
  async get(params: URLSearchParams, accept: string): Promise<Upstream> {
    let { url, site } = this.policy.parse(params.get('u'));
    const referer = this.requestedReferer(params.get('ref'));
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await this.request(url, accept, referer ?? site.referer);
      const location = res.headers.get('location');
      if (res.status < 300 || res.status >= 400 || !location) return { res, url };
      await res.body?.cancel();
      ({ url, site } = this.policy.parse(this.followed(location, url)));
    }
    throw new ProxyError(508, 'too_many_redirects', 'The source redirected too many times.');
  }

  private async request(url: URL, accept: string, referer: string): Promise<Response> {
    try {
      return await this.fetchFunction(url.href, {
        redirect: 'manual',
        headers: { 'user-agent': USER_AGENT, accept, 'accept-language': 'en-US,en;q=0.9', referer },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch (err) {
      const name = err instanceof Error ? err.name : '';
      if (name === 'TimeoutError' || name === 'AbortError') {
        throw new ProxyError(504, 'timeout', 'The source did not answer in time.');
      }
      throw new ProxyError(502, 'upstream_unreachable', 'Could not reach the source.');
    }
  }

  // A Referer the app asks for must itself be an allowed host.
  private requestedReferer(value: string | null): string | undefined {
    if (!value) return undefined;
    try {
      return this.policy.parse(value).url.href;
    } catch {
      return undefined;
    }
  }

  private followed(location: string, from: URL): string {
    try {
      return new URL(location, from).href;
    } catch {
      throw new ProxyError(502, 'upstream_unreachable', 'The source sent an invalid redirect.');
    }
  }
}
