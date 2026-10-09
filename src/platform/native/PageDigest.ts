/** What was fetched, and how. */
export interface DigestSource {
  /** `webview`: the phone's own network was turned away by an anti-bot check and a WebView got the page. */
  readonly via: 'phone' | 'webview';
  /** What the phone's own network was answered. */
  readonly status: number;
  readonly url: string;
  readonly body: string;
  /** What the phone's own network was answered when it brought the cookie the WebView earned ("200", "403, the check again"). */
  readonly withCookie?: string;
  /** What the page asked for while it loaded ("GET https://…"): where a reader gets its pictures from. */
  readonly requests?: readonly string[];
  /** The ones the site answered with an error ("403 https://…"). */
  readonly failures?: readonly string[];
}

// The report is pasted into a message from a phone, so it stays near ten thousand characters
// whatever the page: it says where to look instead of quoting the page.
const WIDTH = 220;
const MAX_SHAPES = 14;
const EXAMPLES = 2;
const EXAMPLE_CHARS = 70;
const WINDOWS = 4;
const BEFORE = 120;
const AFTER = 480;
const MAX_OWN_REQUESTS = 14;
const MAX_OTHER_REQUESTS = 5;
const MAX_FAILURES = 10;
const REQUEST_CHARS = 100;
const SYNOPSIS_CHARS = 40;
const MAX_SCRIPTS = 12;
const MAX_INLINE = 6;
const INLINE_CHARS = 160;
const MAX_PICTURES = 15;
const MAX_TAGS = 4;
const TAG_CHARS = 200;
const BODY_CHARS = 1200;
const NOT_A_PAGE = '(not a page)';

const unique = <T>(values: Iterable<T>): T[] => [...new Set(values)];
const captures = (text: string, pattern: RegExp): string[] => [...text.matchAll(pattern)].map((match) => match[1] ?? '').filter(Boolean);
const clip = (text: string, limit: number): string => (text.length > limit ? `${text.slice(0, limit)}…` : text);
const count = (html: string, tag: string): number => (html.match(new RegExp(`<${tag}\\b`, 'gi')) ?? []).length;

/** The text cut into lines a phone's screen can show, keeping the lines it had. */
function fold(text: string): string[] {
  return text.split('\n').flatMap((line) => {
    const rows: string[] = [];
    for (let at = 0; at === 0 || at < line.length; at += WIDTH) rows.push(line.slice(at, at + WIDTH));
    return rows;
  });
}

function metaContent(html: string, name: string): string {
  for (const tag of html.match(/<meta\b[^>]*>/gi) ?? []) {
    if (new RegExp(`(?:name|property)=["']${name}["']`, 'i').test(tag)) return /content=["']([^"']*)["']/i.exec(tag)?.[1] ?? '';
  }
  return '';
}

