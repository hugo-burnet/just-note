/**
 * The files of the app, kept from one visit to the next so that it opens with
 * no network. Each build has a cache of its own (the name carries the hash of
 * the build), and the ones of earlier builds are dropped once the new one runs.
 */
export class ShellCache {
  readonly name: string;
  private readonly prefix: string;
  private readonly files: readonly string[];

  constructor(name: string, prefix: string, files: readonly string[]) {
    this.name = name;
    this.prefix = prefix;
    this.files = files;
  }

  async install(): Promise<void> {
    const cache = await caches.open(this.name);
    // `reload` skips the HTTP cache: a stale index.html would name files that no longer exist.
    await cache.addAll(this.files.map((file) => new Request(file, { cache: 'reload' })));
  }

  async dropOld(): Promise<void> {
    for (const name of await caches.keys()) {
      if (name.startsWith(this.prefix) && name !== this.name) await caches.delete(name);
    }
  }
}
