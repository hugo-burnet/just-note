import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BLOB_HOOK, pictureScript } from '../../src/platform/native/pictureScript.ts';

// The scripts are text for a WebView, so they are run here against a made-up page: pictures that
// are put in, and loaded, as the page is scrolled to them, a bridge to hear what they report, and
// a clock that moves when the script sleeps (so that its limits can be reached at once).
const SELECTOR = 'img[src^="blob:"]';
const SCREEN = 800;
const TOKEN = 'secret';

interface PretendPicture {
  src: string;
  currentSrc: string;
  complete: boolean;
  naturalWidth: number;
  naturalHeight: number;
  /** Where the page has to be scrolled to for it to be put in, and to be loaded. */
  readonly insertAt: number;
  readonly loadAt: number;
}

const picture = (n: number, insertAt: number, loadAt = insertAt): PretendPicture => ({
  src: `blob:https://m.example.test/${n}`,
  currentSrc: `blob:https://m.example.test/${n}`,
  complete: false,
  naturalWidth: 0,
  naturalHeight: 0,
  insertAt,
  loadAt,
});

class PretendReader {
  clock = 0;
  scrolledTo = 0;
  readonly heard: Array<{ type: string; bytes: string }> = [];
  readonly outcome: string[] = [];
  /** What the hook kept, by address. */
  readonly blobs = new Map<string, Blob>();
  /** What the page still lets `fetch` have (an address it has not let go of). */
  readonly served = new Map<string, Blob>();
  readonly fetched: string[] = [];
  readonly selectors: string[] = [];
  readonly pictures: PretendPicture[];

  constructor(pictures: PretendPicture[]) {
    this.pictures = pictures;
  }

  get window() {
    const reader = this;
    return {
      innerHeight: SCREEN,
      JustReadPictures: {
        add: async (token: string, type: string, data: string): Promise<void> => {
          assert.equal(token, TOKEN);
          reader.heard.push({ type, bytes: Buffer.from(data, 'base64').toString() });
        },
        done: (token: string): void => void reader.outcome.push(`done ${token}`),
        fail: (token: string, message: string): void => void reader.outcome.push(`fail ${token} ${message}`),
      },
      __justReadToken: TOKEN,
      __justReadBlobs: this.blobs,
      scrollTo: (_x: number, y: number): void => {
        reader.scrolledTo = y;
        for (const one of reader.pictures) {
          if (one.loadAt <= y + SCREEN && !one.complete) Object.assign(one, { complete: true, naturalWidth: 800, naturalHeight: 1200 });
        }
      },
    };
  }

  get document() {
    const reader = this;
    return {
      documentElement: { scrollHeight: 6000 },
      body: { scrollHeight: 6000 },
      querySelectorAll: (selector: string): PretendPicture[] => {
        reader.selectors.push(selector);
        return reader.pictures.filter((one) => one.insertAt <= reader.scrolledTo + SCREEN);
      },
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => undefined }),
        toBlob: (callback: (blob: Blob) => void, type: string) => callback(new Blob(['drawn'], { type })),
      }),
    };
  }

  fetchFunction = async (address: string): Promise<{ blob(): Promise<Blob> }> => {
    this.fetched.push(address);
    const blob = this.served.get(address);
    if (!blob) throw new TypeError('Failed to fetch');
    return { blob: async () => blob };
  };

  readonly FileReaderClass = class {
    result = '';
    error: unknown = null;
    onload: () => void = () => undefined;
    onerror: () => void = () => undefined;
    readAsDataURL(blob: Blob): void {
      void blob.arrayBuffer().then((buffer) => {
        this.result = `data:${blob.type};base64,${Buffer.from(buffer).toString('base64')}`;
        this.onload();
      });
    }
  };

  /** Runs the script as the WebView would, and waits for it to end. */
  async run(script: string): Promise<void> {
    const reader = this;
    const sleep = (callback: () => void, ms: number): void => {
      reader.clock += ms;
      setImmediate(callback);
    };
    new Function('window', 'document', 'fetch', 'FileReader', 'setTimeout', 'Date', script)(
      this.window,
      this.document,
      this.fetchFunction,
      this.FileReaderClass,
      sleep,
      { now: () => reader.clock },
    );
    while (this.outcome.length === 0) await new Promise((resolve) => setImmediate(resolve));
  }
}

