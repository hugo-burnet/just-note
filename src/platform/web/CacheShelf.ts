import type { OfflineShelf } from '../../engine/index.ts';
import { SAVED_CACHE } from './cacheNames.ts';

const SIZE = 'x-just-read-saved-bytes';
// Texts are kept under addresses of their own, which no request of the app ever asks for.
const TEXTS = 'https://just-read.invalid/saved/';

/**
 * The downloaded chapters, in a cache of the Cache API of their own (SAVED_CACHE), which the budgets of
 * what is read never trim. A picture is kept under its address (`keyOf` gives the form the platform's
 * reading looks it up by), so that the service worker on the web, and NativeImages in the app, find it there
 * first. `picture` gives the bytes of a picture: the copy kept while reading, else the network's.
 */
export class CacheShelf implements OfflineShelf {
  private readonly picture: (address: string) => Promise<Response>;
  private readonly keyOf: (address: string) => string;
  private readonly name: string;

  constructor(picture: (address: string) => Promise<Response>, keyOf: (address: string) => string = (address) => address, name = SAVED_CACHE) {
    this.picture = picture;
    this.keyOf = keyOf;
    this.name = name;
  }

  async keepPicture(address: string): Promise<number> {
    const cache = await caches.open(this.name);
    const key = this.keyOf(address);
    const had = await cache.match(key);
    if (had) return Number(had.headers.get(SIZE)) || (await had.blob()).size;
    const blob = await (await this.picture(address)).blob();
    await cache.put(key, new Response(blob, { headers: { 'content-type': blob.type, [SIZE]: String(blob.size) } }));
    return blob.size;
  }

  /** A kept picture, by the key its reading looks it up by. */
  async match(key: string): Promise<Response | undefined> {
    try {
      return await (await caches.open(this.name)).match(key);
    } catch {
      return undefined;
    }
  }

  async dropPictures(addresses: readonly string[]): Promise<void> {
    const cache = await caches.open(this.name);
    await Promise.all(addresses.map((address) => cache.delete(this.keyOf(address))));
  }

  async keepText(key: string, text: string): Promise<void> {
    await (await caches.open(this.name)).put(TEXTS + encodeURIComponent(key), new Response(text, { headers: { 'content-type': 'application/json' } }));
  }

  async text(key: string): Promise<string | null> {
    const kept = await (await caches.open(this.name)).match(TEXTS + encodeURIComponent(key));
    return kept ? kept.text() : null;
  }

  async dropText(key: string): Promise<void> {
    await (await caches.open(this.name)).delete(TEXTS + encodeURIComponent(key));
  }

  async persist(): Promise<boolean> {
    try {
      return (await navigator.storage?.persist?.()) ?? false;
    } catch {
      return false;
    }
  }
}
