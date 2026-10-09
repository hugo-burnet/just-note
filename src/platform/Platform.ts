import type { HtmlParser, KeyValueStore, SettingsValues, Transport } from '../engine/index.ts';

/** The system clipboard; both calls answer "no" instead of failing when it is off limits. */
export interface Clipboard {
  readText(): Promise<string | null>;
  writeText(text: string): Promise<boolean>;
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
  /** `proxyBase` reads the setting each time, so a change applies at once. */
  connect(proxyBase: () => string): Connection;
}
