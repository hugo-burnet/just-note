// Everything lives in localStorage, which is plenty for a personal library:
// chapters already read are kept as short keys ("c012"), not as URLs.
const KEY = { settings: 'jr:settings', library: 'jr:library', read: 'jr:read' };

export const DEFAULT_SETTINGS = {
  lang: 'auto', // auto | en | fr
  theme: 'auto', // auto | dark | light
  mode: 'scroll', // scroll | paged
  rtl: true, // paged mode: right to left, like a printed manga
  chapterOrder: 'desc', // desc: newest first
  proxyBase: '', // empty: same address as the app
};

function load(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key));
    return value && typeof value === 'object' ? value : {};
  } catch {
    return {};
  }
}

function save(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full: carry on, this session keeps working from memory.
  }
}

const state = { settings: load(KEY.settings), library: load(KEY.library), read: load(KEY.read) };
const listeners = new Set();

export const settings = {
  get: () => ({ ...DEFAULT_SETTINGS, ...state.settings }),
  set(patch) {
    state.settings = { ...state.settings, ...patch };
    save(KEY.settings, state.settings);
    for (const listener of listeners) listener(settings.get());
  },
  subscribe(listener) {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

// A library entry: { url, title, cover, addedAt, updatedAt, position? } where
// position is { chapter (url), key, title, page } — where the reader left off.
export const library = {
  list: () => Object.values(state.library).sort((a, b) => b.updatedAt - a.updatedAt),
  get: (url) => state.library[url] ?? null,
  // Adds the series, or refreshes what we know of it. Never touches the position.
  save(series) {
    const now = Date.now();
    const old = state.library[series.url];
    state.library[series.url] = {
      ...old,
      url: series.url,
      title: series.title,
      cover: series.cover,
      addedAt: old?.addedAt ?? now,
      updatedAt: old?.updatedAt ?? now,
    };
    save(KEY.library, state.library);
  },
  remove(url) {
    delete state.library[url];
    delete state.read[url];
    save(KEY.library, state.library);
    save(KEY.read, state.read);
  },
  clear() {
    state.library = {};
    state.read = {};
    save(KEY.library, state.library);
    save(KEY.read, state.read);
  },
};

export const progress = {
  get: (seriesUrl) => state.library[seriesUrl]?.position ?? null,
  set(seriesUrl, position) {
    const entry = state.library[seriesUrl];
    if (!entry) return;
    entry.position = position;
    entry.updatedAt = Date.now();
    save(KEY.library, state.library);
  },
  isRead: (seriesUrl, key) => state.read[seriesUrl]?.includes(key) ?? false,
  markRead(seriesUrl, key) {
    const keys = (state.read[seriesUrl] ??= []);
    if (keys.includes(key)) return;
    keys.push(key);
    save(KEY.read, state.read);
  },
};
