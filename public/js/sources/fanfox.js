// FanFox (a.k.a. MangaFox). Written to survive redesigns: URLs and <meta>
// tags are trusted before CSS class names, and every page layout we know of
// for chapters is tried in turn.
import { absolute, clean, looksBlocked, mapLimit, SourceError } from './common.js';
import { unpackAll } from './unpack.js';

const ORIGIN = 'https://fanfox.net';
const HOSTS = ['fanfox.net', 'mangafox.me', 'mangafox.la'];
const PAGE_FETCHES_IN_FLIGHT = 6;

// /manga/<slug>/                       a series
// /manga/<slug>/[v01/]c001[.5]/1.html  a chapter, at a given page
const SERIES_PATH = /^\/manga\/([^/]+)\/?$/;
const CHAPTER_PATH = /^\/manga\/([^/]+)\/((?:v[^/]+\/)?c\d[^/]*)\/(?:\d+\.html)?$/;

const isOwnHost = (host) => HOSTS.some((h) => host === h || host.endsWith(`.${h}`));

// Tells what a URL points at, and gives it a canonical form (one host, one
// page per chapter) so the same thing is never stored twice.
function resolve(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    return null;
  }
  if (!/^https?:$/.test(url.protocol) || !isOwnHost(url.hostname)) return null;

  const chapter = CHAPTER_PATH.exec(url.pathname);
  if (chapter) {
    const [, slug, key] = chapter;
    return {
      kind: 'chapter',
      url: `${ORIGIN}/manga/${slug}/${key}/1.html`,
      key,
      seriesUrl: `${ORIGIN}/manga/${slug}/`,
    };
  }
  const series = SERIES_PATH.exec(url.pathname);
  if (series) return { kind: 'series', url: `${ORIGIN}/manga/${series[1]}/` };
  // The home page, a directory, a search... anything that lists series.
  return { kind: 'list', url: ORIGIN + url.pathname + url.search };
}

const searchUrl = (query) => `${ORIGIN}/search?title=${encodeURIComponent(query)}`;

const meta = (doc, name) =>
  doc.querySelector(`meta[property="${name}"], meta[name="${name}"]`)?.getAttribute('content') ?? '';

// ---- series ---------------------------------------------------------------

function seriesTitle(doc) {
  const heading =
    clean(doc.querySelector('.detail-info-right-title-font')?.textContent) || clean(doc.querySelector('h1')?.textContent);
  if (heading) return heading;
  // "Some Title Manga - Read Some Title Online For Free - Fan Fox"
  const raw = clean(meta(doc, 'og:title') || doc.querySelector('title')?.textContent);
  return raw.split(' - ')[0].replace(/\s+(manga|manhwa|manhua)$/i, '');
}

function seriesDescription(doc) {
  const text =
    clean(doc.querySelector('p.fullcontent')?.textContent) ||
    clean(doc.querySelector('.detail-info-right-content')?.textContent) ||
    clean(meta(doc, 'og:description') || meta(doc, 'description'));
  return text.replace(/\s*show (more|less)$/i, '');
}

function chapterNumber(key) {
  return Number(/c(\d+(?:\.\d+)?)/.exec(key)?.[1] ?? NaN);
}

function collectChapters(doc, seriesUrl) {
  const found = new Map();
  for (const link of doc.querySelectorAll('a[href]')) {
    const target = resolve(absolute(link.getAttribute('href'), seriesUrl) ?? '');
    if (target?.kind !== 'chapter' || target.seriesUrl !== seriesUrl || found.has(target.url)) continue;
    const number = chapterNumber(target.key);
    found.set(target.url, {
      url: target.url,
      key: target.key,
      number,
      title:
        clean(link.querySelector('.title3')?.textContent) ||
        clean(link.getAttribute('title') || link.textContent) ||
        `Chapter ${number}`,
      date: clean(link.querySelector('.title2')?.textContent),
    });
  }
  // The site lists the newest first; we hand back oldest first.
  const chapters = [...found.values()].reverse();
  if (chapters.every((c) => Number.isFinite(c.number))) chapters.sort((a, b) => a.number - b.number);
  return chapters;
}

async function getSeries(url, ctx) {
  const { text } = await ctx.fetchText(url);
  const doc = ctx.parse(text);
  const chapters = collectChapters(doc, url);
  if (!chapters.length) {
    throw new SourceError(looksBlocked(text) ? 'blocked' : 'no_chapters', 'No chapters found on the series page.', {
      url,
      htmlLength: text.length,
      pageTitle: clean(doc.querySelector('title')?.textContent),
    });
  }
  const coverSrc = doc.querySelector('img.detail-info-cover-img')?.getAttribute('src') || meta(doc, 'og:image');
  return {
    url,
    title: seriesTitle(doc) || url,
    cover: absolute(coverSrc, url),
    author: [...doc.querySelectorAll('.detail-info-right-say a')].map((a) => clean(a.textContent)).filter(Boolean).join(', '),
    status: clean(doc.querySelector('.detail-info-right-title-tip')?.textContent),
    genres: [...doc.querySelectorAll('.detail-info-right-tag-list a')].map((a) => clean(a.textContent)).filter(Boolean),
    description: seriesDescription(doc),
    chapters,
  };
}

