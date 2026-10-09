import type { HtmlParser, KeyValueStore, SettingsValues, Transport } from '../engine/index.ts';

/** The system clipboard; both calls answer "no" instead of failing when it is off limits. */
export interface Clipboard {
  readText(): Promise<string | null>;
  writeText(text: string): Promise<boolean>;
}

/** What the user may be told while a page is being checked by a WebView (the words are the app's, in its language). */
export interface DialogLabels {
  /** While a site's anti-bot check is passed. */
  readonly statusLabel?: string;
  /** While a chapter is loaded in the WebView. */
  readonly readingLabel?: string;
  readonly cancelLabel?: string;
}

/** What a page loaded in the WebView may be given besides the words around it. */
export interface FetchOptions extends DialogLabels {
  /** Wait this long after the page is ready, for the scripts that build it to finish. */
  readonly settleMs?: number;
  /** Scroll to the bottom meanwhile, which is what makes a page that loads its pictures as they come into view load them. */
  readonly scroll?: boolean;
  /**
   * A CSS selector for the pictures the page builds with its scripts (they have no address to ask for):
   * the page is scrolled until they have all come in, and they are handed back with it.
   */
  readonly pictures?: string;
  /** A CSS selector for the places the page keeps for those pictures, when it has them before it has the pictures: how many to wait for. */
  readonly slots?: string;
  /** Nobody is waiting: the page is read behind the app, with nothing on the screen, and not at all if it asks for a human check. */
  readonly background?: boolean;
}

/**
 * Fetches any https page the way a browser would, past an anti-bot check if there is one, and
 * answers with a report to copy (see PageDigest.ts). It is how a site that cannot be read is
 * looked at from the phone, as the Probe workflow looks at it from GitHub.
 */
export interface PageProbe {
  fetch(address: string, options?: FetchOptions): Promise<string>;
}

/**
 * Everything the app takes from the machine it runs on: the phone, through Capacitor (see native/). Tests
 * give it fakes, and the engine and the screens do not notice.
 */
export interface Platform {
  readonly store: KeyValueStore;
  readonly parser: HtmlParser;
  readonly clipboard: Clipboard;
  /** Where this platform's defaults differ from the engine's. */
  readonly defaults: Partial<SettingsValues>;
  /** null where there is no WebView of the app's own to look at a page with (a test). */
  readonly probe: PageProbe | null;
  /** How the app reaches the sites. `dialog` is what the user is told while a WebView checks a site, in the language of the app. */
  connect(dialog: () => DialogLabels): Transport;
}
