import assert from 'node:assert/strict';
import { test } from 'node:test';
import { CredentialJar } from '../../src/platform/native/CredentialJar.ts';
import type { FetchedPage } from '../../src/platform/native/PageFetcher.ts';

const shown = (url: string, cookies = 'cf_clearance=ok'): FetchedPage => ({ html: '', url, userAgent: 'webview', cookies });

test('jar: a host nothing was earned for has nothing to send', () => {
  assert.deepEqual(new CredentialJar().headersFor('m.example.test'), {});
});

test('jar: what the WebView earned goes with its User-Agent, for the hosts that turned the phone away and the one the WebView ended on', () => {
  const jar = new CredentialJar();
  jar.remember(shown('https://m.example.test/page'), 'www.example.test');
  const expected = { 'User-Agent': 'webview', Cookie: 'cf_clearance=ok' };
  assert.deepEqual(jar.headersFor('www.example.test'), expected);
  assert.deepEqual(jar.headersFor('m.example.test'), expected);
  assert.deepEqual(jar.headersFor('static.example.test'), {});
});

test('jar: a WebView that was given no cookie still lends its User-Agent, and no empty Cookie is sent', () => {
  const jar = new CredentialJar();
  jar.remember(shown('https://m.example.test/', ''), 'm.example.test');
  assert.deepEqual(jar.headersFor('m.example.test'), { 'User-Agent': 'webview' });
});

test('jar: each time something is remembered the version goes up, and the newest credentials replace the older', () => {
  const jar = new CredentialJar();
  assert.equal(jar.version, 0);
  jar.remember(shown('https://m.example.test/', 'a=1'), 'm.example.test');
  jar.remember(shown('https://m.example.test/', 'a=2'), 'm.example.test');
  assert.equal(jar.version, 2);
  assert.equal(jar.headersFor('m.example.test')['Cookie'], 'a=2');
});

test('jar: it can tell whether a host was earned for recently', () => {
  let now = 1_000;
  const jar = new CredentialJar(() => now);
  assert.equal(jar.earnedWithin('m.example.test', 60_000), false);
  jar.remember(shown('https://m.example.test/'), 'm.example.test');
  now += 59_999;
  assert.equal(jar.earnedWithin('m.example.test', 60_000), true);
  now += 1;
  assert.equal(jar.earnedWithin('m.example.test', 60_000), false);
});

test('jar: an address that is not one is not remembered under any host', () => {
  const jar = new CredentialJar();
  jar.remember(shown('not an address'));
  assert.deepEqual(jar.headersFor(''), {});
  assert.equal(jar.version, 1);
});
