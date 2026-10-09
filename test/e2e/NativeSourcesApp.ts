import { SiteClient } from '../../src/platform/native/SiteClient.ts';
import { NativeImages } from '../../src/platform/native/NativeImages.ts';
import { NativeTransport } from '../../src/platform/native/NativeTransport.ts';
import { CacheApiStore } from '../../src/platform/native/ResponseStore.ts';
import { BrowserParser } from '../../src/platform/webview/BrowserParser.ts';
import { LocalStorageStore } from '../../src/platform/webview/LocalStorageStore.ts';
import { App } from '../../src/ui/App.ts';
import * as scan from '../pretend/scanmangaPages.ts';
import * as sushi from '../pretend/sushiscanPages.ts';

interface NativeSourcesApp {
  app: App;
  online: boolean;
  captureCount: number;
  readonly revoked: string[];
  readonly captured: string[];
}

declare global {
  interface Window { nativeSources: NativeSourcesApp; }
}

const canvas = document.createElement('canvas');
canvas.width = 400;
canvas.height = 600;
const pen = canvas.getContext('2d')!;
pen.fillStyle = '#bde2bb';
pen.fillRect(0, 0, 400, 600);
pen.fillStyle = '#18281d';
pen.font = 'bold 30px sans-serif';
pen.fillText('Native reader', 85, 300);
const png = canvas.toDataURL('image/png').split(',')[1]!;
const state = { online: true, captureCount: 3, revoked: [] as string[], captured: [] as string[] };
const scanSeries = scan.SERIES[0]!;

/** Fake sites behind the actual native transport and App composition, with real blob images. */
const client = new SiteClient({ get: async (request) => {
  if (!state.online) throw new Error('offline');
  if (request.as === 'bytes') return { status: 200, headers: { 'content-type': 'image/png' }, body: png };
  const url = new URL(request.url);
  let body: string;
  if (url.hostname.endsWith('scan-manga.com')) {
    body = url.pathname.includes('lecture-en-ligne')
      ? `<a class="lelHgHistoryBack" href="${scan.seriesAddress(scanSeries)}">${scanSeries.title}</a>`
      : url.pathname === '/' ? scan.homePage()
      : url.pathname.includes('liste') ? scan.allTitlesPage()
      : scan.seriesPage(scanSeries);
  } else if (url.hostname.endsWith('sushiscan.net')) {
    body = url.pathname.includes('-chapitre-') ? sushi.chapterPage(sushi.LANTERN, '1', [1, 2, 3].map((n) => `${sushi.CDN}/native/${n}.png`))
      : url.pathname.includes('/catalogue/') ? sushi.seriesPage(sushi.LANTERN)
      : url.searchParams.has('s') ? sushi.searchPage([sushi.LANTERN]) : sushi.homePage();
  } else throw new Error(`Unexpected fixture request: ${request.url}`);
  return { status: 200, headers: { 'content-type': 'text/html' }, body };
} });

// Deliberately too small for a PNG: captured pictures must remain readable when disk caching cannot keep them.
const images = new NativeImages(client, new CacheApiStore('jr-native-fixture-images', 400, 8), {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => { state.revoked.push(url); URL.revokeObjectURL(url); },
});
const transport = new NativeTransport(client, new CacheApiStore('jr-native-fixture-pages', 80, 16 * 1024 ** 2), images, {
  render: async (address) => {
    if (!state.online) throw new Error('offline');
    state.captured.push(address);
    return { url: address, html: '<html>captured chapter', userAgent: 'fixture', cookies: '',
      pictures: Array.from({ length: state.captureCount }, () => ({ type: 'image/png', data: png })) };
  },
});
const outlet = document.getElementById('app')!;
const toasts = document.getElementById('toasts')!;
const app = new App({
  store: new LocalStorageStore(), parser: new BrowserParser(), defaults: { lang: 'fr' }, probe: null,
  clipboard: { readText: async () => null, writeText: async () => true }, connect: () => transport,
}, { outlet, toasts });
window.nativeSources = { app, revoked: state.revoked, captured: state.captured,
  get online() { return state.online; }, set online(value) { state.online = value; },
  get captureCount() { return state.captureCount; }, set captureCount(value) { state.captureCount = value; },
};
app.start();
