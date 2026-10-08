import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { NetworkFirst } from '../../src/sw/NetworkFirst.ts';

// What a worker finds around it: a cache storage and fetch. Stand-ins record what is asked.
const stored = new Map<string, Response>();
const cache = {
  put: async (key: Request | string, response: Response) => void stored.set(typeof key === 'string' ? key : key.url, response),
  match: async (key: Request | string) => stored.get(typeof key === 'string' ? key : key.url)?.clone(),
  keys: async () => [],
  delete: async () => true,
};
let asked: Array<{ input: unknown; init: RequestInit | undefined }> = [];
let answer: () => Promise<Response> = async () => new Response('fresh');

Object.assign(globalThis, {
  caches: { open: async () => cache },
  fetch: async (input: unknown, init?: RequestInit) => {
    asked.push({ input, init });
    return answer();
  },
});

const page = new Request('https://you.github.io/just-note/');

beforeEach(() => {
  stored.clear();
  asked = [];
  answer = async () => new Response('fresh');
});

test('worker: the server is asked, not the copy the browser keeps, when the strategy says so', async () => {
  await new NetworkFirst({ cacheName: 'shell', revalidate: true, timeoutMs: 4000 }).handle(page);
  const [call] = asked;
  assert.equal(call?.input, page.url, 'the address, so that any navigation can be sent again');
  assert.equal(call?.init?.cache, 'no-cache');
  assert.ok(call?.init?.signal, 'and the wait is still limited');
});

test('worker: without it the request goes out as it came', async () => {
  await new NetworkFirst({ cacheName: 'api' }).handle(page);
  const [call] = asked;
  assert.equal(call?.input, page);
  assert.equal(call?.init?.cache, undefined);
});

test('worker: what was fetched is kept, and stands in when the network fails', async () => {
  const strategy = new NetworkFirst({ cacheName: 'shell', revalidate: true });
  assert.equal(await (await strategy.handle(page)).text(), 'fresh');
  answer = async () => Promise.reject(new TypeError('offline'));
  assert.equal(await (await strategy.handle(page)).text(), 'fresh', 'the copy kept last time');
});

test('worker: with no copy and no network the failure is not hidden', async () => {
  answer = async () => Promise.reject(new TypeError('offline'));
  await assert.rejects(new NetworkFirst({ cacheName: 'shell' }).handle(page), TypeError);
});
