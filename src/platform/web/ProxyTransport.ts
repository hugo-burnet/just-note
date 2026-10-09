import { TransportError } from '../../engine/index.ts';
import type { FetchedText, TextRequest, Transport } from '../../engine/index.ts';
import { IMAGE_CACHE } from './cacheNames.ts';
import { CacheShelf } from './CacheShelf.ts';

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

interface ProxyFailure {
  error?: string;
  message?: string;
  upstreamStatus?: number;
  host?: string;
}

/**
 * The browser's way to reach the sites: through the proxy of this repository
 * (see proxy/), because a browser may not read another site's pages and image
 * CDNs want the site's Referer. The proxy address is read each time, so a change
 * in the settings applies at once.
 */
export class ProxyTransport implements Transport {
  private readonly proxyBase: () => string;
  private readonly fetcher: Fetcher;
  /** Downloaded chapters; the service worker serves their pictures from there (see ProxiedImages). */
  readonly shelf = new CacheShelf((address) => this.pictureToKeep(address));

  constructor(proxyBase: () => string, fetcher: Fetcher = (input, init) => fetch(input, init)) {
    this.proxyBase = proxyBase;
    this.fetcher = fetcher;
  }

  async text(url: string, request: TextRequest = {}): Promise<FetchedText> {
    const query = new URLSearchParams({ u: url });
    if (request.referer) query.set('ref', request.referer);
    // The service worker keeps answers for offline use; a one-off answer is not worth it.
    if (request.cache === false) query.set('nocache', '1');

    let res: Response;
    try {
      res = await this.fetcher(`${this.base()}/api/html?${query}`);
    } catch {
      throw new TransportError(navigator.onLine === false ? 'offline' : 'network', 'Could not reach the proxy.', { proxy: this.where() });
    }
    if (!res.ok) throw await this.failure(res);
    return { text: await res.text(), url: res.headers.get('x-final-url') ?? url };
  }

  async imageSource(url: string): Promise<string> {
    return `${this.base()}/api/img?u=${encodeURIComponent(url)}`;
  }

  /**
   * The bytes of a picture to download: the copy the service worker kept when it was read, else the proxy's.
   * `saved=1` has the worker leave the request alone, so that it does not keep a second copy among what is read.
   */
  private async pictureToKeep(address: string): Promise<Response> {
    const proxied = await this.imageSource(address);
    const read = await caches
      .open(IMAGE_CACHE)
      .then((cache) => cache.match(proxied))
      .catch(() => undefined);
    if (read) return read;
    let res: Response;
    try {
      res = await this.fetcher(`${proxied}&saved=1`, { mode: 'cors', credentials: 'omit' });
    } catch {
      throw new TransportError(navigator.onLine === false ? 'offline' : 'network', 'Could not reach the proxy.', { proxy: this.where() });
    }
    if (!res.ok) throw await this.failure(res);
    return res;
  }

  async isHealthy(): Promise<boolean> {
    try {
      const res = await this.fetcher(`${this.base()}/api/health`, { cache: 'no-store' });
      return res.ok && ((await res.json()) as { ok?: boolean }).ok === true;
    } catch {
      return false;
    }
  }

  private base(): string {
    return this.proxyBase().trim().replace(/\/+$/, '');
  }

  /** For messages: the address asked, which is the app's own when the setting is empty. */
  private where(): string {
    return this.base() || (typeof location === 'undefined' ? '' : location.origin);
  }

  private async failure(res: Response): Promise<TransportError> {
    let body: ProxyFailure = {};
    try {
      body = (await res.json()) as ProxyFailure;
    } catch {
      // Not our proxy: a static host answering 404 for /api/html, for instance.
    }
    const code = body.error ?? (res.status === 404 ? 'no_proxy' : 'proxy');
    return new TransportError(code, body.message ?? `HTTP ${res.status}`, {
      status: res.status,
      upstreamStatus: body.upstreamStatus,
      host: body.host,
      proxy: this.where(),
    });
  }
}
