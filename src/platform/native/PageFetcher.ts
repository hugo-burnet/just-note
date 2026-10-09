import { registerPlugin } from '@capacitor/core';
import type { FetchOptions } from '../Platform.ts';
import { BLOB_HOOK, pictureScript } from './pictureScript.ts';

/** A picture a page built, as the WebView read it. */
export interface CapturedPicture {
  /** What the bytes are, when the page said ("image/jpeg"); empty when it did not. */
  readonly type: string;
  /** The bytes, in base64. */
  readonly data: string;
}

/** A page as a real WebView shows it once the site let it through. */
export interface FetchedPage {
  readonly html: string;
  /** Where the WebView ended up. */
  readonly url: string;
  /** What the site saw the WebView call itself: a cookie earned there is only good with the same one. */
  readonly userAgent: string;
  readonly cookies: string;
  /** What the page asked for while it loaded ("GET https://…"), in order. */
  readonly requests?: readonly string[];
  /** The ones the site answered with an error ("403 https://…"). */
  readonly failures?: readonly string[];
  /** The pictures asked for with `FetchOptions.pictures`, in the order they are in the page. */
  readonly pictures?: readonly CapturedPicture[];
}

export interface PageFetcher {
  fetch(url: string, options?: FetchOptions): Promise<FetchedPage>;
  /** What the WebView already holds for a site (cookies earned in this run or an earlier one), asked without showing anything. */
  held(url: string): Promise<Held>;
}

export interface Held {
  readonly cookies: string;
  readonly userAgent: string;
}

interface PluginOptions {
  url: string;
  timeoutMs: number;
  statusLabel?: string;
  cancelLabel?: string;
  settleMs?: number;
  scroll?: boolean;
  startScript?: string;
  script?: string;
}

// The pictures are not in the answer: there can be tens of megabytes of them, which the bridge
// carries better one at a time. The answer says how many there are.
type PluginPage = Omit<FetchedPage, 'pictures'> & { pictures?: number };

interface PageFetcherPlugin {
  fetch(options: PluginOptions): Promise<PluginPage>;
  picture(options: { index: number }): Promise<CapturedPicture>;
  release(): Promise<void>;
  held(options: { url: string }): Promise<Held>;
}

const TIMEOUT_MS = 90_000;

/**
 * The WebView of the app (android/…/PageFetcherPlugin.java): it runs the scripts of an anti-bot
 * check as a browser does, in front of the app so that a check which needs a tap can be answered,
 * and the scripts of a reader that builds its pictures, which it hands back.
 */
export class WebViewPageFetcher implements PageFetcher {
  private readonly plugin = registerPlugin<PageFetcherPlugin>('PageFetcher');

  async fetch(url: string, options: FetchOptions = {}): Promise<FetchedPage> {
    const { statusLabel, readingLabel, cancelLabel, settleMs, scroll, pictures: selector } = options;
    const reading = selector ? { startScript: BLOB_HOOK, script: pictureScript(selector) } : {};
    const { pictures: count = 0, ...page } = await this.plugin.fetch({
      url,
      timeoutMs: TIMEOUT_MS,
      statusLabel: selector ? (readingLabel ?? statusLabel) : statusLabel,
      cancelLabel,
      settleMs,
      scroll,
      ...reading,
    });
    return selector ? { ...page, pictures: await this.take(count) } : page;
  }

  held(url: string): Promise<Held> {
    return this.plugin.held({ url });
  }

  private async take(count: number): Promise<CapturedPicture[]> {
    const taken: CapturedPicture[] = [];
    try {
      for (let index = 0; index < count; index++) taken.push(await this.plugin.picture({ index }));
    } finally {
      await this.plugin.release().catch(() => undefined);
    }
    return taken;
  }
}
