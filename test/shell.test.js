import assert from 'node:assert/strict';
import { access, readdir, readFile } from 'node:fs/promises';
import { test } from 'node:test';

const PUBLIC = new URL('../public/', import.meta.url);

async function walk(dir = PUBLIC, prefix = '') {
  const files = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) files.push(...(await walk(new URL(`${entry.name}/`, dir), `${prefix}${entry.name}/`)));
    else files.push(prefix + entry.name);
  }
  return files;
}

const exists = (path) => access(new URL(path, PUBLIC)).then(() => true, () => false);

test('the service worker precaches exactly the files of public/ (plus the root)', async () => {
  const worker = await readFile(new URL('sw.js', PUBLIC), 'utf8');
  const list = /const SHELL_FILES = \[([\s\S]*?)\];/.exec(worker)[1];
  const listed = [...list.matchAll(/'([^']+)'/g)].map((m) => m[1]).filter((file) => file !== './');
  const onDisk = (await walk()).filter((file) => file !== 'sw.js');
  assert.deepEqual([...listed].sort(), onDisk.sort());
  assert.ok(list.includes("'./'"));
});

test('the manifest is installable and can receive shared links', async () => {
  const manifest = JSON.parse(await readFile(new URL('manifest.webmanifest', PUBLIC), 'utf8'));
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.name && manifest.short_name && manifest.start_url && manifest.scope);

  const sizes = manifest.icons.map((icon) => icon.sizes);
  assert.ok(sizes.includes('192x192') && sizes.includes('512x512'));
  assert.ok(manifest.icons.some((icon) => icon.purpose === 'maskable'));
  for (const icon of manifest.icons) assert.ok(await exists(icon.src), icon.src);

  assert.equal(manifest.share_target.method, 'GET');
  assert.deepEqual(manifest.share_target.params, { title: 'title', text: 'text', url: 'url' });
});

test('index.html points at files that exist', async () => {
  const html = await readFile(new URL('index.html', PUBLIC), 'utf8');
  for (const [, path] of html.matchAll(/(?:href|src)="([^":]+)"/g)) assert.ok(await exists(path), path);
  assert.match(html, /viewport-fit=cover/);
});

test('the app never runs site-provided code nor injects site-provided markup', async () => {
  const forbidden = /\beval\s*\(|new Function\s*\(|\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write/;
  for (const file of await walk()) {
    if (!file.endsWith('.js')) continue;
    const code = (await readFile(new URL(file, PUBLIC), 'utf8'))
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');
    assert.doesNotMatch(code, forbidden, file);
  }
});
