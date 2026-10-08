// A source teaches the app one website. Adding a site means writing one module
// shaped like fanfox.js and listing it below (plus its hosts in server/hosts.js).
//
//   id, name, home
//   resolve(url)       → { kind: 'series' | 'chapter' | 'list', url, ... } | null
//   searchUrl(query)   → address of the site's search results (a 'list')
//   getSeries(url, ctx)  → { url, title, cover, author, status, genres, description,
//                            chapters: [{ url, key, number, title, date }] } (oldest first)
//   getList(url, ctx)    → [{ url, title, cover }]
//   getChapter(url, ctx) → { pages: [imageUrl] }
//
// ctx = { fetchText(url, { ref }) → { text, url }, parse(html) → Document }
import fanfox from './fanfox.js';

export const sources = [fanfox];

// Pulls the first link out of whatever was pasted or shared ("Title https://…").
export function extractUrl(input) {
  const text = String(input ?? '').trim();
  const link = /https?:\/\/[^\s<>"']+/i.exec(text);
  if (link) return link[0].replace(/[).,;]+$/, '');
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text)) return `https://${text}`;
  return null;
}

// → { source, kind, url, ... } for a link one of the sources understands, else null.
export function resolve(input) {
  const url = extractUrl(input);
  if (!url) return null;
  for (const source of sources) {
    const target = source.resolve(url);
    if (target) return { source, ...target };
  }
  return null;
}

export const sourceById = (id) => sources.find((source) => source.id === id) ?? null;
