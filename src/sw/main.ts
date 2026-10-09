import { IMAGE_CACHE, PAGE_CACHE, SAVED_CACHE, SHELL_PREFIX } from '../platform/web/cacheNames.ts';
import { FetchRouter } from './FetchRouter.ts';
import { ShellCache } from './ShellCache.ts';

// The service worker: the app opens offline, and what has been read stays readable.
// Vite's build puts in the list of the app's files and the name of this build (scripts/vite/serviceWorker.ts).
declare const self: ServiceWorkerGlobalScope;
declare const __PRECACHE__: readonly string[];
declare const __SHELL__: string;

const { scope } = self.registration;
const shell = new ShellCache(__SHELL__, SHELL_PREFIX, __PRECACHE__.map((file) => new URL(file, scope).href));
const router = new FetchRouter({ scope, shellCache: shell.name, imageCache: IMAGE_CACHE, pageCache: PAGE_CACHE, savedCache: SAVED_CACHE });

self.addEventListener('install', (event) => {
  event.waitUntil(shell.install().then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(shell.dropOld().then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const strategy = router.strategyFor(event.request);
  if (strategy) event.respondWith(strategy.handle(event.request));
});
