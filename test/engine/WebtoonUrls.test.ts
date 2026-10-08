import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WebtoonUrls } from '../../src/engine/source/webtoon/WebtoonUrls.ts';
import { episodeUrl, SERIES_URL } from '../pretend/webtoonPages.ts';

test('a series, whatever tracking or page comes with it', () => {
  for (const input of [
    SERIES_URL,
    `${SERIES_URL}&page=3`,
    'https://m.webtoons.com/en/fantasy/lantern-keeper/list?title_no=5001&utm_source=share',
    'http://www.webtoons.com/en/fantasy/lantern-keeper/list?title_no=5001',
  ]) {
    assert.deepEqual(WebtoonUrls.resolve(input), { kind: 'series', url: SERIES_URL }, input);
  }
});

test('an episode keeps its path and loses the tracking; its series is worked out', () => {
  const target = WebtoonUrls.resolve(`${episodeUrl(12)}&tracking=list`);
  assert.deepEqual(target, { kind: 'chapter', url: episodeUrl(12), key: 'e12', seriesUrl: SERIES_URL });

  const short = WebtoonUrls.resolve('https://www.webtoons.com/fr/fantasy/lantern-keeper/viewer?title_no=5001&episode_no=4');
  assert.equal(short?.kind, 'chapter');
  assert.equal(short?.seriesUrl, 'https://www.webtoons.com/fr/fantasy/lantern-keeper/list?title_no=5001');
});

test('other pages of the site are listings, and bad numbers do not make a series', () => {
  assert.deepEqual(WebtoonUrls.resolve('https://www.webtoons.com/en/'), { kind: 'list', url: 'https://www.webtoons.com/en/' });
  assert.equal(WebtoonUrls.resolve('https://www.webtoons.com/en/genres/fantasy')?.kind, 'list');
  assert.equal(WebtoonUrls.resolve(WebtoonUrls.search('en', 'moon light'))?.kind, 'list');
  assert.equal(WebtoonUrls.resolve('https://www.webtoons.com/en/fantasy/lantern-keeper/list?title_no=abc')?.kind, 'list');
  assert.equal(WebtoonUrls.resolve('https://www.webtoons.com/en/fantasy/lantern-keeper/viewer?title_no=5001')?.kind, 'list');
});

test('other sites, and look-alikes, are not ours', () => {
  for (const input of [
    'https://example.com/en/fantasy/lantern-keeper/list?title_no=5001',
    'https://evilwebtoons.com/en/fantasy/x/list?title_no=1',
    'https://webtoons.com.evil.example/en/',
    'javascript:alert(1)',
    'not a url',
  ]) {
    assert.equal(WebtoonUrls.resolve(input), null, input);
  }
});

test('addresses of the site in a given language', () => {
  assert.equal(WebtoonUrls.home('fr'), 'https://www.webtoons.com/fr/');
  assert.equal(WebtoonUrls.search('fr', 'tour & dieu'), 'https://www.webtoons.com/fr/search?keyword=tour%20%26%20dieu');
  assert.equal(WebtoonUrls.listPage(SERIES_URL, 2), `${SERIES_URL}&page=2`);
  assert.equal(WebtoonUrls.listPage(`${SERIES_URL}&page=2`, 5), `${SERIES_URL}&page=5`);
  assert.equal(WebtoonUrls.titleNumber(SERIES_URL), '5001');
  assert.equal(WebtoonUrls.episodeNumber(episodeUrl(7)), 7);
  assert.equal(WebtoonUrls.episodeNumber(SERIES_URL), null);
});
