import type { DialogLabels, PageProbe } from '../Platform.ts';
import { isChallenge } from './Challenge.ts';
import { digest } from './PageDigest.ts';
import type { PageFetcher } from './PageFetcher.ts';
import type { SiteClient } from './SiteClient.ts';

/**
 * Looks at a page from the phone: first with its own network, like the app reads the sites; if
 * an anti-bot check turns that away, through a WebView, which passes it. `client` is not tied
 * to the sites the app knows (see OpenPolicy): it is for finding out what a new one sends.
 */
export class NativeProbe implements PageProbe {
  private readonly client: SiteClient;
  private readonly fetcher: PageFetcher;

  constructor(client: SiteClient, fetcher: PageFetcher) {
    this.client = client;
    this.fetcher = fetcher;
  }

  async fetch(address: string, labels: DialogLabels = {}): Promise<string> {
    const { response, url } = await this.client.exchange(address, 'text');
    if (!isChallenge(response)) return digest({ via: 'phone', status: response.status, url: url.href, body: response.body });
    const page = await this.fetcher.fetch(url.href, labels);
    return digest({ via: 'webview', status: response.status, url: page.url, body: page.html });
  }
}
