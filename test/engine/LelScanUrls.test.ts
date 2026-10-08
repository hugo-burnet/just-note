import assert from 'node:assert/strict';
import { test } from 'node:test';
import { LelScanUrls } from '../../src/engine/source/lelscan/LelScanUrls.ts';

const SERIES = 'https://lelscans.net/lecture-en-ligne-lanterne-des-marees';

test('every spelling of a series address is the same series', () => {
  for (const spelling of [
    'https://lelscans.net/lecture-en-ligne-lanterne-des-marees',
    'https://lelscans.net/lecture-en-ligne-lanterne-des-marees.php',
    'https://lelscans.net/lecture-ligne-lanterne-des-marees',
    'https://lelscans.net/lecture-ligne-lanterne-des-marees.php',
    'http://www.lelscans.net/lecture-ligne-lanterne-des-marees.php?x=1#top',
    'https://LELSCANS.net/lecture-en-ligne-Lanterne-Des-Marees/',
  ]) {
    assert.deepEqual(LelScanUrls.resolve(spelling), { kind: 'series', url: SERIES }, spelling);
  }
});

test('a chapter is read from its first page, whichever page the link points at', () => {
  const expected = {
    kind: 'chapter',
    url: 'https://lelscans.net/scan-lanterne-des-marees/12',
    key: 'c12',
    seriesUrl: SERIES,
  };
  for (const link of [
    'https://lelscans.net/scan-lanterne-des-marees/12',
    'https://lelscans.net/scan-lanterne-des-marees/12/1',
    'https://lelscans.net/scan-lanterne-des-marees/12/7/',
    'http://www.lelscans.net/scan-lanterne-des-marees/12/3?utm=1',
  ]) {
    assert.deepEqual(LelScanUrls.resolve(link), expected, link);
  }
});

test('a chapter number may have a decimal part', () => {
  const half = LelScanUrls.resolve('https://lelscans.net/scan-lanterne-des-marees/2.5/4');
  assert.equal(half?.url, 'https://lelscans.net/scan-lanterne-des-marees/2.5');
  assert.equal(half?.key, 'c2.5');
  assert.equal(LelScanUrls.chapterNumber('c2.5'), 2.5);
  assert.equal(LelScanUrls.chapterNumber('c12'), 12);
  assert.ok(Number.isNaN(LelScanUrls.chapterNumber('e12')));
});

test('the home page, the generic reader and the like are lists, and what is not the site is nobody\'s', () => {
  assert.deepEqual(LelScanUrls.resolve('https://lelscans.net/'), { kind: 'list', url: 'https://lelscans.net/' });
  assert.equal(LelScanUrls.resolve('https://lelscans.net/lecture-en-ligne.php?mob=on')?.kind, 'list', 'no series in that address');
  assert.equal(LelScanUrls.resolve('https://lelscans.net/scan-lanterne-des-marees')?.kind, 'list', 'no chapter in that one');
  for (const foreign of ['https://example.com/scan-x/1', 'https://lelscans.net.evil.com/scan-x/1', 'https://evillelscans.net/scan-x/1', 'ftp://lelscans.net/scan-x/1', 'nonsense', '']) {
    assert.equal(LelScanUrls.resolve(foreign), null, foreign);
  }
});

test('the site has no search: the question travels in the address, to be answered from the list', () => {
  const address = LelScanUrls.search('jardin d\'horloge & co');
  assert.equal(LelScanUrls.queryOf(address), "jardin d'horloge & co");
  assert.equal(LelScanUrls.withoutQuery(address), 'https://lelscans.net/');
  assert.equal(LelScanUrls.queryOf('https://lelscans.net/'), null);
  assert.equal(LelScanUrls.resolve(address)?.kind, 'list');
  assert.equal(LelScanUrls.slugOf(SERIES), 'lanterne-des-marees');
  assert.equal(LelScanUrls.cover('lanterne-des-marees'), 'https://lelscans.net/mangas/lanterne-des-marees/thumb_cover.jpg');
});
