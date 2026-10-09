import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemonicScansUrls } from '../../src/engine/source/demonicscans/DemonicScansUrls.ts';

const SERIES = 'https://demonicscans.org/manga/The-Sergeant%2527s-Dragon';

test('a series is recognised however it was written, and keeps the site\'s spelling of its name, escapes and case included', () => {
  for (const input of [SERIES, `${SERIES}/`, 'http://www.demonicscans.org/manga/The-Sergeant%2527s-Dragon?x=1#top']) {
    assert.deepEqual(DemonicScansUrls.resolve(input), { kind: 'series', url: SERIES }, input);
  }
  assert.equal(DemonicScansUrls.nameOf(SERIES), "The Sergeant's Dragon");
  assert.equal(DemonicScansUrls.nameOf('https://demonicscans.org/manga/Revenge-of-the-Iron%252DBlooded-Sword-Hound'), 'Revenge of the Iron-Blooded Sword Hound');
});

test('a chapter pasted from the site is a chapter whose series is still to be found', () => {
  const pasted = 'https://demonicscans.org/title/Revenge-of-the-Iron%25252DBlooded-Sword-Hound/chapter/33/1';
  assert.deepEqual(DemonicScansUrls.resolve(pasted), { kind: 'chapter', url: pasted, key: 'c33' });
  assert.equal(DemonicScansUrls.resolve('https://demonicscans.org/title/Some-Name/chapter/12.5/9876/')?.key, 'c12.5');
  assert.equal(DemonicScansUrls.chapterNumber('c12.5'), 12.5);
  assert.ok(Number.isNaN(DemonicScansUrls.chapterNumber('nonsense')));
});

test('the address this source gives a chapter carries its series after a #, which the site is never asked for', () => {
  const page = 'https://demonicscans.org/title/The-Sergeant%252527s-Dragon/chapter/4/1';
  const chapter = DemonicScansUrls.chapter(page, SERIES);
  assert.equal(chapter, `${page}#/manga/The-Sergeant%2527s-Dragon`);
  assert.deepEqual(DemonicScansUrls.resolve(chapter ?? ''), { kind: 'chapter', url: chapter, key: 'c4', seriesUrl: SERIES });
  assert.equal(DemonicScansUrls.page(chapter ?? ''), page);
  assert.equal(DemonicScansUrls.chapter(SERIES, SERIES), null);
  assert.equal(DemonicScansUrls.chapter('https://example.com/title/X/chapter/1/1', SERIES), null);
});

test('only its own hosts, and anything else of the site is a list', () => {
  assert.equal(DemonicScansUrls.resolve('https://demonicscans.org.evil.com/manga/X'), null);
  assert.equal(DemonicScansUrls.resolve('https://evildemonicscans.org/manga/X'), null);
  assert.equal(DemonicScansUrls.resolve('not a link'), null);
  assert.deepEqual(DemonicScansUrls.resolve('https://demonicscans.org/lastupdates.php?list=2'), { kind: 'list', url: 'https://demonicscans.org/lastupdates.php?list=2' });
  assert.equal(DemonicScansUrls.search("sergeant's dragon"), 'https://demonicscans.org/search.php?manga=sergeant\'s%20dragon');
});
