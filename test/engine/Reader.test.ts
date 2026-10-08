import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ReaderGestures, ReaderSession } from '../../src/engine/index.ts';
import type { ChapterRef } from '../../src/engine/index.ts';

const chapter = (key: string): ChapterRef => ({ url: `https://site.test/${key}`, key, title: key });

const session = (options: { pageCount?: number; startPage?: number; previous?: boolean; next?: boolean } = {}) =>
  new ReaderSession({
    pageCount: options.pageCount ?? 10,
    startPage: options.startPage,
    previous: options.previous ? chapter('c1') : null,
    next: options.next ? chapter('c3') : null,
  });

test('starts where asked, kept inside the chapter', () => {
  assert.equal(session({ startPage: 4 }).page, 4);
  assert.equal(session({ startPage: 99 }).page, 9);
  assert.equal(session({ startPage: -3 }).page, 0);
  assert.equal(session({ startPage: Number.NaN }).page, 0);
  assert.equal(session({ pageCount: 0 }).page, 0);
});

test('stepping moves by one page and, at the ends, says where to go', () => {
  const middle = session({ startPage: 4, previous: true, next: true });
  assert.equal(middle.step(1), 'moved');
  assert.equal(middle.page, 5);
  assert.equal(middle.step(-1), 'moved');

  const last = session({ startPage: 9, next: true });
  assert.equal(last.step(1), 'next-chapter');
  assert.equal(last.page, 9, 'the page does not change, the view navigates');
  assert.equal(session({ startPage: 9 }).step(1), 'end');

  assert.equal(session({ previous: true }).step(-1), 'previous-chapter');
  assert.equal(session().step(-1), 'start');
});

test('goTo clamps and says whether anything changed', () => {
  const reading = session({ startPage: 2 });
  assert.equal(reading.goTo(2), false);
  assert.equal(reading.goTo(5), true);
  assert.equal(reading.goTo(500), true);
  assert.equal(reading.page, 9);
});

test('the chapter counts as read on its last page; progress goes from 0 to 1', () => {
  const reading = session({ pageCount: 5 });
  assert.equal(reading.isLast, false);
  assert.equal(reading.progress, 0);
  reading.goTo(2);
  assert.equal(reading.progress, 0.5);
  reading.goTo(4);
  assert.equal(reading.isLast, true);
  assert.equal(reading.progress, 1);
  assert.equal(session({ pageCount: 1 }).isLast, true);
});

test('the next chapter is warmed up once, from 60% on, and only if there is one', () => {
  const reading = session({ pageCount: 10, next: true });
  assert.equal(reading.takePrefetch(), false);
  reading.goTo(6);
  assert.equal(reading.takePrefetch(), true);
  assert.equal(reading.takePrefetch(), false);

  const lastChapter = session({ pageCount: 10, startPage: 9 });
  assert.equal(lastChapter.takePrefetch(), false);
});

test('taps: the edges turn pages in the direction of reading, the middle shows the controls', () => {
  assert.equal(ReaderGestures.tap(0.1, false), 'backward');
  assert.equal(ReaderGestures.tap(0.9, false), 'forward');
  assert.equal(ReaderGestures.tap(0.1, true), 'forward');
  assert.equal(ReaderGestures.tap(0.9, true), 'backward');
  for (const rtl of [false, true]) assert.equal(ReaderGestures.tap(0.5, rtl), 'toggle');
});

test('keys follow the direction of reading, and others are ignored', () => {
  assert.equal(ReaderGestures.key('ArrowRight', false), 'forward');
  assert.equal(ReaderGestures.key('ArrowRight', true), 'backward');
  assert.equal(ReaderGestures.key('ArrowLeft', true), 'forward');
  assert.equal(ReaderGestures.key('ArrowLeft', false), 'backward');
  for (const rtl of [false, true]) {
    assert.equal(ReaderGestures.key('PageDown', rtl), 'forward');
    assert.equal(ReaderGestures.key(' ', rtl), 'forward');
    assert.equal(ReaderGestures.key('PageUp', rtl), 'backward');
    assert.equal(ReaderGestures.key('a', rtl), null);
  }
});

test('swipes: far enough, mostly sideways, in the direction of reading', () => {
  assert.equal(ReaderGestures.swipe(-120, 10, false), 'forward');
  assert.equal(ReaderGestures.swipe(120, 10, false), 'backward');
  assert.equal(ReaderGestures.swipe(120, 10, true), 'forward');
  assert.equal(ReaderGestures.swipe(-120, 10, true), 'backward');
  assert.equal(ReaderGestures.swipe(30, 0, false), null, 'too short');
  assert.equal(ReaderGestures.swipe(80, 70, false), null, 'too diagonal');
});
