import { MAX_IMAGES, MAX_PAGES, MAX_IMAGE_BYTES, MAX_PAGE_BYTES } from '../platform/web/cacheNames.ts';
import { CacheBudget } from './CacheBudget.ts';
import { CacheFirst } from './CacheFirst.ts';
import { NetworkFirst } from './NetworkFirst.ts';
import { ProxiedImages } from './ProxiedImages.ts';
import type { Strategy } from './Strategy.ts';

const SHELL_TIMEOUT_MS = 4000;

export interface RouterOptions {
  /** Where the worker lives: the origin and the folder the app is served from. */
  readonly scope: string;
  readonly shellCache: string;
  readonly imageCache: string;
  readonly pageCache: string;
  /** The downloaded chapters (see CacheShelf): their pictures are served from there first. */
  readonly savedCache: string;
}

/** Decides, for each request the app makes, how it is answered. */
export class FetchRouter {
  private readonly origin: string;
  private readonly images: Strategy;
  private readonly pages: Strategy;
  private readonly navigations: Strategy;
  private readonly files: Strategy;
  private readonly hashed: Strategy;

  constructor(options: RouterOptions) {
    this.origin = new URL(options.scope).origin;
    const shell = options.shellCache;
    this.images = new ProxiedImages(options.imageCache, new CacheBudget(MAX_IMAGES, MAX_IMAGE_BYTES), options.savedCache);
    // nocache=1 never gets here: a one-off answer (it carries a token) is not worth keeping.
    this.pages = new NetworkFirst({ cacheName: options.pageCache, budget: new CacheBudget(MAX_PAGES, MAX_PAGE_BYTES), staleOnServerError: true });
    // Every page of the app is the same document, including "/?url=…" from the share sheet.
    this.navigations = new NetworkFirst({ cacheName: shell, key: new Request(new URL('index.html', options.scope)), timeoutMs: SHELL_TIMEOUT_MS, revalidate: true });
    this.files = new NetworkFirst({ cacheName: shell, timeoutMs: SHELL_TIMEOUT_MS, revalidate: true });
    this.hashed = new CacheFirst(shell);
  }

  /** null: the browser deals with the request as it would without a worker. */
  strategyFor(request: Request): Strategy | null {
    if (request.method !== 'GET') return null;
    const url = new URL(request.url);
    // The proxy may live on another origin (GitHub Pages): its answers are ours to keep, whatever the origin.
    // A picture being downloaded goes to the network as it is: the page keeps it itself.
    if (url.pathname.endsWith('/api/img')) return url.searchParams.has('saved') ? null : this.images;
    if (url.pathname.endsWith('/api/html')) return url.searchParams.has('nocache') ? null : this.pages;
    if (url.pathname.includes('/api/') || url.origin !== this.origin) return null;
    if (request.mode === 'navigate') return this.navigations;
    return url.pathname.includes('/assets/') ? this.hashed : this.files;
  }
}
