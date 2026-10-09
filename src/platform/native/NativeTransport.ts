import { HostPolicy } from '../../../proxy/HostPolicy.ts';
import { MAX_HTML_BYTES } from '../../../proxy/limits.ts';
import { TransportError } from '../../engine/index.ts';
import type { FetchedText, TextRequest } from '../../engine/index.ts';
import type { Connection, DialogLabels } from '../Platform.ts';
import { IMAGE_CACHE, MAX_IMAGES, MAX_PAGES, PAGE_CACHE } from '../web/cacheNames.ts';
import { ChallengeGate } from './ChallengeGate.ts';
import { CredentialJar } from './CredentialJar.ts';
import type { NativeHttp } from './NativeHttp.ts';
import { NativeImages } from './NativeImages.ts';
import type { PageFetcher } from './PageFetcher.ts';
import { CacheApiStore } from './ResponseStore.ts';
import type { ResponseStore } from './ResponseStore.ts';
import { SiteClient } from './SiteClient.ts';
import type { Sites } from './SiteClient.ts';

/**
 * The installed app's way to reach the sites: straight from the phone, with no proxy. What
 * was read is kept (pages and pictures), as the service worker does on the web: the last
 * copy of a page stands in for a site that cannot be reached or that refuses the request.
 */
export class NativeTransport implements Connection {
  private readonly client: Sites;
  private readonly pages: ResponseStore;
  private readonly images: NativeImages;

  constructor(client: Sites, pages: ResponseStore, images: NativeImages) {
    this.client = client;
    this.pages = pages;
    this.images = images;
  }

  /** `fetcher`: the WebView that passes the anti-bot check of a site that turns the phone away; `dialog` says what the user is told meanwhile. */
  static over(http: NativeHttp, fetcher?: PageFetcher, dialog?: () => DialogLabels): NativeTransport {
    const jar = new CredentialJar();
    const client = new SiteClient(http, new HostPolicy(), jar);
    const sites = fetcher ? new ChallengeGate(client, jar, fetcher, dialog) : client;
    const images = new NativeImages(sites, new CacheApiStore(IMAGE_CACHE, MAX_IMAGES));
    return new NativeTransport(sites, new CacheApiStore(PAGE_CACHE, MAX_PAGES), images);
  }

  async text(url: string, request: TextRequest = {}): Promise<FetchedText> {
    const key = this.client.resolve(url).href;
    try {
      const { response, url: final } = await this.client.get(url, 'text', request.referer);
      if (response.body.length > MAX_HTML_BYTES) throw new TransportError('too_large', 'The source sent more data than allowed.', { host: final.hostname });
      // A one-off answer (it carries a token) is not worth keeping.
      if (request.cache !== false) void this.pages.put(key, new Response(response.body, { headers: { 'x-final-url': final.href } }));
      return { text: response.body, url: final.href };
    } catch (error) {
      const stale = await this.pages.get(key);
      if (!stale) throw error;
      return { text: await stale.text(), url: stale.headers.get('x-final-url') ?? key };
    }
  }

  imageSource(url: string): Promise<string> {
    return this.images.source(url);
  }

  /** There is no proxy to ask: the app is as healthy as its network. */
  async isHealthy(): Promise<boolean> {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }
}
