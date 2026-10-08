// Portable API: only uses the Fetch API (Request / Response), so the same
// handler runs under Node (server/node.js), Cloudflare Workers, Deno or Bun.
//
//   GET /api/html?u=<url>[&ref=<url>]  upstream text, served as text/plain
//   GET /api/img?u=<url>               upstream image, streamed
//   GET /api/health
//
// Why a proxy at all: browsers refuse to read other sites' pages (CORS) and the
// image CDNs of manga sites check the Referer. It is not an open proxy: every
// hop, redirects included, must belong to an allowed host.
import { SITES, siteFor } from './hosts.js';

const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 30_000;
const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
// Raster formats only: an SVG served from our own origin could run scripts.
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

class ProxyError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const upstreamStatus = (status) =>
  new ProxyError(502, 'upstream_status', `The source answered ${status}.`, { upstreamStatus: status });

const tooLarge = () => new ProxyError(502, 'too_large', 'The source sent more data than allowed.');

export function createApiHandler({ fetch: upstreamFetch = globalThis.fetch, sites = SITES, corsOrigin = null } = {}) {
  function parseTarget(value) {
    let url;
    try {
      url = new URL(value);
    } catch {
      throw new ProxyError(400, 'bad_url', 'Missing or invalid "u" parameter.');
    }
    if (url.protocol === 'http:') url.protocol = 'https:';
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
      throw new ProxyError(400, 'bad_url', 'Only plain https URLs are supported.');
    }
    const site = siteFor(url.hostname, sites);
    if (!site) {
      throw new ProxyError(403, 'host_not_allowed', `The proxy does not allow ${url.hostname}.`, {
        host: url.hostname,
      });
    }
    return { url, site };
  }

  // The Referer a client asks for must itself be an allowed host.
  function refererFrom(value) {
    if (!value) return undefined;
    try {
      return parseTarget(value).url.href;
    } catch {
      return undefined;
    }
  }

  async function fetchUpstream(params, accept) {
    let { url, site } = parseTarget(params.get('u'));
    const referer = refererFrom(params.get('ref'));
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let res;
      try {
        res = await upstreamFetch(url.href, {
          redirect: 'manual',
          headers: {
            'user-agent': USER_AGENT,
            accept,
            'accept-language': 'en-US,en;q=0.9',
            referer: referer ?? site.referer,
          },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      } catch (err) {
        if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
          throw new ProxyError(504, 'timeout', 'The source did not answer in time.');
        }
        throw new ProxyError(502, 'upstream_unreachable', 'Could not reach the source.');
      }
      const location = res.headers.get('location');
      if (res.status >= 300 && res.status < 400 && location) {
        await res.body?.cancel();
        let next;
        try {
          next = new URL(location, url).href;
        } catch {
          throw new ProxyError(502, 'upstream_unreachable', 'The source sent an invalid redirect.');
        }
        ({ url, site } = parseTarget(next));
        continue;
      }
      return { res, url };
    }
    throw new ProxyError(508, 'too_many_redirects', 'The source redirected too many times.');
  }

  async function proxyHtml(params) {
    const { res, url } = await fetchUpstream(params, 'text/html,application/xhtml+xml,text/javascript,*/*;q=0.8');
    if (!res.ok) {
      await res.body?.cancel();
      throw upstreamStatus(res.status);
    }
    let text;
    try {
      text = await readText(res, MAX_HTML_BYTES);
    } catch (err) {
      if (err instanceof ProxyError) throw err;
      throw new ProxyError(502, 'upstream_unreachable', 'The connection to the source was interrupted.');
    }
    // text/plain on purpose: navigating to this URL must never render the page.
    return new Response(text, {
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
        'x-final-url': url.href,
      },
    });
  }

  async function proxyImage(params) {
    const { res } = await fetchUpstream(params, 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8');
    if (!res.ok) {
      await res.body?.cancel();
      throw upstreamStatus(res.status);
    }
    const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    if (!IMAGE_TYPES.has(type)) {
      await res.body?.cancel();
      throw new ProxyError(502, 'not_an_image', 'The source did not return an image.');
    }
    const length = Number(res.headers.get('content-length'));
    if (length > MAX_IMAGE_BYTES) {
      await res.body?.cancel();
      throw tooLarge();
    }
    const headers = { 'content-type': type, 'cache-control': 'public, max-age=604800' };
    // The length of a compressed body is not the length we stream.
    if (length && !res.headers.has('content-encoding')) headers['content-length'] = String(length);
    return new Response(res.body && capStream(res.body, MAX_IMAGE_BYTES), { headers });
  }

  async function route(request, url) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (request.method !== 'GET') throw new ProxyError(405, 'method_not_allowed', 'Use GET.');
    switch (url.pathname) {
      case '/api/health':
        return json({ ok: true });
      case '/api/html':
        return proxyHtml(url.searchParams);
      case '/api/img':
        return proxyImage(url.searchParams);
      default:
        throw new ProxyError(404, 'not_found', 'Unknown API route.');
    }
  }

  function withCommonHeaders(res) {
    const headers = new Headers(res.headers);
    headers.set('x-content-type-options', 'nosniff');
    headers.set('content-security-policy', "default-src 'none'; sandbox");
    if (corsOrigin) {
      headers.set('access-control-allow-origin', corsOrigin);
      headers.set('access-control-expose-headers', 'x-final-url');
      headers.set('access-control-allow-methods', 'GET, OPTIONS');
      if (corsOrigin !== '*') headers.append('vary', 'origin');
    }
    return new Response(res.body, { status: res.status, headers });
  }

  // Returns null for anything that is not an /api/ route, so callers can fall
  // through to their static files.
  return async function handle(request) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return null;
    try {
      return withCommonHeaders(await route(request, url));
    } catch (err) {
      if (err instanceof ProxyError) {
        return withCommonHeaders(json({ error: err.code, message: err.message, ...err.extra }, err.status));
      }
      console.error('proxy error:', err);
      return withCommonHeaders(json({ error: 'internal', message: 'Unexpected proxy error.' }, 500));
    }
  };
}

function charsetOf(res) {
  const match = /charset=([^;]+)/i.exec(res.headers.get('content-type') ?? '');
  return match ? match[1].trim().replace(/^["']|["']$/g, '') : 'utf-8';
}

async function readText(res, max) {
  if (Number(res.headers.get('content-length')) > max) throw tooLarge();
  const chunks = [];
  let size = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder(charsetOf(res)).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

// Enforces the size cap on the bytes actually streamed, whatever the headers said.
function capStream(body, max) {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > max) controller.error(new Error('image too large'));
        else controller.enqueue(chunk);
      },
    }),
  );
}
