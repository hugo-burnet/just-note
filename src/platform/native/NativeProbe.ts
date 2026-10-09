import type { FetchOptions, PageProbe } from '../Platform.ts';
import { isChallenge } from './Challenge.ts';
import { CredentialJar } from './CredentialJar.ts';
import { sniff } from './ImageBytes.ts';
import type { NativeHttp } from './NativeHttp.ts';
import { OpenPolicy } from './OpenPolicy.ts';
import { digest } from './PageDigest.ts';
import type { CapturedPicture, FetchedPage, PageFetcher } from './PageFetcher.ts';
import { DataTries } from './ProbeTries.ts';
import { SiteClient } from './SiteClient.ts';

const SETTLE_MS = 3000;
// What a reader that builds its pictures with scripts shows them as, and (often) numbers the places it keeps for them.
const BUILT_PICTURES = 'img[src^="blob:"]';
const PLACES = '[data-page]';
const SHOWN_PICTURES = 8;

const kilobytes = (base64: string): number => Math.round((base64.length * 0.75) / 1024);

/** What the reader script collected, as lines of the report: how many, how big, and what they really are. */
function describe(pictures: readonly CapturedPicture[], note: string | undefined): string[] {
  const total = pictures.reduce((sum, picture) => sum + kilobytes(picture.data), 0);
  const shown = pictures.slice(0, SHOWN_PICTURES).map((picture, index) => {
    const head = Uint8Array.from(atob(picture.data.slice(0, 24)), (letter) => letter.charCodeAt(0));
    return `${index + 1}: ${picture.type || '(no type)'}, really ${sniff(head) || 'unknown'}, ${kilobytes(picture.data)} KB`;
  });
  return [`--- pictures the reader script collected (${pictures.length}, ${total} KB in all)`, ...(note ? [`it found: ${note}`] : []), ...shown];
}

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
    // A page that shows pictures as blob: addresses is looked at once more, with the script that takes them.
    const collected = /<img\b[^>]*\bsrc=["']blob:/i.test(body) ? await this.collect(url, options) : undefined;
    // The phone's own network, with what the WebView earned: is it let through, and what do the page's other requests give?
    const jar = new CredentialJar();
    jar.remember(page, url.hostname);
    const native = await this.again(new SiteClient(this.http, new OpenPolicy(), jar), url);
    const tried = await new DataTries(this.http, jar).run(url, requests ?? [], [
      { label: 'as the WebView shows it', html: body },
      { label: 'as the phone reads it', html: native.html },
    ]);
    return digest({ via: 'webview', status: response.status, url: page.url, body, requests, failures, collected, tried, withCookie: native.answer });
  }

  private async collect(url: URL, options: FetchOptions): Promise<string[]> {
    try {
      const { pictures = [], note } = await this.fetcher.fetch(url.href, { ...options, pictures: BUILT_PICTURES, slots: PLACES });
      return describe(pictures, note);
    } catch (error) {
      const { code, message } = error as { code?: unknown; message?: unknown };
      return [`--- pictures the reader script collected: failed (${String(code ?? 'error')}: ${String(message ?? error)})`];
    }
  }

  /** The page asked for again with the phone's own network and what the WebView earned: how it was answered, and what came. */
  private async again(earned: SiteClient, url: URL): Promise<{ answer: string; html: string }> {
    try {
      const { response } = await earned.exchange(url.href, 'text');
      return { answer: isChallenge(response) ? `${response.status}, the check again` : String(response.status), html: response.body };
    } catch (error) {
      return { answer: `no answer (${(error as { code?: unknown }).code ?? 'error'})`, html: '' };
    }
  }
}
