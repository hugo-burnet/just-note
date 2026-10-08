export const clean = (value: string | null | undefined): string => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Resolves `href` against `base`; null for anything that is not an http(s) address. */
export function absolute(href: string | null | undefined, base: string): string | null {
  if (!href) return null;
  try {
    const url = new URL(href, base);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

/** Same address, https, and no "//host" shorthand: what an image loader wants. */
export const secure = (src: string): string => (src.startsWith('//') ? `https:${src}` : src.replace(/^http:/, 'https:'));

/**
 * Anti-bot interstitials answer 200 with a page that has none of our content.
 * Only used to pick a better error once the content turned out to be missing.
 */
export const looksBlocked = (html: string): boolean =>
  /<title>\s*(just a moment|attention required)|cf-browser-verification|id=["']challenge-form/i.test(html);

/**
 * Like Promise.all(items.map(fn)) with at most `limit` calls in flight, and no
 * new call once one has failed.
 */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let failed = false;
  async function worker(): Promise<void> {
    while (!failed && next < items.length) {
      const index = next++;
      try {
        results[index] = await fn(items[index] as T, index);
      } catch (err) {
        failed = true;
        throw err;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
