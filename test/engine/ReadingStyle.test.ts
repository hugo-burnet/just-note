import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReadingStyles } from '../../src/engine/index.ts';
import type { ReadingStyle } from '../../src/engine/index.ts';

const MANGA: ReadingStyle = { mode: 'paged', rtl: true };
const WEBTOON: ReadingStyle = { mode: 'scroll', rtl: false };

test('Auto reads the way the site wants', () => {
  const auto = { mode: 'auto', direction: 'auto' } as const;
  assert.deepEqual(ReadingStyles.resolve(auto, MANGA), MANGA);
  assert.deepEqual(ReadingStyles.resolve(auto, WEBTOON), WEBTOON);
});

test('what the user chose wins over the site, on every site', () => {
  const pages = { mode: 'paged', direction: 'ltr' } as const;
  assert.deepEqual(ReadingStyles.resolve(pages, MANGA), { mode: 'paged', rtl: false });
  assert.deepEqual(ReadingStyles.resolve(pages, WEBTOON), { mode: 'paged', rtl: false });
  const column = { mode: 'scroll', direction: 'rtl' } as const;
  assert.deepEqual(ReadingStyles.resolve(column, MANGA), { mode: 'scroll', rtl: true });
  assert.deepEqual(ReadingStyles.resolve(column, WEBTOON), { mode: 'scroll', rtl: true });
});

test('mode and direction are decided apart', () => {
  assert.deepEqual(ReadingStyles.resolve({ mode: 'auto', direction: 'ltr' }, MANGA), { mode: 'paged', rtl: false });
  assert.deepEqual(ReadingStyles.resolve({ mode: 'scroll', direction: 'auto' }, MANGA), { mode: 'scroll', rtl: true });
  assert.deepEqual(ReadingStyles.resolve({ mode: 'paged', direction: 'auto' }, WEBTOON), { mode: 'paged', rtl: false });
});
