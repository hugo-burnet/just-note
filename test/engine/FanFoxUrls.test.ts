import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FanFoxUrls } from '../../src/engine/source/fanfox/FanFoxUrls.ts';

const SERIES = 'https://fanfox.net/manga/moonlight_courier/';
const CHAPTER = 'https://fanfox.net/manga/moonlight_courier/c004/1.html';

test('a series, in any of the shapes people paste', () => {
  for (const input of [
    SERIES,
    'https://fanfox.net/manga/moonlight_courier',
    'https://m.fanfox.net/manga/moonlight_courier/',
    'http://www.fanfox.net/manga/moonlight_courier/',
    'https://mangafox.me/manga/moonlight_courier/',
  ]) {
    assert.deepEqual(FanFoxUrls.resolve(input), { kind: 'series', url: SERIES }, input);
  }
});

test('a chapter is canonicalised to its first page', () => {
  for (const input of [CHAPTER, 'https://fanfox.net/manga/moonlight_courier/c004/17.html', 'https://m.fanfox.net/manga/moonlight_courier/c004/']) {
    assert.deepEqual(FanFoxUrls.resolve(input), { kind: 'chapter', url: CHAPTER, key: 'c004', seriesUrl: SERIES }, input);
  }
  const volume = FanFoxUrls.resolve('https://fanfox.net/manga/moonlight_courier/v01/c003/2.html');
  assert.equal(volume?.url, 'https://fanfox.net/manga/moonlight_courier/v01/c003/1.html');
  assert.equal(volume?.key, 'v01/c003');
  assert.equal(FanFoxUrls.resolve('https://fanfox.net/manga/moonlight_courier/c003.5/1.html')?.key, 'c003.5');
});

test('other pages of the site are listings', () => {
  assert.deepEqual(FanFoxUrls.resolve('https://fanfox.net'), { kind: 'list', url: 'https://fanfox.net/' });
  assert.deepEqual(FanFoxUrls.resolve('https://m.fanfox.net/directory/?rating'), { kind: 'list', url: 'https://fanfox.net/directory/?rating' });
  assert.equal(FanFoxUrls.resolve(FanFoxUrls.search('moon & stars'))?.kind, 'list');
  assert.equal(FanFoxUrls.search('moon & stars'), 'https://fanfox.net/search?title=moon%20%26%20stars');
});

test('other sites, and look-alikes, are not ours', () => {
  for (const input of [
    'https://example.com/manga/moonlight_courier/',
    'https://evilfanfox.net/manga/moonlight_courier/',
    'https://fanfox.net.evil.com/manga/moonlight_courier/',
    'javascript:alert(1)',
    'not a url',
  ]) {
    assert.equal(FanFoxUrls.resolve(input), null, input);
  }
});

test('chapter numbers come from the key', () => {
  assert.equal(FanFoxUrls.chapterNumber('c012'), 12);
  assert.equal(FanFoxUrls.chapterNumber('v01/c003.5'), 3.5);
  assert.ok(Number.isNaN(FanFoxUrls.chapterNumber('extra')));
});
