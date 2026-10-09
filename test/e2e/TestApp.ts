import type { Transport } from '../../src/engine/index.ts';
import type { NativeHttp, NativeRequest, NativeResponse } from '../../src/platform/native/NativeHttp.ts';
import { NativeTransport } from '../../src/platform/native/NativeTransport.ts';
import type { DialogLabels, Platform } from '../../src/platform/Platform.ts';
import { BrowserParser } from '../../src/platform/webview/BrowserParser.ts';
import { LocalStorageStore } from '../../src/platform/webview/LocalStorageStore.ts';
import { App } from '../../src/ui/App.ts';

declare global {
  interface Window { e2e: { readonly app: App; offline: boolean } }
}

// The network is cut by a flag kept in the page's storage, so that it stays cut across reloads, as a phone's would.
const OFFLINE = 'e2e:offline';

/**
 * The phone's network stack, in a test: each request goes to the stage, which has the pretend web answer it
 * (see Stage.ts). With the network cut, it fails the way the phone's does.
 */
class StageHttp implements NativeHttp {
  async get(request: NativeRequest): Promise<NativeResponse> {
    if (localStorage.getItem(OFFLINE) === '1') throw new Error('The network is cut.');
    const answer = await fetch('./__net', { method: 'POST', body: JSON.stringify({ url: request.url, headers: request.headers, as: request.as }) });
    return (await answer.json()) as NativeResponse;
  }
}

/** The installed app, as main.ts composes it, but over the stage's network and with no WebView (no anti-bot check to pass). */
const platform: Platform = {
  store: new LocalStorageStore(),
  parser: new BrowserParser(),
  clipboard: { readText: async () => null, writeText: async () => true },
  defaults: {},
  probe: null,
  connect: (_dialog: () => DialogLabels): Transport => NativeTransport.over(new StageHttp()),
};

const outlet = document.getElementById('app');
const toasts = document.getElementById('toasts');
if (outlet && toasts) {
  const app = new App(platform, { outlet, toasts });
  window.e2e = {
    app,
    get offline() {
      return localStorage.getItem(OFFLINE) === '1';
    },
    set offline(value) {
      if (value) localStorage.setItem(OFFLINE, '1');
      else localStorage.removeItem(OFFLINE);
    },
  };
  app.start();
}
