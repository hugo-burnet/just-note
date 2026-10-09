import type { LibraryEntry, ReadingPosition } from './Library.ts';

export interface BackupEntry extends LibraryEntry {
  readonly finished: readonly string[];
}

export interface LibraryBackup {
  readonly format: 'just-read-library';
  readonly version: 1;
  readonly exportedAt: number;
  readonly entries: readonly BackupEntry[];
}

/** A small, portable file; downloaded images and connection settings stay on the device. */
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

const fail = (): never => { throw new Error('Invalid library backup'); };
const record = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail();
  return value as Record<string, unknown>;
};
const text = (value: unknown): string => {
  if (typeof value !== 'string' || !value.trim() || value.length > 4096) return fail();
  return value;
};
const integer = (value: unknown): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return fail();
  return value;
};
const address = (value: unknown): string => {
  const raw = text(value);
  const url = new URL(raw);
  if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return fail();
  return raw;
};

function position(value: unknown): ReadingPosition {
  const item = record(value);
  return { chapter: address(item.chapter), key: text(item.key), title: text(item.title), page: integer(item.page) };
}

function entry(value: unknown): BackupEntry {
  const item = record(value);
  if (!Array.isArray(item.finished) || item.finished.length > 100000) return fail();
  const addedAt = integer(item.addedAt), updatedAt = integer(item.updatedAt);
  if (updatedAt < addedAt) return fail();
  return {
    url: address(item.url), title: text(item.title), cover: item.cover === null ? null : address(item.cover),
    addedAt, updatedAt, finished: [...new Set(item.finished.map(text))],
    ...(item.chapterCount === undefined ? {} : { chapterCount: integer(item.chapterCount) }),
    ...(item.position === undefined ? {} : { position: position(item.position) }),
  };
}

/** Validates the entire file before an import can modify any series. */
export function parseLibraryBackup(raw: string): LibraryBackup {
  if (new TextEncoder().encode(raw).byteLength > MAX_BACKUP_BYTES) return fail();
  const data = record(JSON.parse(raw));
  if (data.format !== 'just-read-library' || data.version !== 1 || !Array.isArray(data.entries) || data.entries.length > 10000) return fail();
  const entries = data.entries.map(entry);
  if (new Set(entries.map((item) => item.url)).size !== entries.length) return fail();
  return { format: 'just-read-library', version: 1, exportedAt: integer(data.exportedAt), entries };
}
