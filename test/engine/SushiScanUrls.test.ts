import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SushiScanUrls } from '../../src/engine/source/sushiscan/SushiScanUrls.ts';

const SERIES = 'https://sushiscan.net/catalogue/1-blue-lock/';

test('a series is recognised whatever the way it was written, and given the site\'s own spelling', () => {
  for (const input of ['https://sushiscan.net/catalogue/1-blue-lock/', 'https://sushiscan.net/catalogue/1-blue-lock', 'http://www.sushiscan.net/catalogue/1-blue-lock/?x=1#top']) {
    assert.deepEqual(SushiScanUrls.resolve(input), { kind: 'series', url: SERIES }, input);
  }
  assert.equal(SushiScanUrls.slugOf(SERIES), '1-blue-lock');
  assert.equal(SushiScanUrls.seriesAt('/catalogue/1-blue-lock'), SERIES);
  assert.equal(SushiScanUrls.seriesAt('/blue-lock-chapitre-345/'), null);
});

test('a chapter pasted from the site is a chapter whose series is still to be found', () => {
  assert.deepEqual(SushiScanUrls.resolve('https://sushiscan.net/blue-lock-chapitre-345/'), { kind: 'chapter', url: 'https://sushiscan.net/blue-lock-chapitre-345/', key: 'c345' });
  assert.deepEqual(SushiScanUrls.resolve('https://sushiscan.net/blue-lock-chapitre-345'), { kind: 'chapter', url: 'https://sushiscan.net/blue-lock-chapitre-345/', key: 'c345' });
});

test('an episode, an extra and a special have keys of their own, and a title when the page gives none', () => {
  assert.equal(SushiScanUrls.resolve('https://sushiscan.net/one-piece-episode-4/')?.key, 'e4');
  assert.equal(SushiScanUrls.resolve('https://sushiscan.net/one-piece-extra-1/')?.key, 'x1');
  assert.equal(SushiScanUrls.resolve('https://sushiscan.net/one-piece-special-2/')?.key, 's2');
  assert.equal(SushiScanUrls.resolve('https://sushiscan.net/one-piece-vol-7/')?.key, 'v7');
  assert.deepEqual(['c5', 'v3', 't2', 'e4', 'x1', 's2'].map(SushiScanUrls.titleOf), ['Chapitre 5', 'Volume 3', 'Tome 2', 'Épisode 4', 'Extra 1', 'Spécial 2']);
  assert.equal(SushiScanUrls.chapterSlugOf('https://sushiscan.net/blue-lock-chapitre-345/'), 'blue-lock');
  assert.equal(SushiScanUrls.chapterSlugOf('https://sushiscan.net/catalogue/blue-lock/'), '');
});

test('a half chapter, a volume and a tome have keys of their own', () => {
  assert.equal(SushiScanUrls.resolve('https://sushiscan.net/one-piece-chapitre-12-5/')?.key, 'c12.5');
  assert.equal(SushiScanUrls.resolve('https://sushiscan.net/one-piece-volume-3/')?.key, 'v3');
  assert.equal(SushiScanUrls.resolve('https://sushiscan.net/one-piece-tome-10/')?.key, 't10');
  assert.equal(SushiScanUrls.chapterNumber('c12.5'), 12.5);
  assert.equal(SushiScanUrls.chapterNumber('v3'), 3);
  assert.ok(Number.isNaN(SushiScanUrls.chapterNumber('nonsense')));
});

test('the address this source gives a chapter carries its series after a #, which stays through resolving again', () => {
  const url = SushiScanUrls.chapter('https://sushiscan.net/blue-lock-chapitre-345/', SERIES);
  assert.equal(url, 'https://sushiscan.net/blue-lock-chapitre-345/#/catalogue/1-blue-lock/');
  assert.deepEqual(SushiScanUrls.resolve(url ?? ''), { kind: 'chapter', url, key: 'c345', seriesUrl: SERIES });
  assert.equal(SushiScanUrls.page(url ?? ''), 'https://sushiscan.net/blue-lock-chapitre-345/');
  assert.equal(SushiScanUrls.chapter('https://elsewhere.test/blue-lock-chapitre-345/', SERIES), null);
  assert.equal(SushiScanUrls.chapter('https://sushiscan.net/genres/action/', SERIES), null);
});

test('the home page, the catalogue, a genre and a search are lists; what is not the site\'s is nobody\'s', () => {
  assert.deepEqual(SushiScanUrls.resolve('https://sushiscan.net/'), { kind: 'list', url: 'https://sushiscan.net/' });
  assert.deepEqual(SushiScanUrls.resolve('https://sushiscan.net/catalogue/?page=2'), { kind: 'list', url: 'https://sushiscan.net/catalogue/?page=2' });
  assert.deepEqual(SushiScanUrls.resolve('https://sushiscan.net/genres/action/'), { kind: 'list', url: 'https://sushiscan.net/genres/action/' });
  assert.deepEqual(SushiScanUrls.resolve(SushiScanUrls.search('blue lock')), { kind: 'list', url: 'https://sushiscan.net/?s=blue+lock' });
  for (const input of ['https://example.com/catalogue/x/', 'https://evilsushiscan.net/catalogue/x/', 'not an address', 'ftp://sushiscan.net/catalogue/x/']) {
    assert.equal(SushiScanUrls.resolve(input), null, input);
  }
});

test('a series whose name looks like a chapter is a series: only what is under /catalogue/ is', () => {
  assert.equal(SushiScanUrls.resolve('https://sushiscan.net/catalogue/blue-lock-chapitre-3/')?.kind, 'series');
});

test('a search is the words, joined with +, and the accents and the symbols spelled out', () => {
  assert.equal(SushiScanUrls.search('a b'), 'https://sushiscan.net/?s=a+b');
  assert.equal(SushiScanUrls.search('L\'attaque & co'), 'https://sushiscan.net/?s=L\'attaque+%26+co');
  assert.equal(SushiScanUrls.search('é'), 'https://sushiscan.net/?s=%C3%A9');
});
