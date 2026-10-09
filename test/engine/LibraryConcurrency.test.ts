import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Library } from '../../src/engine/index.ts';
import { MemoryStore } from './helpers.ts';

const series = (id: number) => ({ url: `https://site.test/${id}/`, title: `Series ${id}`, cover: null });
const position = { chapter: 'chapter', key: 'c001', title: 'Chapter 1', page: 10 };

test('library: two existing instances preserve each other\'s series, progress and read chapters', () => {
  const store = new MemoryStore();
  const first = new Library(store), second = new Library(store);
  first.save(series(1));
  first.setPosition(series(1).url, position);
  first.markRead(series(1).url, 'c000');
  second.save(series(2));
  assert.equal(first.list().length, 2);
  assert.deepEqual(second.position(series(1).url), position);
  assert.equal(second.isRead(series(1).url, 'c000'), true);
  second.markRead(series(1).url, 'c001');
  assert.equal(first.readCount(series(1).url), 2);
});

test('library: a detail refresh interleaved with progress cannot overwrite that progress', () => {
  class InterleavedStore extends MemoryStore {
    interrupt: (() => void) | null = null;
    override get(key: string): string | null {
      const value = super.get(key);
      const callback = this.interrupt;
      this.interrupt = null;
      callback?.();
      return value;
    }
  }
  const store = new InterleavedStore();
  const first = new Library(store), second = new Library(store);
  first.save(series(1));
  store.interrupt = () => {
    second.setPosition(series(1).url, position);
    second.markRead(series(1).url, 'c001');
  };
  first.save({ ...series(1), title: 'New title' });
  assert.deepEqual(first.position(series(1).url), position);
  assert.equal(first.isRead(series(1).url, 'c001'), true);
});

test('library: concurrent first saves of the same series keep newly written progress', () => {
  class InterleavedStore extends MemoryStore {
    interrupt: (() => void) | null = null;
    override get(key: string): string | null {
      const value = super.get(key);
      const callback = this.interrupt;
      this.interrupt = null;
      callback?.();
      return value;
    }
  }
  const store = new InterleavedStore();
  const first = new Library(store), second = new Library(store);
  store.interrupt = () => {
    second.save(series(1));
    second.setPosition(series(1).url, position);
  };
  first.save(series(1));
  assert.deepEqual(first.position(series(1).url), position);
});

test('library: removal and clearing are seen by stale instances and cannot be undone by progress saves', () => {
  const store = new MemoryStore();
  const first = new Library(store), second = new Library(store);
  first.save(series(1));
  first.markRead(series(1).url, 'c000');
  second.remove(series(1).url);
  first.setPosition(series(1).url, position);
  first.markRead(series(1).url, 'c001');
  assert.deepEqual(first.list(), []);
  first.save(series(1));
  assert.equal(first.position(series(1).url), null);
  assert.equal(first.readCount(series(1).url), 0);
  store.set('jr:settings', '{"lang":"fr"}');
  second.clear();
  assert.deepEqual(first.list(), []);
  assert.equal(store.get('jr:settings'), '{"lang":"fr"}');
});

test('library: legacy series, dates, progress and finished chapters migrate without duplication', () => {
  const store = new MemoryStore();
  const old = { ...series(1), addedAt: 10, updatedAt: 20, chapterCount: 12, position };
  store.set('jr:library', JSON.stringify({ [old.url]: old }));
  store.set('jr:read', JSON.stringify({ [old.url]: ['c000', 'c000'] }));
  const first = new Library(store);
  assert.deepEqual(first.get(old.url), old);
  assert.equal(first.readCount(old.url), 1);
  first.setPosition(old.url, { ...position, page: 15 });
  const later = new Library(store);
  assert.equal(later.position(old.url)?.page, 15);
  later.remove(old.url);
  assert.deepEqual(new Library(store).list(), [], 'old recovery copy must not resurrect a removed series');
});

test('library: failed migration leaves the old data intact and retries after storage recovers', () => {
  class FullStore extends MemoryStore {
    full = true;
    override set(key: string, value: string): void {
      if (this.full && key.startsWith('jr:entry:')) throw new Error('quota');
      super.set(key, value);
    }
  }
  const store = new FullStore();
  const old = { ...series(1), addedAt: 10, updatedAt: 20, position };
  store.set('jr:library', JSON.stringify({ [old.url]: old }));
  store.set('jr:read', JSON.stringify({ [old.url]: ['c000'] }));
  const original = store.get('jr:library');
  assert.deepEqual(new Library(store).position(old.url), position);
  assert.equal(store.get('jr:library'), original);
  assert.equal(store.get('jr:library-migrated'), null);
  store.full = false;
  const restored = new Library(store);
  assert.deepEqual(restored.position(old.url), position);
  assert.equal(restored.isRead(old.url, 'c000'), true);
  assert.equal(new Library(store).list().length, 1);
});
