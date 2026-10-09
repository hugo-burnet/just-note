import type { FetchOptions, PageProbe } from '../Platform.ts';
import { isChallenge } from './Challenge.ts';
import { CredentialJar } from './CredentialJar.ts';
import { sniff } from './ImageBytes.ts';
import type { NativeHttp, NativeResponse } from './NativeHttp.ts';
import { OpenPolicy } from './OpenPolicy.ts';
import { digest } from './PageDigest.ts';
import type { CapturedPicture, FetchedPage, PageFetcher } from './PageFetcher.ts';
import { SiteClient } from './SiteClient.ts';

const SETTLE_MS = 3000;
// What a reader that builds its pictures with scripts shows them as.
const BUILT_PICTURES = 'img[src^="blob:"]';
const SHOWN_PICTURES = 8;
const TRIED_REQUESTS = 3;
const FILE_THAT_IS_NOT_DATA = /\.(?:css|js|woff2?|otf|ttf|ico|svg)(?:\?|$)/i;

const kilobytes = (base64: string): number => Math.round((base64.length * 0.75) / 1024);

/** What the reader script collected, as lines of the report: how many, how big, and what they really are. */
function describe(pictures: readonly CapturedPicture[]): string[] {
  const total = pictures.reduce((sum, picture) => sum + kilobytes(picture.data), 0);
  const shown = pictures.slice(0, SHOWN_PICTURES).map((picture, index) => {
    const head = Uint8Array.from(atob(picture.data.slice(0, 24)), (letter) => letter.charCodeAt(0));
    return `${index + 1}: ${picture.type || '(no type)'}, really ${sniff(head) || 'unknown'}, ${kilobytes(picture.data)} KB`;
  });
  return [`--- pictures the reader script collected (${pictures.length}, ${total} KB in all)`, ...shown];
}

/** The first bytes of an answer, as a reader sees them: in hexadecimal, and as the letters they are when they are letters. */
function peek(response: NativeResponse, text: boolean): string {
  const bytes = text ? new TextEncoder().encode(response.body.slice(0, 24)) : Uint8Array.from(atob(response.body.slice(0, 32)), (letter) => letter.charCodeAt(0));
  const hex = [...bytes.slice(0, 8)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  const letters = [...bytes.slice(0, 24)].map((byte) => (byte >= 32 && byte < 127 ? String.fromCharCode(byte) : '.')).join('');
  return `${hex} ${letters}`;
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
    const earned = new SiteClient(this.http, new OpenPolicy(), jar);
    const withCookie = await this.withCookie(earned, url);
    const tried = await this.tryRequests(earned, url, requests ?? []);
    return digest({ via: 'webview', status: response.status, url: page.url, body, requests, failures, collected, tried, withCookie });
  }

  private async collect(url: URL, options: FetchOptions): Promise<string[]> {
    try {
      const { pictures = [] } = await this.fetcher.fetch(url.href, { ...options, pictures: BUILT_PICTURES });
      return describe(pictures);
    } catch (error) {
      const { code, message } = error as { code?: unknown; message?: unknown };
      return [`--- pictures the reader script collected: failed (${String(code ?? 'error')}: ${String(message ?? error)})`];
    }
  }

  private async withCookie(earned: SiteClient, url: URL): Promise<string> {
    try {
      const { response } = await earned.exchange(url.href, 'text');
      return isChallenge(response) ? `${response.status}, the check again` : String(response.status);
    } catch (error) {
      return `no answer (${(error as { code?: unknown }).code ?? 'error'})`;
    }
  }

  /**
   * What the phone is answered when it asks, as the page did, for what the page requested from the other
   * hosts of its own site (not its style sheets and scripts): where its data and its pictures come from, and
   * whether they come as they are or need the page's scripts to be made into something.
   */
  private async tryRequests(earned: SiteClient, url: URL, requests: readonly string[]): Promise<string[]> {
    const domain = url.hostname.split('.').slice(-2).join('.');
    const seen = new Set<string>();
    const wanted: string[] = [];
    for (const request of requests) {
      const [method, address = ''] = request.split(' ');
      let target: URL;
      try {
        target = new URL(address);
      } catch {
        continue;
      }
      const kind = `${target.hostname}/${target.pathname.split('/').slice(1, 3).join('/').replace(/\d+/g, '#')}`;
      const own = target.hostname.endsWith(domain) && target.hostname !== url.hostname && !target.hostname.startsWith('static.');
      if (method !== 'GET' || !own || FILE_THAT_IS_NOT_DATA.test(target.pathname) || seen.has(kind)) continue;
      seen.add(kind);
      wanted.push(target.href);
      if (wanted.length === TRIED_REQUESTS) break;
    }
    if (wanted.length === 0) return [];
    const lines = [`--- the phone's own network, asked for what the page requested of its site (${wanted.length})`];
    for (const address of wanted) {
      const text = /\.json(?:\?|$)/i.test(address);
      try {
        const { response } = await earned.exchange(address, text ? 'text' : 'image', `${url.origin}/`);
        const size = Math.round((text ? response.body.length : response.body.length * 0.75) / 1024);
        lines.push(`${response.status} ${response.headers['content-type'] ?? '(no type)'}, ${size} KB, starts with ${peek(response, text)}`, address);
      } catch (error) {
        lines.push(`no answer (${(error as { code?: unknown }).code ?? 'error'})`, address);
      }
    }
    return lines;
  }
}
