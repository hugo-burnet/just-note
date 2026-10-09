import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../../proxy/limits.ts';
import { TransportError } from '../../engine/index.ts';
import type { ImageResource } from '../../engine/index.ts';
import type { NativeResponse } from './NativeHttp.ts';
import type { ResponseStore } from './ResponseStore.ts';
import type { SiteClient } from './SiteClient.ts';

/** How an <img> is pointed at bytes the app holds itself. */
export interface BlobUrls {
  create(blob: Blob): string;
  revoke(url: string): void;
}

const browserBlobUrls: BlobUrls = {
  create: (blob) => URL.createObjectURL(blob),
  revoke: (url) => URL.revokeObjectURL(url),
};

// Idle pictures can be evicted; addresses still owned by a view are never revoked.
export const MAX_LIVE_IMAGES = 120;

interface LiveImage {
  readonly pending: Promise<string>;
  users: number;
}

/**
 * The pictures of the sites, downloaded by the app (with the Referer their servers want)
 * and handed to <img> as blob: addresses. Like through the proxy, this never fails: when a
 * picture cannot be had the <img> is given the site's own address, fails by itself, and its
 * error event is what the screens react to (and a retry asks again from scratch).
 */
export class NativeImages {
  private readonly client: SiteClient;
  private readonly store: ResponseStore;
  private readonly blobs: BlobUrls;
  private readonly live = new Map<string, LiveImage>();

  constructor(client: SiteClient, store: ResponseStore, blobs: BlobUrls = browserBlobUrls) {
    this.client = client;
    this.store = store;
    this.blobs = blobs;
  }

  source(address: string): Promise<string> {
    return this.entry(address, false).pending;
  }

  async acquire(address: string, retry = false): Promise<ImageResource> {
    const entry = this.entry(address, true, retry);
    const src = await entry.pending;
    let released = false;
    return { src, release: () => {
      if (released) return;
      released = true;
      entry.users--;
      if (this.live.get(address) !== entry) this.dispose(entry);
      this.release();
    } };
  }

  private entry(address: string, retained: boolean, retry = false): LiveImage {
    const known = this.live.get(address);
    if (known && !retry) {
      if (retained) known.users++;
      this.live.delete(address);
      this.live.set(address, known);
      return known;
    }
    if (known && known.users === 0) this.dispose(known);
    const pending = this.load(address, retry).catch((): string => {
      if (this.live.get(address) === entry) this.live.delete(address);
      return address;
    });
    const entry = { pending, users: retained ? 1 : 0 };
    this.live.set(address, entry);
    this.release();
    return entry;
  }

  private async load(address: string, retry: boolean): Promise<string> {
    const key = this.client.resolve(address).href;
    const kept = retry ? undefined : await this.store.get(key).catch(() => undefined);
    if (kept) return this.blobs.create(await kept.blob());
    const { response } = await this.client.get(address, 'image');
    const blob = decode(response);
    void this.store.put(key, new Response(blob, { headers: { 'content-type': blob.type } })).catch(() => {});
    return this.blobs.create(blob);
  }

  private release(): void {
    for (const [address, entry] of this.live) {
      if (this.live.size <= MAX_LIVE_IMAGES) return;
      if (entry.users > 0) continue;
      this.live.delete(address);
      this.dispose(entry);
    }
  }

  private dispose(entry: LiveImage): void {
    if (entry.users > 0) return;
    void entry.pending.then((url) => {
      if (url.startsWith('blob:')) this.blobs.revoke(url);
    });
  }
}

function decode(response: NativeResponse): Blob {
  const type = (response.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (!IMAGE_TYPES.has(type)) throw new TransportError('not_an_image', 'The source did not return an image.');
  if (response.body.length * 0.75 > MAX_IMAGE_BYTES) throw new TransportError('too_large', 'The source sent more data than allowed.');
  const binary = atob(response.body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type });
}