/** Which kind of page a link leads to: its host if it has one, and its first folder with the numbers taken out. */
function shapeOf(href: string): string {
  if (/^(?:#|javascript:|mailto:|tel:|data:)/i.test(href)) return NOT_A_PAGE;
  let url: URL;
  try {
    url = new URL(href, 'https://relative.invalid/');
  } catch {
    return NOT_A_PAGE;
  }
  const host = url.hostname === 'relative.invalid' ? '' : url.hostname;
  const folder = (url.pathname.split('/')[1] ?? '').replace(/\d+/g, '#');
  return `${host}/${folder}${url.search ? '?…' : ''}`;
}

/** One request, by kind: its method, its host and its first two folders, without the numbers in them. */
function requestKind(request: string): { shape: string; host: string; address: string } {
  const [method = '', address = ''] = request.split(' ');
  try {
    const url = new URL(address);
    const folders = url.pathname.split('/').slice(1, 3).map((part) => part.replace(/\d+/g, '#'));
    return { shape: `${method} ${url.hostname}/${folders.join('/')}${url.search ? '?…' : ''}`, host: url.hostname, address };
  } catch {
    return { shape: request, host: '', address: request };
  }
}

/** The requests of a page by kind: the site's own first (which is where its data comes from), then the most numerous of the others (ads, statistics). */
function requestLines(requests: readonly string[], pageUrl: string): string[] {
  const site = new URL(pageUrl, 'https://relative.invalid/').hostname.split('.').slice(-2).join('.');
  const kinds = new Map<string, { host: string; members: string[] }>();
  for (const request of unique(requests)) {
    const { shape, host, address } = requestKind(request);
    const kind = kinds.get(shape) ?? { host, members: [] };
    kind.members.push(address);
    kinds.set(shape, kind);
  }
  const ranked = [...kinds].sort((a, b) => b[1].members.length - a[1].members.length || a[0].localeCompare(b[0]));
  const lines = (own: boolean, limit: number): string[] =>
    ranked
      .filter(([, kind]) => kind.host.endsWith(site) === own)
      .slice(0, limit)
      .map(([shape, kind]) => `${kind.members.length}x ${shape}   e.g. ${clip(kind.members[0] ?? '', REQUEST_CHARS)}`);
  return [...lines(true, MAX_OWN_REQUESTS), ...lines(false, MAX_OTHER_REQUESTS)];
}

/** The markup around the first place a pattern matches, which is how a piece of a page is laid out. */
function around(html: string, title: string, at: number): string[] {
  return at < 0 ? [] : [`--- markup around ${title}`, ...fold(html.slice(Math.max(0, at - BEFORE), at + AFTER))];
}

/**
 * A page as a short text to paste into a message: what it says of itself, which kinds of page it
 * links to (and the markup around the first link of the commonest kinds, which is how a list is
 * laid out), what it loads, the pictures it names (scripts included, where a reader often keeps
 * them) and where its body starts. Enough to write a module for a site without seeing it.
 */
export function digest(source: DigestSource): string {
  const html = source.body;
  const route = source.via === 'phone' ? "the phone's own network" : 'a WebView (the phone was turned away by an anti-bot check)';

  const hrefs = unique(captures(html, /href=["']([^"']*)["']/gi));
  const shapes = new Map<string, string[]>();
  for (const href of hrefs) {
    const key = shapeOf(href);
    shapes.set(key, [...(shapes.get(key) ?? []), href]);
  }
  const ranked = [...shapes].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const shapeLines = ranked.slice(0, MAX_SHAPES).map(([shape, members]) => {
    const examples = members.slice(0, EXAMPLES).map((member) => clip(member, EXAMPLE_CHARS));
    return `${members.length}x ${shape}   e.g. ${examples.join('  |  ')}`;
  });
  const windows = ranked
    .filter(([shape, members]) => members.length >= 2 && shape !== NOT_A_PAGE)
    .slice(0, WINDOWS)
    .flatMap(([shape, members]) => {
      const member = members[0] ?? '';
      return around(html, `the first ${shape} link`, Math.max(html.indexOf(`href="${member}"`), html.indexOf(`href='${member}'`)));
    });

  const external = unique(captures(html, /<script\b[^>]*\bsrc=["']([^"']+)["']/gi));
  const inline = [...html.matchAll(/<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((match) => (match[1] ?? '').trim().replace(/\s+/g, ' '))
    .filter((text) => text.length >= 40);

  // Scripts escape their slashes: https:\/\/host\/1.jpg.
  const pictures = unique(captures(html.replaceAll('\\/', '/'), /(https?:\/\/[^\s"'<>\\]+?\.(?:jpe?g|png|webp|gif|avif)(?:\?[^\s"'<>\\]*)?)/gi));
  const tags = html.match(/<img\b[^>]*>/gi) ?? [];
  const bodyAt = Math.max(0, html.search(/<body\b/i));
  const canonical = /<link\b[^>]*rel=["']canonical["'][^>]*>/i.exec(html)?.[0] ?? '';
  // A reader that builds its pages with scripts shows them as blob: pictures or canvases; the synopsis of a series is somewhere in the body.
  const ogDescription = metaContent(html, 'og:description');
  const synopsis = (ogDescription || metaContent(html, 'description')).slice(0, SYNOPSIS_CHARS).trim();
  const readerMarkup = [
    ...around(html, 'the first blob: picture', html.search(/<img\b[^>]*\bsrc=["']blob:/i)),
    ...around(html, 'the first <canvas>', html.search(/<canvas\b/i)),
    ...around(html, 'the text of the description', synopsis ? html.indexOf(synopsis, bodyAt) : -1),
  ];
  const blobs = tags.filter((tag) => /\bsrc=["']blob:/i.test(tag)).length;

  return [
    'Just Read page report',
    `via: ${route}`,
    `phone's own network answered: ${source.status}`,
    ...(source.withCookie ? [`with the cookie the WebView earned, it is answered: ${source.withCookie}`] : []),
    `address: ${source.url}`,
    `size: ${html.length} characters`,
    '--- head',
    `title: ${clip(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? '', 160)}`,
    `canonical: ${/href=["']([^"']*)["']/i.exec(canonical)?.[1] ?? ''}`,
    `og:title: ${clip(metaContent(html, 'og:title'), 160)}`,
    `og:image: ${metaContent(html, 'og:image')}`,
    `description: ${clip(metaContent(html, 'description'), 200)}`,
    ...(ogDescription ? [`og:description: ${clip(ogDescription, 200)}`] : []),
    `--- elements: a=${count(html, 'a')} img=${tags.length} blob-img=${blobs} canvas=${count(html, 'canvas')} iframe=${count(html, 'iframe')} video=${count(html, 'video')} form=${count(html, 'form')}`,
    `--- link shapes (${hrefs.length} links, ${shapes.size} shapes)`,
    ...shapeLines,
    ...windows,
    ...readerMarkup,
    `--- scripts (${external.length} external, ${inline.length} inline)`,
    ...external.slice(0, MAX_SCRIPTS),
    ...inline.slice(0, MAX_INLINE).map((text) => `inline: ${clip(text, INLINE_CHARS)}`),
    ...(source.requests ? [`--- requests the page made (${source.requests.length})`, ...requestLines(source.requests, source.url)] : []),
    ...(source.failures?.length ? [`--- answered with an error (${source.failures.length})`, ...source.failures.slice(0, MAX_FAILURES).map((failure) => clip(failure, REQUEST_CHARS + 20))] : []),
    `--- pictures named (${pictures.length})`,
    ...pictures.slice(0, MAX_PICTURES),
    `--- first <img> tags (${tags.length} in all)`,
    ...tags.slice(0, MAX_TAGS).map((tag) => clip(tag, TAG_CHARS)),
    `--- body, ${BODY_CHARS} characters from <body (folded at ${WIDTH})`,
    ...fold(html.slice(bodyAt, bodyAt + BODY_CHARS)),
  ].join('\n');
}
