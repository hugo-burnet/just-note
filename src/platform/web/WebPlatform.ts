import type { SettingsValues } from '../../engine/index.ts';
import type { Connection, Platform } from '../Platform.ts';
import { BrowserParser } from './BrowserParser.ts';
import { ClipboardService } from './ClipboardService.ts';
import { LocalStorageStore } from './LocalStorageStore.ts';
import { ProxyTransport } from './ProxyTransport.ts';

/** The browser: localStorage, DOMParser, the system clipboard, and the proxy of this repository. */
export class WebPlatform implements Platform {
  readonly store = new LocalStorageStore();
  readonly parser = new BrowserParser();
  readonly clipboard = new ClipboardService();
  readonly usesProxy = true;
  readonly defaults: Partial<SettingsValues>;

  /** `proxyBase`: where the proxy lives, when it is not at the address of the app (GitHub Pages). */
  constructor(proxyBase = '') {
    this.defaults = { proxyBase };
  }

  connect(proxyBase: () => string): Connection {
    return new ProxyTransport(proxyBase);
  }
}
