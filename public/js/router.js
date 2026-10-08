// Hash routing (#/series?u=…) so the app works from any static path, with no
// server rewrite rules. Each view exports mount(root, params) and may return a
// cleanup function.
import { t } from './i18n.js';
import { resolve } from './sources/index.js';
import { errorBox, toast } from './ui.js';

export const hashFor = {
  home: () => '#/',
  series: (url) => `#/series?u=${encodeURIComponent(url)}`,
  read: (url) => `#/read?u=${encodeURIComponent(url)}`,
  browse: (url, q = '') => `#/browse?u=${encodeURIComponent(url)}${q ? `&q=${encodeURIComponent(q)}` : ''}`,
  settings: () => '#/settings',
};

const VIEW_FOR_KIND = { series: 'series', chapter: 'read', list: 'browse' };

export const go = (hash) => {
  location.hash = hash;
};

let rerender = () => {};

// Swaps the current page for another without adding a history entry (reading
// chapter after chapter must not make Back walk through every chapter).
// location.replace() would drop our entry numbering, hence replaceState.
export function replace(hash) {
  history.replaceState({ idx: history.state?.idx ?? 0 }, '', hash);
  rerender();
}

// For a view that finds, while mounting, that it cannot show anything.
export const redirect = (hash) => queueMicrotask(() => replace(hash));

// One step back when the previous page is part of this app, otherwise `fallback`.
export function back(fallback) {
  if ((history.state?.idx ?? 0) > 0) history.back();
  else replace(fallback);
}

// Tells the user and returns false when no source understands the link.
export function openLink(input) {
  const hit = resolve(input);
  if (!hit) {
    toast(t('home.unsupported'));
    return false;
  }
  go(hashFor[VIEW_FOR_KIND[hit.kind]](hit.url));
  return true;
}

export function start(root, views) {
  let cleanup = null;
  let counter = 0;
  let first = true;

  function render() {
    // Entries we pushed have no state yet: number them, so back() knows whether
    // there is an earlier page of the app to return to.
    const stored = history.state?.idx;
    if (stored === undefined) history.replaceState({ idx: first ? 0 : ++counter }, '');
    else counter = stored;
    first = false;

    const [path, query = ''] = (location.hash || '#/').slice(1).split('?');
    const view = views[path.replace(/^\//, '')] ?? views.home;

    cleanup?.();
    cleanup = null;
    root.replaceChildren();
    document.title = t('app.name');
    window.scrollTo(0, 0);
    try {
      cleanup = view.mount(root, Object.fromEntries(new URLSearchParams(query))) ?? null;
    } catch (err) {
      console.error(err);
      root.replaceChildren(errorBox(err));
    }
  }

  rerender = render;
  window.addEventListener('hashchange', render);
  render();
}
