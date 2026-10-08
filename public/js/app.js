import { setLanguage } from './i18n.js';
import { openLink, start } from './router.js';
import { settings } from './store.js';
import * as browse from './views/browse.js';
import * as home from './views/home.js';
import * as read from './views/reader.js';
import * as series from './views/series.js';
import * as settingsView from './views/settings.js';

function applySettings({ lang, theme }) {
  setLanguage(lang);
  if (theme === 'auto') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = theme;
}
applySettings(settings.get());
settings.subscribe(applySettings);

// "Share → Just Read" from the browser opens the app as /?url=…&text=…&title=…
// (Android puts the link in `text` more often than in `url`).
function takeSharedLink() {
  const params = new URLSearchParams(location.search);
  const fields = ['url', 'text', 'title'];
  if (!fields.some((name) => params.has(name))) return null;
  const shared = fields.map((name) => params.get(name)).find(Boolean) ?? null;
  history.replaceState(null, '', location.pathname + location.hash);
  return shared;
}
const shared = takeSharedLink();

start(document.getElementById('app'), { home, series, browse, read, settings: settingsView });
if (shared) openLink(shared); // after start(), so Back returns to the home page

if ('serviceWorker' in navigator) {
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => console.warn('service worker:', err));
  });
}
