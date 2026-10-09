/** What was fetched, and how. */
export interface DigestSource {
  /** `webview`: the phone's own network was turned away by an anti-bot check and a WebView got the page. */
  readonly via: 'phone' | 'webview';
  /** What the phone's own network was answered. */
  readonly status: number;
  readonly url: string;
  readonly body: string;
}

const MAX_LINKS = 150;
const MAX_SOURCES = 60;
const MAX_IMAGES = 80;
const WIDTH = 220;

const unique = (values: Iterable<string>, limit: number): string[] => [...new Set(values)].sort().slice(0, limit);
const first = (matches: Iterable<RegExpMatchArray>): string[] => [...matches].map((match) => match[1] ?? '').filter(Boolean);

function folded(text: string, lines: number): string[] {
  const out: string[] = [];
  for (const line of text.split('\n')) {
    for (let at = 0; at === 0 || at < line.length; at += WIDTH) out.push(line.slice(at, at + WIDTH));
    if (out.length >= lines) break;
  }
  return out.slice(0, lines);
}

/**
 * A page as a short text to paste into a message, in the shape of the Probe workflow's log: the
 * addresses it links to, the files it loads, the pictures it names (including in scripts, where
 * a reader often keeps them), and the first lines of its markup. Enough to write a module for a
 * site without seeing it.
 */
export function digest(source: DigestSource, lines = 120): string {
  const { body } = source;
  const links = unique(first(body.matchAll(/href=["']([^"']+)["']/gi)), MAX_LINKS);
  const sources = unique(first(body.matchAll(/(?:src|data-src|data-original|data-url)=["']([^"']+)["']/gi)), MAX_SOURCES);
  // Scripts escape their slashes: https:\/\/host\/1.jpg.
  const unescaped = body.replaceAll('\\/', '/');
  const images = unique(first(unescaped.matchAll(/(https?:\/\/[^\s"'<>\\]+?\.(?:jpe?g|png|webp|gif|avif)(?:\?[^\s"'<>\\]*)?)/gi)), MAX_IMAGES);
  const route = source.via === 'phone' ? "the phone's own network" : 'a WebView (the phone was turned away by an anti-bot check)';
  return [
    'Just Read page report',
    `via: ${route}`,
    `phone's own network answered: ${source.status}`,
    `address: ${source.url}`,
    `size: ${body.length} characters`,
    `--- links (${links.length})`,
    ...links,
    `--- sources (${sources.length})`,
    ...sources,
    `--- pictures named (${images.length})`,
    ...images,
    `--- body, first ${lines} lines (folded at ${WIDTH})`,
    ...folded(body, lines),
  ].join('\n');
}
