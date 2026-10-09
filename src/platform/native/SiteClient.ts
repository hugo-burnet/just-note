import { HostPolicy } from '../../../proxy/HostPolicy.ts';
import type { Target } from '../../../proxy/HostPolicy.ts';
import { ProxyError } from '../../../proxy/ProxyError.ts';
import { USER_AGENT } from '../../../proxy/UpstreamClient.ts';
import { TransportError } from '../../engine/index.ts';
import type { NativeHttp, NativeResponse } from './NativeHttp.ts';

export type Kind = 'text' | 'image';

export interface Fetched {
  readonly response: NativeResponse;
  /** Where the request ended up, after redirects. */
  readonly url: URL;
}

const ACCEPT: Readonly<Record<Kind, string>> = {
  text: 'text/html,application/xhtml+xml,text/javascript,*/*;q=0.8',
  image: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
};
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 30_000;

/**
 * Reaches the sites the way the proxy does, but from the phone itself: only the hosts of
 * the listed sites (every redirect checked too), with the Referer their image servers
 * expect. It fails with the same codes as the proxy, so the screens say the same things.
 */
export class SiteClient {
  private readonly http: NativeHttp;
  private readonly policy: HostPolicy;

  constructor(http: NativeHttp, policy: HostPolicy = new HostPolicy()) {
    this.http = http;
    this.policy = policy;
  }

  /** The address as it will be asked for; fails when no listed site owns it. */
  resolve(address: string): URL {
    return this.parse(address).url;
  }

  async get(address: string, kind: Kind, referer?: string): Promise<Fetched> {
    let { url, site } = this.parse(address);
    const wanted = referer ? this.allowed(referer) : undefined;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const response = await this.request(url, kind, wanted ?? site.referer);
      const location = response.headers['location'];
      if (response.status < 300 || response.status >= 400 || !location) return this.answered(response, url);
      ({ url, site } = this.parse(this.followed(location, url)));
    }
    throw new TransportError('too_many_redirects', 'The source redirected too many times.', { host: url.hostname });
  }

  private answered(response: NativeResponse, url: URL): Fetched {
    if (response.status < 200 || response.status >= 300) {
      throw new TransportError('upstream_status', `The source answered ${response.status}.`, { upstreamStatus: response.status, host: url.hostname });
    }
    return { response, url };
  }

  private async request(url: URL, kind: Kind, referer: string): Promise<NativeResponse> {
    try {
      return await this.http.get({
        url: url.href,
        headers: { 'User-Agent': USER_AGENT, Accept: ACCEPT[kind], 'Accept-Language': 'en-US,en;q=0.9', Referer: referer },
        as: kind === 'text' ? 'text' : 'bytes',
        timeoutMs: TIMEOUT_MS,
      });
    } catch (error) {
      throw this.unreachable(error, url);
    }
  }

  private parse(address: string): Target {
    try {
      return this.policy.parse(address);
    } catch (error) {
      if (!(error instanceof ProxyError)) throw error;
      const host = error.extra['host'];
      throw new TransportError(error.code, error.message, { host: typeof host === 'string' ? host : undefined });
    }
  }

  // A Referer the caller asks for must itself be an allowed host.
  private allowed(referer: string): string | undefined {
    try {
      return this.policy.parse(referer).url.href;
    } catch {
      return undefined;
    }
  }

  private followed(location: string, from: URL): string {
    try {
      return new URL(location, from).href;
    } catch {
      throw new TransportError('upstream_unreachable', 'The source sent an invalid redirect.', { host: from.hostname });
    }
  }

  // What the phone's network stack says is a message, and for a timeout also the name of the Java exception.
  private unreachable(error: unknown, url: URL): TransportError {
    const { code, message } = error as { code?: unknown; message?: unknown };
    const host = url.hostname;
    if (/timeout|timed out|after \d+ms/i.test(`${String(code ?? '')} ${String(message ?? '')}`)) {
      return new TransportError('timeout', 'The source did not answer in time.', { host });
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return new TransportError('offline', 'No network.', { host });
    return new TransportError('upstream_unreachable', 'Could not reach the source.', { host });
  }
}
