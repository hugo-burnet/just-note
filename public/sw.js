// Service worker: the app opens offline, and what has been read stays readable.
//
//   app files      network first (always fresh online), cached copy when offline
//   /api/html      network first, cached copy when offline or when the source is down
//   /api/img       cache first, capped so the phone's storage is not eaten
const SHELL = 'jr-shell-v1';
const IMAGES = 'jr-img';
const PAGES = 'jr-api';
const MAX_IMAGES = 250;
const MAX_PAGES = 60;
const SHELL_TIMEOUT_MS = 4000;

// Kept in sync with public/ by test/shell.test.js.
const SHELL_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/app.css',
  'icons/apple-touch-icon.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon.svg',
  'js/api.js',
  'js/app.js',
  'js/catalog.js',
  'js/i18n.js',
  'js/router.js',
  'js/sources/common.js',
  'js/sources/fanfox.js',
  'js/sources/index.js',
  'js/sources/unpack.js',
  'js/store.js',
  'js/ui.js',
  'js/views/browse.js',
  'js/views/home.js',
  'js/views/reader.js',
  'js/views/series.js',
  'js/views/settings.js',
];

// Every navigation (including "/?url=…" from the share sheet) gets the same page.
const INDEX = new Request('index.html');

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL)
      .then((cache) => cache.addAll(SHELL_FILES))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const name of await caches.keys()) {
        if (name.startsWith('jr-shell-') && name !== SHELL) await caches.delete(name);
      }
      await self.clients.claim();
    })(),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== location.origin) return;

  if (url.pathname.endsWith('/api/img')) {
    event.respondWith(cacheFirst(request, IMAGES, MAX_IMAGES));
  } else if (url.pathname.endsWith('/api/html')) {
    // nocache=1: a one-off answer (it carries a token), not worth a place in the cache.
    if (!url.searchParams.has('nocache')) {
      event.respondWith(networkFirst(request, PAGES, { limit: MAX_PAGES, staleOnServerError: true }));
    }
  } else if (url.pathname.includes('/api/')) {
    // health checks and the like: never cached
  } else if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request, SHELL, { key: INDEX, timeout: SHELL_TIMEOUT_MS }));
  } else {
    event.respondWith(networkFirst(request, SHELL, { timeout: SHELL_TIMEOUT_MS }));
  }
});

function fetchWithin(request, timeout) {
  if (!timeout) return fetch(request);
  return fetch(request, { signal: AbortSignal.timeout(timeout) });
}

async function networkFirst(request, cacheName, { key = request, timeout = 0, limit = 0, staleOnServerError = false } = {}) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetchWithin(request, timeout);
    if (response.ok) {
      await cache.put(key, response.clone());
      if (limit) trim(cache, limit);
      return response;
    }
    if (staleOnServerError && response.status >= 500) {
      const stale = await cache.match(key);
      if (stale) return stale;
    }
    return response;
  } catch (err) {
    const cached = await cache.match(key);
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request, cacheName, limit) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone()).then(() => trim(cache, limit));
  return response;
}

// Oldest entries first: Cache.keys() lists them in insertion order.
async function trim(cache, limit) {
  const keys = await cache.keys();
  for (const key of keys.slice(0, Math.max(0, keys.length - limit))) await cache.delete(key);
}
