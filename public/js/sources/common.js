// Small helpers shared by the source adapters.

// `code` is stable and drives the message shown to the user; `debug` is what
// "copy details" puts on the clipboard when a site changes under our feet.
export class SourceError extends Error {
  constructor(code, message, debug = {}) {
    super(message);
    this.name = 'SourceError';
    this.code = code;
    this.debug = debug;
  }
}

export const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

// Resolves `href` against `base`; null for anything that is not an http(s) URL.
export function absolute(href, base) {
  if (!href) return null;
  try {
    const url = new URL(href, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

// Anti-bot interstitials answer 200 with a page that has none of our content.
// Only used to pick a better error once the content turned out to be missing.
export const looksBlocked = (html) =>
  /<title>\s*(just a moment|attention required)|cf-browser-verification|id=["']challenge-form/i.test(html);

// Like Promise.all(items.map(fn)) but with at most `limit` calls in flight, and
// no new call once one has failed.
export async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  let failed = false;
  async function worker() {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index], index);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
