import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { request } from 'node:http';
import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createAppServer } from '../../proxy/node.ts';
import { ProxyApi } from '../../proxy/ProxyApi.ts';
import { StaticFiles } from '../../proxy/StaticFiles.ts';

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
let server: Server;
let port: number;
let base: string;

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'just-read-'));
  const publicDir = join(dir, 'dist');
  await mkdir(join(publicDir, 'assets'), { recursive: true });
  await writeFile(join(publicDir, 'index.html'), '<!doctype html><title>t</title>');
  await writeFile(join(publicDir, 'sw.js'), 'self.skipWaiting();');
  await writeFile(join(publicDir, 'assets', 'index-abc123.js'), 'export {};');
  await writeFile(join(publicDir, 'assets', 'font.woff2'), PNG);
  await writeFile(join(dir, 'secret.txt'), 'top secret');

  const api = new ProxyApi({ fetch: async () => new Response(new Uint8Array(PNG), { headers: { 'content-type': 'image/png' } }) });
  server = createAppServer({ api, staticFiles: new StaticFiles(publicDir) });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = (server.address() as AddressInfo).port;
  base = `http://127.0.0.1:${port}`;
});

after(() => new Promise<void>((resolve) => server.close(() => resolve())));

interface Raw {
  status: number;
  headers: IncomingHttpHeaders;
  body: Buffer;
}

// node:http lets us send the raw request target, fetch() would normalise it.
function raw(path: string, method = 'GET'): Promise<Raw> {
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port, path, method }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
    })
      .on('error', reject)
      .end();
  });
}

test('serves the app with a strict CSP and revalidation', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') ?? '', /^text\/html/);
  assert.match(res.headers.get('content-security-policy') ?? '', /script-src 'self'/);
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  const etag = res.headers.get('etag');
  assert.ok(etag);
  assert.equal((await fetch(`${base}/`, { headers: { 'if-none-match': etag } })).status, 304);
});

test('hashed assets are cached for good, with the right types', async () => {
  const script = await fetch(`${base}/assets/index-abc123.js`);
  assert.match(script.headers.get('content-type') ?? '', /^text\/javascript/);
  assert.equal(script.headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal((await fetch(`${base}/assets/font.woff2`)).headers.get('content-type'), 'font/woff2');
  assert.match((await fetch(`${base}/sw.js`)).headers.get('content-type') ?? '', /^text\/javascript/);
});

test('404 for unknown files, 405 for other methods, HEAD has no body', async () => {
  assert.equal((await fetch(`${base}/missing.js`)).status, 404);
  assert.equal((await raw('/', 'POST')).status, 405);
  const head = await raw('/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
});

test('cannot escape the served directory', async () => {
  for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/assets/..%2f..%2fsecret.txt', '/%00']) {
    const res = await raw(path);
    assert.ok([400, 403, 404].includes(res.status), `${path} -> ${res.status}`);
    assert.doesNotMatch(res.body.toString(), /top secret/);
  }
  assert.equal((await raw('//evil.example/x')).status, 400);
});

test('mounts the API next to the static files', async () => {
  assert.deepEqual(await (await fetch(`${base}/api/health`)).json(), { ok: true });
  const res = await fetch(`${base}/api/img?u=${encodeURIComponent('https://fanfox.net/x.png')}`);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG);
});
