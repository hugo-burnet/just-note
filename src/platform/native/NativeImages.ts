import { Limiter } from '../../engine/Limiter.ts';
import { TransportError } from '../../engine/index.ts';
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
// A chapter of two hundred pages is not downloaded at once: the phone's network and the site's server would give up on it.
const MAX_DOWNLOADS = 6;
const MAX_PROBLEMS = 200;

/** Why a picture was not had, in a few words: the answer of the site and its host, or the kind of failure. */
function why(error: unknown, address: string): string {
  let host = '';
  try {
    host = new URL(address).hostname;
  } catch {
    // An address that is none: nothing to name.
  }
  if (error instanceof TransportError) return [error.upstreamStatus ?? error.code, error.host ?? host].filter(Boolean).join(' · ');
  return ['error', host].filter(Boolean).join(' · ');
}

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
  private readonly downloads = new Limiter(MAX_DOWNLOADS);
  private readonly problems = new Map<string, string>();

  constructor(client: Sites, store: ResponseStore, blobs: BlobUrls = browserBlobUrls) {
    this.client = client;
    this.store = store;
    this.blobs = blobs;
  }

  source(address: string): Promise<string> {
    const known = this.live.get(address);
    if (known) return known;
    const pending = this.load(address).then(
      (url): string => {
        this.problems.delete(address);
        return url;
      },
      (error: unknown): string => {
        this.live.delete(address);
        this.problems.delete(address);
        this.problems.set(address, why(error, address));
        for (const old of [...this.problems.keys()].slice(0, Math.max(0, this.problems.size - MAX_PROBLEMS))) this.problems.delete(old);
        return address;
      },
    );
    this.live.set(address, pending);
    this.release();
    return pending;
  }

  /** Why the last try at this picture failed, when it did. */
  problem(address: string): string | undefined {
    return this.problems.get(address);
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
    const { response } = await this.downloads.run(() => this.client.get(address, 'image'));
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
