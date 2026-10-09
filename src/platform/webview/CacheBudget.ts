const SIZE = 'x-just-read-cache-bytes';
const locks = new Map<string, Promise<void>>();

/** CacheStorage mutations are serial even when several images arrive together. */
export async function withCacheLock(name: string, work: () => Promise<void>): Promise<void> {
  const previous = locks.get(name) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(work);
  locks.set(name, next);
  try { await next; } finally { if (locks.get(name) === next) locks.delete(name); }
}

/** Counts the decoded bytes, independent of missing or inaccurate Content-Length headers. */
async function byteLength(response: Response, stopAfter = Infinity): Promise<number> {
  const reader = response.clone().body?.getReader();
  if (!reader) return 0;
  let bytes = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) return bytes;
      bytes += chunk.value.byteLength;
      if (bytes > stopAfter) {
        // A clone's cancelled branch need not finish before the reader consumes the original.
        void reader.cancel().catch(() => {});
        return bytes;
      }
    }
  } finally { reader.releaseLock(); }
}

/** Bounds both disk bytes and entry count. Oldest downloads leave first. */
export class CacheBudget {
  private readonly entries: number;
  private readonly bytes: number;
  private readonly measured = new Map<string, number>();

  constructor(entries: number, bytes = Infinity) {
    this.entries = entries;
    this.bytes = bytes;
  }

  async put(cache: Cache, key: Request | string, response: Response): Promise<void> {
    const size = await byteLength(response, this.bytes);
    await cache.delete(key, { ignoreVary: true });
    if (size > this.bytes || this.entries < 1) return;
    // Make room before writing: a full device can still replace old downloads.
    await this.trim(cache, size, 1);
    const headers = new Headers(response.headers);
    headers.set(SIZE, String(size));
    headers.delete('content-encoding');
    headers.delete('content-length');
    await cache.put(key, new Response(response.clone().body, { status: response.status, statusText: response.statusText, headers }));
  }

  async trim(cache: Cache, incomingBytes = 0, incomingEntries = 0): Promise<void> {
    const keys = await cache.keys();
    const sizes: number[] = [];
    let total = incomingBytes;
    for (const key of keys) {
      const response = await cache.match(key, { ignoreVary: true });
      const declared = response?.headers.get(SIZE);
      const size = declared !== null && declared !== undefined && /^\d+$/.test(declared)
        ? Number(declared)
        : this.measured.get(key.url) ?? (response ? await byteLength(response) : 0);
      this.measured.set(key.url, size);
      sizes.push(size);
      total += size;
    }
    for (let index = 0; index < keys.length && (total > this.bytes || keys.length - index + incomingEntries > this.entries); index++) {
      const key = keys[index];
      if (key) {
        await cache.delete(key);
        this.measured.delete(key.url);
        total -= sizes[index] ?? 0;
      }
    }
    const live = new Set(keys.map((key) => key.url));
    for (const key of this.measured.keys()) if (!live.has(key)) this.measured.delete(key);
  }
}
