import type { FetchOptions, PageProbe } from '../Platform.ts';
import { isChallenge } from './Challenge.ts';
import { CredentialJar } from './CredentialJar.ts';
import type { NativeHttp } from './NativeHttp.ts';
import { OpenPolicy } from './OpenPolicy.ts';
import { digest } from './PageDigest.ts';
import type { FetchedPage, PageFetcher } from './PageFetcher.ts';
import { SiteClient } from './SiteClient.ts';

const SETTLE_MS = 3000;

/**
 * Looks at a page from the phone: first with its own network, like the app reads the sites; if
 * an anti-bot check turns that away, through a WebView, which passes it, and then once more with
 * the phone's own network and what the WebView earned, which says whether the app can go on
 * without the WebView. Any https address is fine (see OpenPolicy): it is for finding out what a
 * site the app has no module for yet sends.
 */
export class NativeProbe implements PageProbe {
  private readonly http: NativeHttp;
  private readonly fetcher: PageFetcher;

  constructor(http: NativeHttp, fetcher: PageFetcher) {
    this.http = http;
    this.fetcher = fetcher;
  }

  async fetch(address: string, options: FetchOptions = {}): Promise<string> {
    const { response, url } = await new SiteClient(this.http, new OpenPolicy()).exchange(address, 'text');
    if (!isChallenge(response)) return digest({ via: 'phone', status: response.status, url: url.href, body: response.body });
    // A reader builds its pages with scripts, and loads the pictures as they come into view.
    const page = await this.fetcher.fetch(url.href, { settleMs: SETTLE_MS, scroll: true, ...options });
    const { html: body, requests, failures } = page;
    return digest({ via: 'webview', status: response.status, url: page.url, body, requests, failures, withCookie: await this.withCookie(url, page) });
  }

  private async withCookie(url: URL, page: FetchedPage): Promise<string> {
    const jar = new CredentialJar();
    jar.remember(page, url.hostname);
    try {
      const { response } = await new SiteClient(this.http, new OpenPolicy(), jar).exchange(url.href, 'text');
      return isChallenge(response) ? `${response.status}, the check again` : String(response.status);
    } catch (error) {
      return `no answer (${(error as { code?: unknown }).code ?? 'error'})`;
    }
  }
}
