import { absolute, clean, secure } from '../../text.ts';

// Scripts escape their slashes: https:\/\/host\/1.jpg.
const NAMED = /https?:\/\/[^\s"'<>\\]+?\.(?:jpe?g|png|webp|avif|gif)(?:\?[^\s"'<>\\]*)?/gi;
// The places a reader's script keeps the list of the pictures, which a description of the page quotes.
const LISTING = /ts_reader|"images"\s*:|readerarea/i;

const unique = <T>(values: readonly T[]): T[] => [...new Set(values)];

/** Of a list of pictures found in a script, as the addresses they are written with. */
function addresses(items: readonly unknown[], pageUrl: string): string[] {
  const found = items.flatMap((item) => (typeof item === 'string' ? [absolute(item.trim(), pageUrl)] : []));
  return unique(found.flatMap((address) => (address ? [secure(address)] : [])));
}

/** The list the reader of the site is given: `"images":["https:\/\/c.example.net\/01.webp", ...]`, the first that has pictures in it. */
function listed(html: string, pageUrl: string): string[] {
  for (const match of html.matchAll(/"images"\s*:\s*(\[[^\]]*\])/g)) {
    try {
      const list: unknown = JSON.parse(match[1] ?? '');
      const pictures = Array.isArray(list) ? addresses(list, pageUrl) : [];
      if (pictures.length > 0) return pictures;
    } catch {
      // Not a list of strings: the next one.
    }
  }
  return [];
}

/**
 * Failing that list, the pictures a script names. The page names others (the site's logo, its icons, the cover of
 * the series): those of the chapter are together, in one folder, which the folders of the pictures of a chapter
 * (uploads97/) tell from the site's own (uploads/).
 */
function named(html: string, pageUrl: string): string[] {
  const all = addresses(html.replaceAll('\\/', '/').match(NAMED) ?? [], pageUrl);
  const folders = new Map<string, string[]>();
  for (const address of all) {
    const folder = address.slice(0, address.lastIndexOf('/'));
    folders.set(folder, [...(folders.get(folder) ?? []), address]);
  }
  const score = ([folder, members]: [string, string[]]): number => (/\/uploads\d+$/i.test(folder) ? 1000 : 0) + members.length;
  return [...folders].sort((a, b) => score(b) - score(a))[0]?.[1] ?? [];
}

/** The pictures of a chapter, in reading order, from its page. */
export function chapterPictures(html: string, pageUrl: string): string[] {
  const pictures = listed(html, pageUrl);
  return pictures.length > 0 ? pictures : named(html, pageUrl);
}

/** Where the page speaks of its reader, for the details of an error: what to look at when the list was not found. */
export function readerHint(html: string): string {
  const at = html.search(LISTING);
  return at < 0 ? '' : clean(html.slice(Math.max(0, at - 80), at + 360));
}
