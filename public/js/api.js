// Talks to the proxy (server/handler.js). Sources never call fetch themselves:
// they get `ctx` and go through it.
import { settings } from './store.js';

export class ApiError extends Error {
  constructor(code, message, extra = {}) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    Object.assign(this, extra);
  }
}

const base = () => settings.get().proxyBase.trim().replace(/\/+$/, '');

export const imageSrc = (url) => `${base()}/api/img?u=${encodeURIComponent(url)}`;

// `cache: false` marks an answer that is only good once (it carries a token):
// the service worker will not keep it for offline use.
export async function fetchText(url, { ref, cache = true, signal } = {}) {
  const query = new URLSearchParams({ u: url });
  if (ref) query.set('ref', ref);
  if (!cache) query.set('nocache', '1');

  let res;
  try {
    res = await fetch(`${base()}/api/html?${query}`, { signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(navigator.onLine === false ? 'offline' : 'network', 'Could not reach the proxy.');
  }
  if (!res.ok) {
    let body = {};
    try {
      body = await res.json();
    } catch {
      // Not our proxy: e.g. a static host answering 404 for /api/html.
    }
    const code = body.error ?? (res.status === 404 ? 'no_proxy' : 'proxy');
    throw new ApiError(code, body.message ?? `HTTP ${res.status}`, {
      status: res.status,
      upstreamStatus: body.upstreamStatus,
      host: body.host,
    });
  }
  return { text: await res.text(), url: res.headers.get('x-final-url') ?? url };
}

export const parseHtml = (html) => new DOMParser().parseFromString(html, 'text/html');

export async function checkProxy() {
  try {
    const res = await fetch(`${base()}/api/health`, { cache: 'no-store' });
    return res.ok && (await res.json()).ok === true;
  } catch {
    return false;
  }
}

export const ctx = { fetchText, parse: parseHtml };
