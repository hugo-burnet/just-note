import assert from 'node:assert/strict';
import { request } from 'node:http';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { createApiHandler } from '../server/handler.js';
import { createAppServer } from '../server/node.js';

const PNG = Buffer.from('89504e470d0a1a0a', 'hex');
let server;
let base;
let port;

before(async () => {
  const dir = await mkdtemp(join(tmpdir(), 'just-read-'));
  const publicDir = join(dir, 'public');
  await mkdir(join(publicDir, 'icons'), { recursive: true });
  await writeFile(join(publicDir, 'index.html'), '<!doctype html><title>t</title>');
  await writeFile(join(publicDir, 'sw.js'), 'self.skipWaiting();');
  await writeFile(join(publicDir, 'icons', 'a.png'), PNG);
  await writeFile(join(dir, 'secret.txt'), 'top secret');

  const fetch = async () => new Response(PNG, { headers: { 'content-type': 'image/png' } });
  server = createAppServer({ publicDir, api: createApiHandler({ fetch }) });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  port = server.address().port;
  base = `http://127.0.0.1:${port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));

// node:http lets us send the raw request target, fetch() would normalise it.
function raw(path, method = 'GET') {
  return new Promise((resolve, reject) => {
    request({ host: '127.0.0.1', port, path, method }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks) }));
    })
      .on('error', reject)
      .end();
  });
}

test('serves the app with a strict CSP and revalidation', async () => {
  const res = await fetch(`${base}/`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^text\/html/);
  assert.match(res.headers.get('content-security-policy'), /script-src 'self'/);
  assert.equal(res.headers.get('cache-control'), 'no-cache');
  const etag = res.headers.get('etag');
  assert.ok(etag);

  const again = await fetch(`${base}/`, { headers: { 'if-none-match': etag } });
  assert.equal(again.status, 304);
});

test('serves the service worker and icons with sensible types and caching', async () => {
  const sw = await fetch(`${base}/sw.js`);
  assert.match(sw.headers.get('content-type'), /^text\/javascript/);
  const icon = await fetch(`${base}/icons/a.png`);
  assert.equal(icon.headers.get('content-type'), 'image/png');
  assert.equal(icon.headers.get('cache-control'), 'public, max-age=86400');
});

test('404 for unknown files, 405 for other methods, HEAD has no body', async () => {
  assert.equal((await fetch(`${base}/missing.js`)).status, 404);
  assert.equal((await raw('/', 'POST')).status, 405);
  const head = await raw('/', 'HEAD');
  assert.equal(head.status, 200);
  assert.equal(head.body.length, 0);
});

test('cannot escape the public directory', async () => {
  for (const path of ['/../secret.txt', '/%2e%2e/secret.txt', '/..%2fsecret.txt', '/icons/..%2f..%2fsecret.txt', '/%00']) {
    const res = await raw(path);
    assert.ok([400, 403, 404].includes(res.status), `${path} -> ${res.status}`);
    assert.doesNotMatch(res.body.toString(), /top secret/);
  }
  assert.equal((await raw('//evil.example/x')).status, 400);
});

test('mounts the API next to the static files', async () => {
  const health = await fetch(`${base}/api/health`);
  assert.deepEqual(await health.json(), { ok: true });

  const res = await fetch(`${base}/api/img?u=${encodeURIComponent('https://fanfox.net/x.png')}`);
  assert.equal(res.headers.get('content-type'), 'image/png');
  assert.deepEqual(Buffer.from(await res.arrayBuffer()), PNG);
});
