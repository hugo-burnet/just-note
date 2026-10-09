import type { ImageResource, Transport } from '../../engine/index.ts';

/** HTTP retries change the cache key; a blob address must stay exactly as it was created. */
export function retried(address: string, attempt: number): string {
  if (attempt === 0 || /^(blob:|data:)/i.test(address)) return address;
  const url = new URL(address, 'https://relative.invalid');
  url.searchParams.set('r', String(attempt));
  return /^[a-z]+:/i.test(address) ? url.href : `${address.split(/[?#]/)[0]}${url.search}${url.hash}`;
}

/** Owns one image resource, including a request that finishes after its view went away. */
export class ImageLoader {
  private readonly transport: Transport;
  private resource: ImageResource | null = null;
  private token = 0;
  private gone = false;

  constructor(transport: Transport) {
    this.transport = transport;
  }

  async load(address: string, attempt = 0): Promise<string | null> {
    if (this.gone) return null;
    const token = ++this.token;
    const resource = this.transport.acquireImage
      ? await this.transport.acquireImage(address, attempt > 0)
      : { src: retried(await this.transport.imageSource(address), attempt), release: () => {} };
    if (this.gone || token !== this.token) {
      resource.release();
      return null;
    }
    this.resource?.release();
    this.resource = resource;
    return resource.src;
  }

  clear(): void {
    this.token++;
    this.resource?.release();
    this.resource = null;
  }

  destroy(): void {
    this.gone = true;
    this.clear();
  }
}
