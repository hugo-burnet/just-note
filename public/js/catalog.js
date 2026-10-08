// What the views ask for. Answers are remembered for a few minutes so that
// going back and forth (series → chapter → series) does not hit the site again.
import { ctx } from './api.js';
import { library } from './store.js';

const TTL = 5 * 60_000;
const caches = { series: new Map(), chapter: new Map(), list: new Map() };

function remember(cache, key, load) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.promise;
  const promise = load();
  cache.set(key, { at: Date.now(), promise });
  promise.catch(() => cache.delete(key));
  return promise;
}

// Looking at a series puts it in the library, even when the answer comes from
// memory: a series removed a minute ago comes back when it is opened again.
export async function loadSeries(source, url, { fresh = false } = {}) {
  if (fresh) caches.series.delete(url);
  const series = await remember(caches.series, url, () => source.getSeries(url, ctx));
  library.save(series);
  return series;
}

export const loadChapter = (source, url) => remember(caches.chapter, url, () => source.getChapter(url, ctx));

export const loadList = (source, url) => remember(caches.list, url, () => source.getList(url, ctx));
