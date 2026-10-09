import type { NativeResponse } from './NativeHttp.ts';
import { imageFromBase64 } from './ImageBytes.ts';
import type { ResponseStore } from './ResponseStore.ts';
import type { Sites } from './SiteClient.ts';

/** How an <img> is pointed at bytes the app holds itself. */
export interface BlobUrls {
  create(blob: Blob): string;
  revoke(url: string): void;
}

const browserBlobUrls: BlobUrls = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
};

// Enough for a long chapter and the ones around it; past this, the oldest addresses are let go.
export const MAX_LIVE_IMAGES = 120;

/**
 * The pictures of the sites, downloaded by the app (with the Referer their servers want)
 * and handed to <img> as blob: addresses. Like through the proxy, this never fails: when a
 * picture cannot be had the <img> is given the site's own address, fails by itself, and its
 * error event is what the screens react to (and a retry asks again from scratch).
 */
export class NativeImages {
  private readonly client: Sites;
  private readonly store: ResponseStore;
  private readonly blobs: BlobUrls;
  private readonly live = new Map<string, Promise<string>>();

  constructor(client: Sites, store: ResponseStore, blobs: BlobUrls = browserBlobUrls) {
    this.client = client;
    this.store = store;
    this.blobs = blobs;
  }

  source(address: string): Promise<string> {
    const known = this.live.get(address);
    if (known) return known;
    const pending = this.load(address).catch((): string => {
      this.live.delete(address);
      return address;
    });
    this.live.set(address, pending);
    this.release();
    return pending;
  }

  /** Keeps a picture that was not downloaded (a page built it) where `source(address)` finds it. */
  async keep(address: string, blob: Blob): Promise<void> {
    await this.store.put(this.client.resolve(address).href, new Response(blob, { headers: { 'content-type': blob.type } }));
    const pending = this.live.get(address);
    if (pending) {
      this.live.delete(address);
      void pending.then((url) => this.blobs.revoke(url));
    }
  }

  /** Whether a picture is kept, so that `source(address)` needs no network. */
  async has(address: string): Promise<boolean> {
    return (await this.store.get(this.client.resolve(address).href)) !== undefined;
  }

  private async load(address: string): Promise<string> {
    const key = this.client.resolve(address).href;
    const kept = await this.store.get(key);
    if (kept) return this.blobs.create(await kept.blob());
    const { response } = await this.client.get(address, 'image');
    const blob = decode(response);
    void this.store.put(key, new Response(blob, { headers: { 'content-type': blob.type } }));
    return this.blobs.create(blob);
  }

  private release(): void {
    for (const [address, pending] of this.live) {
      if (this.live.size <= MAX_LIVE_IMAGES) return;
      this.live.delete(address);
      void pending.then((url) => this.blobs.revoke(url));
    }
  }
}

function decode(response: NativeResponse): Blob {
  return imageFromBase64(response.body, (response.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '');
}
