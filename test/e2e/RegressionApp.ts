import { Library } from '../../src/engine/library/Library.ts';
import { CacheApiStore } from '../../src/platform/native/ResponseStore.ts';
import { CacheBudget } from '../../src/platform/web/CacheBudget.ts';
import { ResponseCache } from '../../src/sw/ResponseCache.ts';
import { NativeImages } from '../../src/platform/native/NativeImages.ts';
import { NativeTransport } from '../../src/platform/native/NativeTransport.ts';
import { SiteClient } from '../../src/platform/native/SiteClient.ts';
import { LocalStorageStore } from '../../src/platform/web/LocalStorageStore.ts';
import { PagedMode } from '../../src/ui/views/reader/PagedMode.ts';
import type { ReadingSurface, SurfaceOptions } from '../../src/ui/views/reader/ReadingSurface.ts';
import { ScrollMode } from '../../src/ui/views/reader/ScrollMode.ts';
import { BackupPanel } from '../../src/ui/components/BackupPanel.ts';
import { Sheet } from '../../src/ui/components/Sheet.ts';
import { I18n } from '../../src/ui/i18n/I18n.ts';

interface RegressionApp {
  readonly library: Library;
  readonly revoked: string[];
  online: boolean;
  downloads: number;
  reader: ReadingSurface | null;
  copied: string;
  showNativeBackup(): void;
  cacheBudget(kind: 'native' | 'worker'): Promise<{ keys: string[]; bytes: number; readable: string; original: string }>;
  openNative(mode: 'paged' | 'scroll', count: number): void;
}

declare global {
  interface Window { regression: RegressionApp; }
}

// This bundle is served only by the E2E stage, and exercises the same classes as the APK.
const regression: RegressionApp = {
  library: new Library(new LocalStorageStore()),
  online: true,
  downloads: 0,
  revoked: [],
  reader: null,
  copied: '',
  showNativeBackup() {
    const i18n = new I18n();
    const app: ConstructorParameters<typeof BackupPanel>[0] = {
      library: this.library, i18n, usesProxy: false,
      clipboard: { writeText: async (raw: string) => { this.copied = raw; return true; } },
      toasts: { show: () => {} }, sheets: { present: (options) => new Sheet(document.body, options) },
    };
    document.body.replaceChildren(new BackupPanel(app).root);
  },
  async cacheBudget(kind) {
    const name = `regression-${kind}`;
    await caches.delete(name);
    const store = kind === 'native' ? new CacheApiStore(name, 10, 9) : new ResponseCache(name, new CacheBudget(10, 9));
    const urls = ['a', 'b', 'c'].map((key) => `https://fanfox.net/budget/${key}`);
    const original = new Response('3333', { headers: { 'content-length': '1' } });
    await Promise.all(urls.map((key, index) => store.put(key, index === 2 ? original : new Response('1111'))));
    const cache = await caches.open(name);
    const keys = await cache.keys();
    const bytes = (await Promise.all(keys.map(async (key) => (await (await cache.match(key))!.arrayBuffer()).byteLength))).reduce((a, b) => a + b, 0);
    const readable = await (await cache.match(urls[2]!))!.text();
    return { keys: keys.map((key) => key.url), bytes, readable, original: await original.text() };
  },
  openNative(mode, count) {
    this.reader?.destroy();
    this.downloads = 0;
    this.revoked.length = 0;
    const canvas = document.createElement('canvas');
    canvas.width = 400;
    canvas.height = 600;
    const png = canvas.toDataURL('image/png').split(',')[1] ?? '';
    const client = new SiteClient({ get: async () => {
      this.downloads++;
      if (!this.online) throw new Error('offline');
      return { status: 200, headers: { 'content-type': 'image/png' }, body: png };
    } });
    const responses = new Map<string, Response>();
    const store = {
      get: async (key: string) => responses.get(key)?.clone(),
      put: async (key: string, response: Response) => { responses.set(key, response); },
    };
    const images = new NativeImages(client, store, {
      create: (blob) => URL.createObjectURL(blob),
      revoke: (src) => { this.revoked.push(src); URL.revokeObjectURL(src); },
    });
    const options: SurfaceOptions = {
      chapter: 'https://fanfox.net/manga/regression/c001/1.html',
      pages: Array.from({ length: count }, (_, index) => `https://fmcdn.mfcdn.net/regression/${index}.png`),
      startPage: 0,
      transport: new NativeTransport(client, store, images),
      rtl: false,
      retryLabel: 'Retry image',
      handlers: { page: () => {}, nearEnd: () => {}, turn: () => {}, toggleChrome: () => {}, hideChrome: () => {} },
    };
    this.reader = mode === 'paged' ? new PagedMode(options) : new ScrollMode(options);
    const host = document.createElement('main');
    host.className = 'reader';
    host.append(this.reader.root);
    document.body.replaceChildren(host);
  },
};
window.regression = regression;
