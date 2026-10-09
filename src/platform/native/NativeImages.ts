import { Limiter } from '../../engine/Limiter.ts';
import { TransportError } from '../../engine/index.ts';
import type { ImageResource } from '../../engine/index.ts';
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

// Idle pictures can be evicted; addresses still owned by a view are never revoked.
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

interface LiveImage {
  readonly pending: Promise<string>;
  users: number;
  disposed?: boolean;
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
  private readonly live = new Map<string, LiveImage>();
  private readonly downloads = new Limiter(MAX_DOWNLOADS);
  private readonly problems = new Map<string, string>();
  private readonly prepared = new Map<string, Set<string>>();
  private readonly rendered = new Map<string, Blob>();

  constructor(client: Sites, store: ResponseStore, blobs: BlobUrls = browserBlobUrls) {
    this.client = client;
    this.store = store;
    this.blobs = blobs;
  }

  source(address: string): Promise<string> {
    return this.entry(address, false).pending;
  }

  problem(address: string): string | undefined {
    return this.problems.get(address);
  }

  /** Retain compressed script-built pictures for the current chapter and the next one. */
  beginRendering(group: string): void {
    const known = this.prepared.get(group) ?? new Set<string>();
    this.prepared.delete(group);
    this.prepared.set(group, known);
    while (this.prepared.size > 2) {
      const oldest = this.prepared.keys().next().value!;
      for (const address of this.prepared.get(oldest) ?? []) {
        this.rendered.delete(address);
        const entry = this.live.get(address);
        if (entry && entry.users === 0) {
          this.live.delete(address);
          this.dispose(entry);
        }
      }
      this.prepared.delete(oldest);
    }
  }

  /** A script-built picture also stays readable when disk caching fails or evicts another page. */
  async keep(address: string, blob: Blob, group = 'captured'): Promise<void> {
    if (!this.prepared.has(group)) this.beginRendering(group);
    this.prepared.get(group)?.add(address);
    this.rendered.set(address, blob);
    const previous = this.live.get(address);
    if (previous) {
      this.live.delete(address);
      this.dispose(previous);
    }
    await this.store.put(this.client.resolve(address).href, new Response(blob, { headers: { 'content-type': blob.type } })).catch(() => {});
  }

  async has(address: string): Promise<boolean> {
    return this.rendered.has(address) || this.live.has(address) || (await this.store.get(this.client.resolve(address).href).catch(() => undefined)) !== undefined;
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
    const generated = address.includes('/__rendered/');
    if (known && (!retry || generated)) {
      if (retained) known.users++;
      this.live.delete(address);
      this.live.set(address, known);
      return known;
    }
    if (known && known.users === 0) this.dispose(known);
    const pending = this.load(address, retry && !generated).then((url) => {
      if (this.live.get(address) === entry) this.problems.delete(address);
      return url;
    }, (error: unknown): string => {
      if (this.live.get(address) === entry) {
        this.live.delete(address);
        this.problems.delete(address);
        this.problems.set(address, why(error, address));
        for (const old of [...this.problems.keys()].slice(0, Math.max(0, this.problems.size - MAX_PROBLEMS))) this.problems.delete(old);
      }
      return address;
    });
    const entry = { pending, users: retained ? 1 : 0 };
    this.live.set(address, entry);
    this.release();
    return entry;
  }

  private async load(address: string, retry: boolean): Promise<string> {
    const rendered = this.rendered.get(address);
    if (rendered) return this.blobs.create(rendered);
    const key = this.client.resolve(address).href;
    const kept = retry ? undefined : await this.store.get(key).catch(() => undefined);
    if (kept) return this.blobs.create(await kept.blob());
    const { response } = await this.downloads.run(() => this.client.get(address, 'image'));
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
    if (entry.users > 0 || entry.disposed) return;
    entry.disposed = true;
    void entry.pending.then((url) => {
      if (url.startsWith('blob:')) this.blobs.revoke(url);
    });
  }
}

function decode(response: NativeResponse): Blob {
  return imageFromBase64(response.body, (response.headers['content-type'] ?? '').split(';')[0]?.trim().toLowerCase() ?? '');
}
