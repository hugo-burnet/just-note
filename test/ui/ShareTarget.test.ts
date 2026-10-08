import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ShareTarget } from '../../src/ui/core/ShareTarget.ts';

test('share target: each field the sharing app may use is a candidate, in order', () => {
  const search = `?title=${encodeURIComponent('A read')}&text=${encodeURIComponent('look https://fanfox.net/manga/x/')}&url=${encodeURIComponent('https://fanfox.net/manga/y/')}`;
  assert.deepEqual(ShareTarget.candidates(search), ['https://fanfox.net/manga/y/', 'look https://fanfox.net/manga/x/', 'A read']);
});

test('share target: nothing shared, nothing to open', () => {
  assert.deepEqual(ShareTarget.candidates(''), []);
  assert.deepEqual(ShareTarget.candidates('?other=1'), []);
  assert.deepEqual(ShareTarget.candidates('?url=&text=%20%20'), []);
});