// ---- lists (home page, directory, search results) -------------------------

function coverOf(element) {
  const img = element?.querySelector('img');
  if (!img) return null;
  for (const name of ['data-original', 'data-src', 'src']) {
    const value = img.getAttribute(name);
    if (value && !value.startsWith('data:')) return value;
  }
  return null;
}

function collectSeries(doc, pageUrl) {
  const found = new Map();
  for (const link of doc.querySelectorAll('a[href]')) {
    const target = resolve(absolute(link.getAttribute('href'), pageUrl) ?? '');
    if (target?.kind !== 'series') continue;
    // A card usually has one link around the cover and another around the title.
    const entry = found.get(target.url) ?? { url: target.url, title: '', cover: null };
    entry.title ||= clean(link.getAttribute('title') || link.querySelector('img')?.getAttribute('alt') || link.textContent).slice(0, 120);
    entry.cover ||= absolute(coverOf(link) ?? coverOf(link.closest('li, article')), pageUrl);
    found.set(target.url, entry);
  }
  return [...found.values()].filter((entry) => entry.title);
}

async function getList(url, ctx) {
  const { text } = await ctx.fetchText(url);
  const items = collectSeries(ctx.parse(text), url);
  if (!items.length && looksBlocked(text)) {
    throw new SourceError('blocked', 'The site asked for a human check.', { url, htmlLength: text.length });
  }
  return items;
}

// ---- chapter pages --------------------------------------------------------

const absoluteImage = (src) => (src.startsWith('//') ? `https:${src}` : src.replace(/^http:/, 'https:'));
const quoted = (list) => [...list.matchAll(/'([^']*)'|"([^"]*)"/g)].map((m) => m[1] ?? m[2]);

// Layout A: the whole chapter is listed in a packed inline script (newImgs=[...]).
function pagesFromInlineScript(html) {
  for (const code of unpackAll(html)) {
    const list = /newImgs\s*=\s*\[([^\]]*)\]/.exec(code)?.[1];
    if (list) return quoted(list).map(absoluteImage);
  }
  return [];
}

// Layout B: the page only knows the chapter id and how many pages it has; each
// image URL comes from chapterfun.ashx, itself a packed script.
function legacyChapterInfo(doc, html) {
  const chapterId = /\bchapterid\s*=\s*(\d+)/i.exec(html)?.[1];
  let count = Number(/\bimagecount\s*=\s*(\d+)/i.exec(html)?.[1]);
  if (!count) {
    count = Math.max(0, ...[...doc.querySelectorAll('.pager-list-left a[data-page]')].map((a) => Number(a.getAttribute('data-page')) || 0));
  }
  const key = doc.querySelector('#dm5_key')?.getAttribute('value') ?? '';
  return chapterId && count ? { chapterId, count, key } : null;
}

async function legacyPage(chapterUrl, info, page, ctx) {
  const endpoint = new URL('chapterfun.ashx', chapterUrl);
  endpoint.search = new URLSearchParams({ cid: info.chapterId, page: String(page), key: info.key }).toString();
  const { text } = await ctx.fetchText(endpoint.href, { ref: chapterUrl, cache: false });
  const code = unpackAll(text)[0] ?? text;
  const base = /\bpix\s*=\s*["']([^"']+)["']/.exec(code)?.[1];
  const first = /\bpvalue\s*=\s*\[\s*["']([^"']+)["']/.exec(code)?.[1];
  if (!base || !first) {
    throw new SourceError('no_pages', `Page ${page} did not contain an image address.`, {
      url: endpoint.href,
      responseLength: text.length,
    });
  }
  return absoluteImage(base + first);
}

async function getChapter(url, ctx) {
  const { text } = await ctx.fetchText(url);

  const inline = pagesFromInlineScript(text);
  if (inline.length) return { pages: inline };

  const info = legacyChapterInfo(ctx.parse(text), text);
  if (info) {
    const numbers = Array.from({ length: info.count }, (_, i) => i + 1);
    return { pages: await mapLimit(numbers, PAGE_FETCHES_IN_FLIGHT, (page) => legacyPage(url, info, page, ctx)) };
  }

  throw new SourceError(looksBlocked(text) ? 'blocked' : 'no_pages', 'No pages found in the chapter.', {
    url,
    htmlLength: text.length,
  });
}

export default {
  id: 'fanfox',
  name: 'FanFox',
  home: `${ORIGIN}/`,
  resolve,
  searchUrl,
  getSeries,
  getList,
  getChapter,
};
