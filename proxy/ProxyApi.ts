// The API, written with the Fetch API only (Request / Response) so the same code
// runs under Node (proxy/node.ts), Cloudflare Workers (proxy/worker.ts), Deno...
//
//   GET /api/html?u=<url>[&ref=<url>]  upstream text, served as text/plain
//   GET /api/img?u=<url>               upstream image, streamed
//   GET /api/health
//
// Why a proxy at all: a browser is not allowed to read another site's pages
// (CORS) and image CDNs refuse requests that do not carry the site's Referer.
import { capStream, readText } from './bodies.ts';
import { HostPolicy } from './HostPolicy.ts';
import { ProxyError } from './ProxyError.ts';
import { UpstreamClient } from './UpstreamClient.ts';
import type { FetchFunction } from './UpstreamClient.ts';

export interface ProxyOptions {
  policy?: HostPolicy;
  fetch?: FetchFunction;
  /** The origin allowed to call the API from a browser. null: same origin only. */
  corsOrigin?: string | null;
}

const MAX_HTML_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
// Raster formats only: an SVG served from our own origin could run scripts.
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export class ProxyApi {
  private readonly upstream: UpstreamClient;
  private readonly corsOrigin: string | null;

  constructor(options: ProxyOptions = {}) {
    this.upstream = new UpstreamClient(options.policy ?? new HostPolicy(), options.fetch);
    this.corsOrigin = options.corsOrigin ?? null;
  }

  // Returns null for anything that is not an /api/ route, so that callers can
  // fall through to their static files.
  async handle(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/api/')) return null;
    try {
      return this.decorate(await this.route(request, url));
    } catch (err) {
      if (err instanceof ProxyError) {
        return this.decorate(json({ error: err.code, message: err.message, ...err.extra }, err.status));
      }
      console.error('proxy error:', err);
      return this.decorate(json({ error: 'internal', message: 'Unexpected proxy error.' }, 500));
    }
  }

  private async route(request: Request, url: URL): Promise<Response> {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (request.method !== 'GET') throw new ProxyError(405, 'method_not_allowed', 'Use GET.');
    switch (url.pathname) {
      case '/api/health':
        return json({ ok: true });
      case '/api/html':
        return this.html(url.searchParams);
      case '/api/img':
        return this.image(url.searchParams);
      default:
        throw new ProxyError(404, 'not_found', 'Unknown API route.');
    }
  }

  private async html(params: URLSearchParams): Promise<Response> {
    const { res, url } = await this.upstream.get(params, 'text/html,application/xhtml+xml,text/javascript,*/*;q=0.8');
    if (!res.ok) {
      await res.body?.cancel();
      throw ProxyError.upstreamStatus(res.status);
    }
    let text: string;
    try {
      text = await readText(res, MAX_HTML_BYTES);
    } catch (err) {
      if (err instanceof ProxyError) throw err;
      throw new ProxyError(502, 'upstream_unreachable', 'The connection to the source was interrupted.');
    }
    // text/plain on purpose: navigating to this address must never render the page.
    return new Response(text, {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-final-url': url.href },
    });
  }

  private async image(params: URLSearchParams): Promise<Response> {
    const { res } = await this.upstream.get(params, 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8');
    if (!res.ok) {
      await res.body?.cancel();
      throw ProxyError.upstreamStatus(res.status);
    }
    const type = (res.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
    if (!IMAGE_TYPES.has(type)) {
      await res.body?.cancel();
      throw new ProxyError(502, 'not_an_image', 'The source did not return an image.');
    }
    const length = Number(res.headers.get('content-length'));
    if (length > MAX_IMAGE_BYTES) {
      await res.body?.cancel();
      throw ProxyError.tooLarge();
    }
    const headers: Record<string, string> = { 'content-type': type, 'cache-control': 'public, max-age=604800' };
    // The length of a compressed body is not the length we stream.
    if (length && !res.headers.has('content-encoding')) headers['content-length'] = String(length);
    return new Response(res.body && capStream(res.body, MAX_IMAGE_BYTES), { headers });
  }

  private decorate(res: Response): Response {
    const headers = new Headers(res.headers);
    headers.set('x-content-type-options', 'nosniff');
    headers.set('content-security-policy', "default-src 'none'; sandbox");
    if (this.corsOrigin) {
      headers.set('access-control-allow-origin', this.corsOrigin);
      headers.set('access-control-expose-headers', 'x-final-url');
      headers.set('access-control-allow-methods', 'GET, OPTIONS');
      if (this.corsOrigin !== '*') headers.append('vary', 'origin');
    }
    return new Response(res.body, { status: res.status, headers });
  }
}
