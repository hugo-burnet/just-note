import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Library, MAX_BACKUP_BYTES, parseLibraryBackup } from '../../src/engine/index.ts';
import { MemoryStore } from './helpers.ts';

const series = { url: 'https://fanfox.net/manga/moon/', title: 'Lune 🌙', cover: 'https://fanfox.net/cover.jpg' };
const position = { chapter: `${series.url}c001/1.html`, key: 'c001', title: 'Chapitre 1', page: 7 };
const saved = () => {
  const library = new Library(new MemoryStore(), () => 100);
  library.save({ ...series, chapters: [1, 2, 3] });
  library.setPosition(series.url, position);
  library.markRead(series.url, 'c000:é');
  return library;
};

test('backup: a portable JSON round trip preserves series, dates, page and finished chapters', () => {
  const original = saved();
  const raw = original.exportBackup();
  assert.ok(!raw.includes('generation') && !raw.includes('jr:'));
  const restored = new Library(new MemoryStore(), () => 900);
  assert.deepEqual(restored.importBackup(raw), { count: 1, persisted: true });
  assert.deepEqual(restored.list(), original.list());
  assert.equal(restored.isRead(series.url, 'c000:é'), true);
  restored.importBackup(raw);
  assert.equal(restored.readCount(series.url), 1);
  assert.deepEqual(restored.list(), original.list());
});

test('backup: older imports preserve local progress and union finished chapters', () => {
  const older = saved();
  const current = new Library(new MemoryStore(), () => 200);
  current.save({ ...series, title: 'New title' });
  current.setPosition(series.url, { ...position, page: 15 });
  current.markRead(series.url, 'c001');
  current.importBackup(older.exportBackup());
  assert.equal(current.get(series.url)?.title, 'New title');
  assert.equal(current.position(series.url)?.page, 15);
  assert.equal(current.readCount(series.url), 2);
});

test('backup: a newer import replaces progress, preserves earlier added date and unrelated series', () => {
  const library = new Library(new MemoryStore(), () => 10);
  library.save(series);
  library.save({ url: 'https://fanfox.net/manga/other/', title: 'Other', cover: null });
  library.setPosition(series.url, { ...position, page: 1 });
  library.importBackup(saved().exportBackup());
  assert.equal(library.position(series.url)?.page, 7);
  assert.equal(library.get(series.url)?.addedAt, 10);
  assert.equal(library.list().length, 2);
});

test('backup: explicit restoration of a removed series retains imported read marks', () => {
  const library = saved();
  const raw = library.exportBackup();
  library.remove(series.url);
  library.importBackup(raw);
  assert.equal(library.position(series.url)?.page, 7);
  assert.equal(library.readCount(series.url), 1);
});

test('backup: missing progress can be restored beside newer local series details', () => {
  const library = new Library(new MemoryStore(), () => 200);
  library.save({ ...series, title: 'New local title' });
  library.importBackup(saved().exportBackup());
  assert.equal(library.get(series.url)?.title, 'New local title');
  assert.equal(library.position(series.url)?.page, 7);
});

test('backup: an empty library can be exported and imported without erasing existing series', () => {
  const library = saved();
  assert.deepEqual(library.importBackup(new Library(new MemoryStore()).exportBackup()), { count: 0, persisted: true });
  assert.equal(library.list().length, 1);
});

test('backup: invalid files are rejected in their entirety before any writes', () => {
  const store = new MemoryStore();
  const library = new Library(store);
  library.save(series);
  const before = [...store.data];
  const valid = JSON.parse(saved().exportBackup());
  const invalid = [
    '{', 'null', '[]', JSON.stringify({ ...valid, version: 2 }),
    JSON.stringify({ ...valid, entries: [valid.entries[0], { ...valid.entries[0], url: 'javascript:alert(1)' }] }),
    JSON.stringify({ ...valid, entries: [{ ...valid.entries[0], position: { ...position, page: -1 } }] }),
    JSON.stringify({ ...valid, entries: [{ ...valid.entries[0], cover: 'data:text/html,unsafe' }] }),
    JSON.stringify({ ...valid, entries: [{ ...valid.entries[0], title: '' }] }),
    JSON.stringify({ ...valid, entries: [{ ...valid.entries[0], updatedAt: 1 }] }),
    JSON.stringify({ ...valid, entries: [{ ...valid.entries[0], finished: [4] }] }),
    JSON.stringify({ ...valid, entries: [valid.entries[0], valid.entries[0]] }),
  ];
  for (const raw of invalid) {
    assert.throws(() => library.importBackup(raw));
    assert.deepEqual([...store.data], before);
  }
});

test('backup: the file size limit counts UTF-8 bytes', () => {
  assert.throws(() => parseLibraryBackup('é'.repeat(MAX_BACKUP_BYTES / 2 + 1)), /Invalid library backup/);
});

test('backup: storage failure is reported while the imported data remains usable this session', () => {
  class FullStore extends MemoryStore {
    override set(): void { throw new Error('quota'); }
  }
  const restored = new Library(new FullStore());
  assert.deepEqual(restored.importBackup(saved().exportBackup()), { count: 1, persisted: false });
  assert.equal(restored.position(series.url)?.page, 7);
  assert.equal(restored.isRead(series.url, 'c000:é'), true);
});
