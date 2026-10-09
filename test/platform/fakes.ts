import type { NativeHttp, NativeRequest, NativeResponse } from '../../src/platform/native/NativeHttp.ts';
import type { BlobUrls } from '../../src/platform/native/NativeImages.ts';
import type { FetchedPage, Held, PageFetcher } from '../../src/platform/native/PageFetcher.ts';
import type { ResponseStore } from '../../src/platform/native/ResponseStore.ts';
import type { FetchOptions } from '../../src/platform/Platform.ts';

export type Answer = NativeResponse | Error;

/** The phone's network, answering as the test says. */
export class FakeHttp implements NativeHttp {
  readonly asked: NativeRequest[] = [];
  private readonly answer: (request: NativeRequest) => Answer;

  constructor(answer: (request: NativeRequest) => Answer) {
    this.answer = answer;
  }

  async get(request: NativeRequest): Promise<NativeResponse> {
    this.asked.push(request);
    const answer = this.answer(request);
    if (answer instanceof Error) throw answer;
    return answer;
  }
}

/** The WebView: it shows what the test gives it, after `hold` if the test wants to keep it waiting. */
export class FakeFetcher implements PageFetcher {
  readonly asked: Array<{ url: string; options: FetchOptions | undefined }> = [];
  hold: Promise<void> | undefined;
  failure: Error | undefined;
  /** What the WebView already holds, before anything is shown (nothing, unless a test says). */
  holding: Held = { cookies: '', userAgent: 'webview' };
  readonly heldAsked: string[] = [];
  /** How many times what is read in the background was told to give way. */
  cancelled = 0;
  private readonly show: (url: string) => FetchedPage;

  constructor(show: (url: string) => FetchedPage) {
    this.show = show;
  }

  async cancelBackground(): Promise<void> {
    this.cancelled++;
  }

  async held(url: string): Promise<Held> {
    this.heldAsked.push(url);
    return this.holding;
  }

  async fetch(url: string, options?: FetchOptions): Promise<FetchedPage> {
    this.asked.push({ url, options });
    await this.hold;
    if (this.failure) throw this.failure;
    return this.show(url);
  }
}

export class MemoryStore implements ResponseStore {
  readonly kept = new Map<string, Response>();

  async get(key: string): Promise<Response | undefined> {
    return this.kept.get(key)?.clone();
  }

  async put(key: string, response: Response): Promise<void> {
    this.kept.set(key, response);
  }
}

export class FakeBlobs implements BlobUrls {
  readonly created: Blob[] = [];
  readonly revoked: string[] = [];

  create(blob: Blob): string {
    this.created.push(blob);
    return `blob:test/${this.created.length}`;
  }

  revoke(url: string): void {
    this.revoked.push(url);
  }
}

export const page = (body: string, status = 200, headers: Record<string, string> = {}): NativeResponse => ({ status, headers, body });
/** Cloudflare's "Just a moment...": what a site sends to a client it doubts. */
export const challenge = (): NativeResponse => page('<title>Just a moment...</title>', 403, { 'cf-mitigated': 'challenge' });
/** Three bytes (1, 2, 3), the way Capacitor hands binary data across. */
export const picture = (type = 'image/jpeg'): NativeResponse => ({ status: 200, headers: { 'content-type': type }, body: 'AQID' });
export const settle = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));
