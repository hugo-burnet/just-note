import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CacheFirst } from '../../src/sw/CacheFirst.ts';
import { FetchRouter } from '../../src/sw/FetchRouter.ts';
import { NetworkFirst } from '../../src/sw/NetworkFirst.ts';
import { ProxiedImages } from '../../src/sw/ProxiedImages.ts';

const SCOPE = 'https://you.github.io/just-note/';
const router = new FetchRouter({ scope: SCOPE, shellCache: 'jr-shell-test', imageCache: 'jr-img', pageCache: 'jr-api', savedCache: 'jr-saved' });

// A navigation cannot be built with `new Request` (the browser alone makes those), so a stand-in will do.
const request = (url: string, extra: { method?: string; mode?: string } = {}): Request => ({ method: 'GET', mode: 'cors', url, ...extra }) as Request;

test('worker: images are kept whatever the proxy lives', () => {
  assert.ok(router.strategyFor(request('https://proxy.workers.dev/api/img?u=x')) instanceof ProxiedImages);
  assert.ok(router.strategyFor(request('https://you.github.io/api/img?u=x')) instanceof ProxiedImages);
});

test('worker: a picture being downloaded is left to the page, which keeps it itself', () => {
  assert.equal(router.strategyFor(request('https://proxy.workers.dev/api/img?u=x&saved=1')), null);
});

test('worker: pages are kept too, except the one-off answers', () => {
  assert.ok(router.strategyFor(request('https://proxy.workers.dev/api/html?u=x')) instanceof NetworkFirst);
  assert.equal(router.strategyFor(request('https://proxy.workers.dev/api/html?u=x&nocache=1')), null);
});

test('worker: health checks and other API calls are left alone', () => {
  assert.equal(router.strategyFor(request('https://proxy.workers.dev/api/health')), null);
  assert.equal(router.strategyFor(request(`${SCOPE}api/anything`)), null);
});

test('worker: only GET requests are answered', () => {
  assert.equal(router.strategyFor(request('https://proxy.workers.dev/api/img?u=x', { method: 'POST' })), null);
});

test('worker: the app opens from its own files; hashed ones are final', () => {
  assert.ok(router.strategyFor(request(`${SCOPE}?url=x`, { mode: 'navigate' })) instanceof NetworkFirst);
  assert.ok(router.strategyFor(request(`${SCOPE}assets/index-abc123.js`)) instanceof CacheFirst);
  assert.ok(router.strategyFor(request(`${SCOPE}manifest.webmanifest`)) instanceof NetworkFirst);
});

test('worker: other sites are not ours to keep', () => {
  assert.equal(router.strategyFor(request('https://fonts.example.com/font.woff2')), null);
});
