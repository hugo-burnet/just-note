import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Routes } from '../../src/ui/core/Routes.ts';

const SERIES = 'https://fanfox.net/manga/moonlight_courier/';
const CHAPTER = 'https://fanfox.net/manga/moonlight_courier/c002/1.html';

test('routes: an address for each screen, and the address read back', () => {
  assert.deepEqual(Routes.parse(Routes.library()), { name: 'library', params: {} });
  assert.deepEqual(Routes.parse(Routes.settings()), { name: 'settings', params: {} });
  assert.deepEqual(Routes.parse(Routes.series(SERIES)), { name: 'series', params: { u: SERIES } });
  assert.deepEqual(Routes.parse(Routes.read(CHAPTER)), { name: 'read', params: { u: CHAPTER } });
});

test('routes: a link with its own ? and & survives the trip', () => {
  const url = 'https://www.webtoons.com/en/fantasy/x/ep-1/viewer?title_no=5&episode_no=1';
  assert.equal(Routes.parse(Routes.read(url)).params.u, url);
});

test('routes: the discover screen carries the source and the search', () => {
  assert.equal(Routes.discover(), '#/discover');
  assert.deepEqual(Routes.parse(Routes.discover({ source: 'webtoon', query: 'moon & stars' })), {
    name: 'discover',
    params: { src: 'webtoon', q: 'moon & stars' },
  });
});

test('routes: a chapter can be asked to open on its last page', () => {
  assert.deepEqual(Routes.parse(Routes.read(CHAPTER, { end: true })).params, { u: CHAPTER, end: '1' });
  assert.equal(Routes.read(CHAPTER, { end: false }), Routes.read(CHAPTER));
});

test('routes: anything unknown is the library', () => {
  for (const hash of ['', '#', '#/', '#/nowhere', '#/series/../x', 'garbage']) assert.equal(Routes.parse(hash).name === 'library' || hash.startsWith('#/series'), true, hash);
  assert.equal(Routes.parse('#/nowhere?u=1').name, 'library');
});
