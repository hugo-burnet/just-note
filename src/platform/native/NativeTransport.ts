import { HostPolicy } from '../../../proxy/HostPolicy.ts';
import { MAX_HTML_BYTES } from '../../../proxy/limits.ts';
import { TransportError } from '../../engine/index.ts';
import type { FetchedText, RenderedPage, RenderRequest, TextRequest } from '../../engine/index.ts';
import type { Connection, DialogLabels } from '../Platform.ts';
import { IMAGE_CACHE, MAX_IMAGES, MAX_PAGES, PAGE_CACHE } from '../web/cacheNames.ts';
import { ChallengeGate } from './ChallengeGate.ts';
import type { PageRenderer } from './ChallengeGate.ts';
import { CredentialJar } from './CredentialJar.ts';
import { imageFromBase64 } from './ImageBytes.ts';
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
  /** Only with a WebView to show the page in (see PageRenderer). */
  readonly render: Connection['render'];
  private readonly client: Sites;
  private readonly pages: ResponseStore;
  private readonly images: NativeImages;

  constructor(client: Sites, pages: ResponseStore, images: NativeImages, renderer?: PageRenderer) {
    this.client = client;
    this.pages = pages;
    this.images = images;
    this.render = renderer ? (url, request) => this.rendering(renderer, url, request) : undefined;
  }

  /** `fetcher`: the WebView that passes the anti-bot check of a site that turns the phone away; `dialog` says what the user is told meanwhile. */
  static over(http: NativeHttp, fetcher?: PageFetcher, dialog?: () => DialogLabels): NativeTransport {
    const jar = new CredentialJar();
    const client = new SiteClient(http, new HostPolicy(), jar);
    const gate = fetcher ? new ChallengeGate(client, jar, fetcher, dialog) : undefined;
    const sites = gate ?? client;
    const images = new NativeImages(sites, new CacheApiStore(IMAGE_CACHE, MAX_IMAGES));
    return new NativeTransport(sites, new CacheApiStore(PAGE_CACHE, MAX_PAGES), images, gate);
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

  /**
   * A page whose pictures its scripts build: they are read in the WebView, kept as the pictures of the
   * site are kept, under addresses of the page's own site that never reach the network, and their list
   * is kept too, so that a chapter read once opens again with no WebView and no network.
   */
  private async rendering(renderer: PageRenderer, address: string, request: RenderRequest): Promise<RenderedPage> {
    const page = this.client.resolve(address);
    const tag = fingerprint(page.pathname + page.search);
    const listKey = `${page.origin}/__rendered/${tag}.json`;
    const kept = await this.keptRendering(listKey);
    if (kept) return kept;

    const shown = await renderer.render(address, request.pictures, request.slots, request.background === true);
    const taken = shown.pictures ?? [];
    const pictures = taken.map((picture, index) => ({ picture, address: `${page.origin}/__rendered/${tag}/${index + 1}` }));
    await Promise.all(pictures.map(({ picture, address: where }) => this.images.keep(where, imageFromBase64(picture.data, picture.type, true))));
    const addresses = pictures.map((one) => one.address);
    if (addresses.length > 0) void this.pages.put(listKey, new Response(JSON.stringify({ url: shown.url, pictures: addresses })));
    return { text: shown.html, url: shown.url, pictures: addresses };
  }

  private async keptRendering(listKey: string): Promise<RenderedPage | undefined> {
    const kept = await this.pages.get(listKey);
    if (!kept) return undefined;
    try {
      const { url, pictures } = (await kept.json()) as { url: string; pictures: string[] };
      const present = await Promise.all(pictures.map((address) => this.images.has(address)));
      return present.every(Boolean) ? { text: '', url, pictures } : undefined;
    } catch {
      return undefined;
    }
  }

  /** There is no proxy to ask: the app is as healthy as its network. */
  async isHealthy(): Promise<boolean> {
    return typeof navigator === 'undefined' || navigator.onLine !== false;
  }
}

/** A short name for an address, to name what is made from it (FNV-1a, in hexadecimal). */
function fingerprint(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193);
  return (hash >>> 0).toString(16).padStart(8, '0');
}
