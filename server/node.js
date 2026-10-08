// Node entry: serves the PWA from public/ and mounts the API from handler.js.
//   npm start                      → http://127.0.0.1:8787 (this machine only)
//   PORT=8080 npm start            → listens on every interface: what hosts expect
//   HOST=127.0.0.1 PORT=8080 …     → keep it private even with PORT set
//   PROXY_EXTRA_HOSTS=cdn.example.com   more allowed hosts (see hosts.js)
//   CORS_ORIGIN=https://you.github.io   only if the PWA is hosted elsewhere
import { createReadStream } from 'node:fs';
import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createApiHandler } from './handler.js';
import { SITES, withExtraHosts } from './hosts.js';

const DEFAULT_PUBLIC_DIR = fileURLToPath(new URL('../public/', import.meta.url));

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

// The app never injects third-party markup, but it parses it: keep the policy tight.
const SECURITY_HEADERS = {
  'content-security-policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' https: data: blob:",
    "connect-src 'self' https:",
    "manifest-src 'self'",
    "worker-src 'self'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; '),
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
};

export function createAppServer({ publicDir = DEFAULT_PUBLIC_DIR, api = createApiHandler() } = {}) {
  const root = normalize(publicDir.endsWith(sep) ? publicDir : publicDir + sep);
  return createServer(async (req, res) => {
    try {
      if (!req.url.startsWith('/') || req.url.startsWith('//')) {
        res.writeHead(400);
        return res.end();
      }
      const request = new Request(new URL(req.url, 'http://localhost'), {
        method: req.method,
        headers: toHeaders(req.headers),
      });
      const apiResponse = await api(request);
      if (apiResponse) return await send(res, apiResponse);
      await serveStatic(req, res, new URL(request.url).pathname, root);
    } catch (err) {
      console.error(err);
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Internal error');
    }
  });
}

function toHeaders(raw) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(raw)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  return headers;
}

async function send(res, response) {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) return res.end();
  const stream = Readable.fromWeb(response.body);
  stream.on('error', () => res.destroy());
  // Stop downloading from the source as soon as the client goes away.
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}

async function serveStatic(req, res, pathname, root) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' });
    return res.end();
  }
  let relative;
  try {
    relative = decodeURIComponent(pathname);
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (relative.includes('\0')) {
    res.writeHead(400);
    return res.end();
  }
  if (relative.endsWith('/')) relative += 'index.html';
  const file = normalize(join(root, relative));
  if (!file.startsWith(root)) {
    res.writeHead(403);
    return res.end();
  }
  let info;
  try {
    info = await stat(file);
  } catch {
    info = null;
  }
  if (!info?.isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', ...SECURITY_HEADERS });
    return res.end('Not found');
  }
  const etag = `W/"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
  const headers = {
    ...SECURITY_HEADERS,
    etag,
    'cache-control': file.startsWith(join(root, 'icons') + sep) ? 'public, max-age=86400' : 'no-cache',
  };
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }
  res.writeHead(200, {
    ...headers,
    'content-type': MIME[extname(file)] ?? 'application/octet-stream',
    'content-length': info.size,
  });
  if (req.method === 'HEAD') return res.end();
  const stream = createReadStream(file);
  stream.on('error', () => res.destroy());
  stream.pipe(res);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sites = withExtraHosts(SITES, process.env.PROXY_EXTRA_HOSTS);
  const api = createApiHandler({ sites, corsOrigin: process.env.CORS_ORIGIN || null });
  const port = Number(process.env.PORT ?? 8787);
  // Hosting platforms hand us a PORT and need us to listen on every interface.
  const host = process.env.HOST ?? (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
  createAppServer({ api }).listen(port, host, () => {
    console.log(`Just Read is listening on http://${host}:${port}`);
  });
}
