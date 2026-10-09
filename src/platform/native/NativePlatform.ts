import type { SettingsValues } from '../../engine/index.ts';
import type { Transport } from '../../engine/index.ts';
import type { DialogLabels, PageProbe, Platform } from '../Platform.ts';
import { BrowserParser } from '../webview/BrowserParser.ts';
import { ClipboardService } from '../webview/ClipboardService.ts';
import { LocalStorageStore } from '../webview/LocalStorageStore.ts';
import { CapacitorNativeHttp } from './CapacitorNativeHttp.ts';
import { NativeProbe } from './NativeProbe.ts';
import { NativeTransport } from './NativeTransport.ts';
import { WebViewPageFetcher } from './PageFetcher.ts';

/** The installed app (Capacitor): the WebView's storage and parser, and the phone's own network. */
export class NativePlatform implements Platform {
  readonly store = new LocalStorageStore();
  readonly parser = new BrowserParser();
  readonly clipboard = new ClipboardService();
  readonly defaults: Partial<SettingsValues> = {};
  private readonly http = new CapacitorNativeHttp();
  private readonly fetcher = new WebViewPageFetcher();
  readonly probe: PageProbe = new NativeProbe(this.http, this.fetcher);

  connect(dialog: () => DialogLabels): Transport {
    return NativeTransport.over(this.http, this.fetcher, dialog);
  }
}
