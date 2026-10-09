import type { HtmlParser, KeyValueStore, SettingsValues, Transport } from '../engine/index.ts';

/** The system clipboard; both calls answer "no" instead of failing when it is off limits. */
export interface Clipboard {
  readText(): Promise<string | null>;
  writeText(text: string): Promise<boolean>;
}

/** What the user may be told while a page is being checked by a WebView (the words are the app's, in its language). */
export interface DialogLabels {
  readonly statusLabel?: string;
  readonly cancelLabel?: string;
}

/** What a page loaded in the WebView may be given besides the words around it. */
export interface FetchOptions extends DialogLabels {
  /** Wait this long after the page is ready, for the scripts that build it to finish. */
  readonly settleMs?: number;
  /** Scroll to the bottom meanwhile, which is what makes a page that loads its pictures as they come into view load them. */
  readonly scroll?: boolean;
}

/**
 * Fetches any https page the way a browser would, past an anti-bot check if there is one, and
 * answers with a report to copy (see PageDigest.ts). It is how a site that cannot be read is
 * looked at from the phone, as the Probe workflow looks at it from GitHub.
 */
export interface PageProbe {
  fetch(address: string, options?: FetchOptions): Promise<string>;
}

/** How the app reaches the sites, and whether that works right now. */
export interface Connection extends Transport {
  isHealthy(): Promise<boolean>;
}

/**
 * Everything the app takes from the machine it runs on. The browser provides it
 * today (see web/); Capacitor will provide its own, with a transport that needs
 * no proxy, and the engine and the screens will not notice.
 */
export interface Platform {
  readonly store: KeyValueStore;
  readonly parser: HtmlParser;
  readonly clipboard: Clipboard;
  /** Where this platform's defaults differ from the engine's. */
  readonly defaults: Partial<SettingsValues>;
  /** Whether the sites are reached through a proxy the user can point elsewhere (the browser), or directly (the installed app). */
  readonly usesProxy: boolean;
  /** null where there is no WebView of the app's own to pass an anti-bot check with (the browser). */
  readonly probe: PageProbe | null;
  /** `proxyBase` reads the setting each time, so a change applies at once. */
  connect(proxyBase: () => string): Connection;
}
