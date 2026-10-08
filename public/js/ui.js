// Small DOM helpers. The app never turns third-party text into markup: it builds
// elements and sets textContent, so a hostile page cannot inject anything.
import { imageSrc } from './api.js';
import { has, t } from './i18n.js';

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [name, value] of Object.entries(attrs ?? {})) {
    if (value == null || value === false) continue;
    if (name === 'class') el.className = value;
    else if (name === 'for') el.htmlFor = value;
    else if (name === 'dataset') Object.assign(el.dataset, value);
    else if (name.startsWith('on')) el.addEventListener(name.slice(2), value);
    else if (name in el && !name.includes('-')) el[name] = value;
    else el.setAttribute(name, value === true ? '' : value);
  }
  el.append(...children.flat().filter((child) => child != null && child !== false));
  return el;
}

// ---- icons ----------------------------------------------------------------

const ICONS = {
  chevronLeft: ['M15 18l-6-6 6-6'],
  chevronRight: ['M9 18l6-6-6-6'],
  arrowRight: ['M5 12h14', 'M13 6l6 6-6 6'],
  settings: ['M4 6h9', 'M17 6h3', 'M4 12h3', 'M11 12h9', 'M4 18h11', 'M19 18h1', 'M15 4a2 2 0 1 0 0 4a2 2 0 1 0 0-4z', 'M9 10a2 2 0 1 0 0 4a2 2 0 1 0 0-4z', 'M17 16a2 2 0 1 0 0 4a2 2 0 1 0 0-4z'],
  search: ['M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z', 'M21 21l-5.2-5.2'],
  trash: ['M4 7h16', 'M10 11v6', 'M14 11v6', 'M6 7l1 13h10l1-13', 'M9 7V4h6v3'],
  refresh: ['M20 11a8 8 0 1 0-2.3 5.7', 'M20 4v7h-7'],
  check: ['M5 12l5 5 9-10'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  sort: ['M7 4v16', 'M7 20l-3-3', 'M7 20l3-3', 'M17 20V4', 'M17 4l-3 3', 'M17 4l3 3'],
  compass: ['M12 3a9 9 0 1 0 0 18a9 9 0 1 0 0-18z', 'M15.5 8.5l-2 5-5 2 2-5z'],
  play: ['M8 5l11 7-11 7z'],
};

const SVG = 'http://www.w3.org/2000/svg';

export function icon(name, size = 22) {
  const svg = document.createElementNS(SVG, 'svg');
  const attrs = { viewBox: '0 0 24 24', width: size, height: size, fill: 'none', stroke: 'currentColor', 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' };
  for (const [key, value] of Object.entries(attrs)) svg.setAttribute(key, value);
  for (const d of ICONS[name]) {
    const path = document.createElementNS(SVG, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

// ---- small widgets --------------------------------------------------------

export function toast(message) {
  const host = document.getElementById('toasts');
  const el = h('div', { class: 'toast' }, message);
  host.append(el);
  setTimeout(() => el.classList.add('leaving'), 2600);
  setTimeout(() => el.remove(), 3000);
}

export const spinner = () => h('span', { class: 'spinner', role: 'progressbar', 'aria-label': '…' });

// options: [[value, label], …]
export function segmented(options, value, onChange, label) {
  const buttons = new Map();
  const group = h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label });
  const select = (next) => {
    for (const [val, button] of buttons) button.setAttribute('aria-checked', String(val === next));
  };
  for (const [val, text] of options) {
    const button = h('button', { type: 'button', role: 'radio', onclick: () => { select(val); onChange(val); } }, text);
    buttons.set(val, button);
    group.append(button);
  }
  select(value);
  return group;
}

export function topbar(title, { onBack, actions = [] } = {}) {
  return h('header', { class: 'topbar' },
    onBack && h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('reader.back'), onclick: onBack }, icon('chevronLeft')),
    h('h1', { class: 'topbar-title' }, title),
    h('div', { class: 'topbar-actions' }, ...actions),
  );
}

// A cover from a source, or the first letters of the title when there is none.
export function cover(url, title) {
  const initials = () => h('span', { class: 'cover cover-empty', 'aria-hidden': 'true' }, title.trim().slice(0, 2).toUpperCase());
  if (!url) return initials();
  const img = h('img', { class: 'cover', src: imageSrc(url), alt: '', loading: 'lazy', decoding: 'async' });
  // Cover addresses can expire: show the initials rather than an empty box.
  img.addEventListener('error', () => img.replaceWith(initials()), { once: true });
  return img;
}

// ---- errors ---------------------------------------------------------------

const ERROR_TEXT = {
  offline: 'offline',
  network: 'noProxy',
  no_proxy: 'noProxy',
  host_not_allowed: 'hostNotAllowed',
  timeout: 'timeout',
  blocked: 'blocked',
  no_chapters: 'layout',
  no_pages: 'layout',
  upstream_unreachable: 'unreachable',
  too_many_redirects: 'unreachable',
};

export function describeError(err) {
  let key = ERROR_TEXT[err?.code];
  if (err?.code === 'upstream_status') {
    const status = err.upstreamStatus;
    key = status === 403 || status === 503 ? 'refused' : status === 404 ? 'notFound' : 'upstream';
  }
  if (!key || !has(`error.${key}.title`)) key = 'generic';
  const params = { host: err?.host ?? '', status: err?.upstreamStatus ?? '' };
  return { title: t(`error.${key}.title`, params), hint: t(`error.${key}.hint`, params) };
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast(t('error.copied'));
  } catch {
    // No clipboard access: the details are right there in the <details> block.
  }
}

// What a user can paste back when a site changes under the adapter.
export function errorReport(err) {
  return JSON.stringify(
    {
      error: err?.name,
      code: err?.code,
      message: err?.message,
      status: err?.status,
      upstreamStatus: err?.upstreamStatus,
      host: err?.host,
      debug: err?.debug,
      page: location.hash,
      agent: navigator.userAgent,
      at: new Date().toISOString(),
    },
    null,
    2,
  );
}

export function errorBox(err, { retry } = {}) {
  const info = describeError(err);
  const report = errorReport(err);
  return h('div', { class: 'error-box', role: 'alert' },
    h('h2', {}, info.title),
    h('p', {}, info.hint),
    h('div', { class: 'row' },
      retry && h('button', { class: 'btn btn-primary', type: 'button', onclick: retry }, t('error.retry')),
      h('button', { class: 'btn', type: 'button', onclick: () => copy(report) }, t('error.copy'))),
    h('details', {}, h('summary', {}, t('error.details')), h('pre', {}, report)),
  );
}
