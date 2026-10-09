import { registerPlugin } from '@capacitor/core';
import type { FetchOptions } from '../Platform.ts';

/** A page as a real WebView shows it once the site let it through. */
export interface FetchedPage {
  readonly html: string;
  /** Where the WebView ended up. */
  readonly url: string;
  /** What the site saw the WebView call itself: a cookie earned there is only good with the same one. */
  readonly userAgent: string;
  readonly cookies: string;
}

export interface PageFetcher {
  fetch(url: string, options?: FetchOptions): Promise<FetchedPage>;
}

interface PageFetcherPlugin {
  fetch(options: { url: string; timeoutMs: number; statusLabel?: string; cancelLabel?: string; settleMs?: number; scroll?: boolean }): Promise<FetchedPage>;
}

const TIMEOUT_MS = 90_000;

/**
 * The WebView of the app (android/…/PageFetcherPlugin.java): it runs the scripts of an anti-bot
 * check as a browser does, in front of the app so that a check which needs a tap can be answered.
 */
export class WebViewPageFetcher implements PageFetcher {
  private readonly plugin = registerPlugin<PageFetcherPlugin>('PageFetcher');

  fetch(url: string, options: FetchOptions = {}): Promise<FetchedPage> {
    const { statusLabel, cancelLabel, settleMs, scroll } = options;
    return this.plugin.fetch({ url, timeoutMs: TIMEOUT_MS, statusLabel, cancelLabel, settleMs, scroll });
  }
}
