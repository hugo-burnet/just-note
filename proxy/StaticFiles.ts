import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { HEADER_POLICY } from './ContentPolicy.ts';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

export const SECURITY_HEADERS: Record<string, string> = {
  'content-security-policy': HEADER_POLICY,
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
};

// Serves a built app (the Vite dist/ folder). Vite hashes the files it puts in
// assets/, so those can be cached for good; everything else is revalidated.
export class StaticFiles {
  private readonly root: string;
  private readonly cacheControl: string | undefined;

  /** `cacheControl` replaces the policy below for every file (a test uses it to behave like GitHub Pages). */
  constructor(directory: string, options: { cacheControl?: string } = {}) {
    this.root = normalize(directory.endsWith(sep) ? directory : directory + sep);
    this.cacheControl = options.cacheControl;
  }

  async serve(req: IncomingMessage, res: ServerResponse, pathname: string): Promise<void> {
    if (req.method !== 'GET' && req.method !== 'HEAD') return this.reject(res, 405, { allow: 'GET, HEAD' });
    let relative: string;
    try {
      relative = decodeURIComponent(pathname);
    } catch {
      return this.reject(res, 400);
    }
    if (relative.includes('\0')) return this.reject(res, 400);
    if (relative.endsWith('/')) relative += 'index.html';
    const file = normalize(join(this.root, relative));
    if (!file.startsWith(this.root)) return this.reject(res, 403);

    const info = await stat(file).catch(() => null);
    if (!info?.isFile()) return this.reject(res, 404, { 'content-type': 'text/plain; charset=utf-8' }, 'Not found');

    const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
    const immutable = file.startsWith(join(this.root, 'assets') + sep);
    const headers = {
      ...SECURITY_HEADERS,
      etag,
      'cache-control': this.cacheControl ?? (immutable ? 'public, max-age=31536000, immutable' : 'no-cache'),
    };
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, headers);
      res.end();
      return;
    }
    res.writeHead(200, {
      ...headers,
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'content-length': info.size,
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    const stream = createReadStream(file);
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  }

  private reject(res: ServerResponse, status: number, headers: Record<string, string> = {}, body = ''): void {
    res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
    res.end(body);
  }
}
