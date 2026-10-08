import { readFile } from 'node:fs/promises';
import { DOMParser } from 'linkedom';

export const parse = (html) => new DOMParser().parseFromString(html, 'text/html');

export const fixture = (name) => readFile(new URL(`../fixtures/${name}`, import.meta.url), 'utf8');

// A ctx whose "network" is a table of url → text (or async function), which
// also records what the adapter asked for.
export function fakeCtx(routes) {
  const calls = [];
  return {
    calls,
    parse,
    async fetchText(url, options = {}) {
      calls.push({ url, ...options });
      const route = routes[url] ?? routes['*'];
      if (route === undefined) throw new Error(`unexpected fetch: ${url}`);
      const text = typeof route === 'function' ? await route(url, options) : route;
      return { text, url };
    },
  };
}
