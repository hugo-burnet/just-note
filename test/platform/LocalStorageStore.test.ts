import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import { LocalStorageStore } from '../../src/platform/web/LocalStorageStore.ts';

class Storage {
  readonly data = new Map<string, string>();
  full = false;
  get length(): number { return this.data.size; }
  key(index: number): string | null { return [...this.data.keys()][index] ?? null; }
  getItem(key: string): string | null { return this.data.get(key) ?? null; }
  setItem(key: string, value: string): void {
    if (this.full) throw new Error('quota');
    this.data.set(key, value);
  }
  removeItem(key: string): void { this.data.delete(key); }
}

let storage: Storage;
beforeEach(() => {
  storage = new Storage();
  Object.assign(globalThis, { localStorage: storage });
});

test('storage: successful writes do not hide another instance\'s later changes or removals', () => {
  const first = new LocalStorageStore(), second = new LocalStorageStore();
  first.set('key', 'old');
  second.set('key', 'new');
  assert.equal(first.get('key'), 'new');
  second.remove('key');
  assert.equal(first.get('key'), null);
  assert.deepEqual(first.keys(), []);
});

test('storage: unpersisted values stay usable until a later successful write restores shared reads', () => {
  const first = new LocalStorageStore(), second = new LocalStorageStore();
  first.set('key', 'old');
  storage.full = true;
  assert.equal(first.set('key', 'session'), false);
  assert.equal(first.get('key'), 'session');
  assert.equal(second.get('key'), 'old');
  assert.deepEqual(first.keys(), ['key']);
  storage.full = false;
  assert.equal(first.set('key', 'persisted'), true);
  second.set('key', 'external');
  assert.equal(first.get('key'), 'external');
});

test('storage: blocked reads and writes still allow enumeration of this session\'s values', () => {
  Object.assign(globalThis, { localStorage: { get length() { throw new Error('blocked'); }, getItem() { throw new Error('blocked'); }, setItem() { throw new Error('blocked'); }, removeItem() { throw new Error('blocked'); } } });
  const store = new LocalStorageStore();
  store.set('one', '1');
  store.set('two', '2');
  store.remove('one');
  assert.equal(store.get('one'), null);
  assert.equal(store.get('two'), '2');
  assert.deepEqual(store.keys(), ['two']);
});