const blobOf = (text: string, type = 'image/jpeg'): Blob => new Blob([text], { type });

test('script: pictures that come in as the page is scrolled are all there, in the order of the page, before it reads them', async () => {
  const reader = new PretendReader([picture(1, 0), picture(2, 1500), picture(3, 3000), picture(4, 4500)]);
  for (const n of [1, 2, 3, 4]) reader.blobs.set(`blob:https://m.example.test/${n}`, blobOf(`page ${n}`));
  await reader.run(pictureScript(SELECTOR));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.deepEqual(reader.heard.map((one) => one.bytes), ['page 1', 'page 2', 'page 3', 'page 4']);
  assert.ok(reader.heard.every((one) => one.type === 'image/jpeg'));
  assert.ok(reader.selectors.every((selector) => selector === SELECTOR), 'the selector is the one given, quotes and all');
});

test('script: a picture the hook did not keep is asked for by its address, and when the page let go of that too, it is drawn', async () => {
  const reader = new PretendReader([picture(1, 0), picture(2, 0), picture(3, 0)]);
  reader.blobs.set('blob:https://m.example.test/1', blobOf('page 1'));
  reader.served.set('blob:https://m.example.test/2', blobOf('page 2', 'image/png'));
  await reader.run(pictureScript(SELECTOR));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.deepEqual(reader.heard, [
    { type: 'image/jpeg', bytes: 'page 1' },
    { type: 'image/png', bytes: 'page 2' },
    { type: 'image/jpeg', bytes: 'drawn' },
  ]);
  // The first needed no request: the hook had it.
  assert.deepEqual(reader.fetched, ['blob:https://m.example.test/2', 'blob:https://m.example.test/3']);
});

test('script: a picture that never loads is a failure that says how many did, not a chapter with a page missing', async () => {
  const reader = new PretendReader([picture(1, 0), { ...picture(2, 0, 99_999) }]);
  reader.blobs.set('blob:https://m.example.test/1', blobOf('page 1'));
  await reader.run(pictureScript(SELECTOR));
  assert.deepEqual(reader.outcome, [`fail ${TOKEN} A picture did not load (1 of 2).`]);
  assert.deepEqual(reader.heard, []);
});

test('script: a page with no picture at all ends after a while, with nothing to give', async () => {
  const reader = new PretendReader([]);
  await reader.run(pictureScript(SELECTOR));
  assert.deepEqual(reader.outcome, [`done ${TOKEN}`]);
  assert.deepEqual(reader.heard, []);
  assert.ok(reader.clock >= 12_000 && reader.clock < 20_000, `${reader.clock} ms`);
});

test('hook: the blobs the page makes are kept by address, once, and nothing else is', () => {
  const made: unknown[] = [];
  class PretendURL {
    static createObjectURL(object: unknown): string {
      made.push(object);
      return `blob:https://m.example.test/${made.length}`;
    }
  }
  const window: { __justReadBlobs?: Map<string, Blob> } = {};
  const install = (): void => void new Function('window', 'URL', 'Blob', BLOB_HOOK)(window, PretendURL, Blob);
  install();
  install();
  const blob = blobOf('bytes');
  assert.equal(PretendURL.createObjectURL(blob), 'blob:https://m.example.test/1');
  assert.equal(PretendURL.createObjectURL({ not: 'a blob' }), 'blob:https://m.example.test/2');
  assert.deepEqual([...(window.__justReadBlobs ?? new Map()).keys()], ['blob:https://m.example.test/1']);
  assert.equal(window.__justReadBlobs?.get('blob:https://m.example.test/1'), blob);
  // Installed twice, the page's own call still reaches the original once.
  assert.equal(made.length, 2);
});
