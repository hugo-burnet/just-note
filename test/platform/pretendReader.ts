import assert from 'node:assert/strict';

// The scripts are text for a WebView, so they are run here against a made-up page: pictures that
// are put in, and loaded, as the page is scrolled to them, a bridge to hear what they report, and
// a clock that moves when the script sleeps (so that its limits can be reached at once).
export const SELECTOR = 'img[src^="blob:"]';
export const PLACES = '.image-container.strip[data-page]';
export const SCREEN = 800;
export const TOKEN = 'secret';

export interface PretendPicture {
  src: string;
  currentSrc: string;
  complete: boolean;
  naturalWidth: number;
  naturalHeight: number;
  /** Where the page has to be scrolled to for it to be put in, and to be loaded. */
  readonly insertAt: number;
  readonly loadAt: number;
}

export const picture = (n: number, insertAt: number, loadAt = insertAt): PretendPicture => ({
  src: `blob:https://m.example.test/${n}`,
  currentSrc: `blob:https://m.example.test/${n}`,
  complete: false,
  naturalWidth: 0,
  naturalHeight: 0,
  insertAt,
  loadAt,
});

export class PretendReader {
  clock = 0;
  scrolledTo = 0;
  readonly heard: Array<{ type: string; bytes: string }> = [];
  readonly outcome: string[] = [];
  /** What the script said it had found, with `done`. */
  readonly notes: string[] = [];
  /** How far it said it had got, each time it said. */
  readonly progress: number[] = [];
  /** How many places the page keeps for its pictures (what PLACES matches). */
  places = 0;
  /** Places that are more than numbers: what the script describes in its report. */
  placeElements: unknown[] | undefined;
  /** How tall the page is (it scrolls to its end a screen at a time). */
  height = 6000;
  private readonly scheduled: Array<{ at: number; run: () => void }> = [];
  /** What the hook kept, by address. */
  readonly blobs = new Map<string, Blob>();
  /** What the page still lets `fetch` have (an address it has not let go of). */
  readonly served = new Map<string, Blob>();
  readonly fetched: string[] = [];
  readonly selectors: string[] = [];
  readonly pictures: PretendPicture[];
  /** A reader that scrolls inside a box of its own: how tall it is, and where it has been scrolled to. */
  inner: { scrollHeight: number; clientHeight: number; scrollTop: number; overflow: string } | undefined;

  constructor(pictures: PretendPicture[]) {
    this.pictures = pictures;
  }

  /** Something that happens on the page once the script has waited `ms` (its clock moves when it sleeps). */
  later(ms: number, run: () => void): void {
    this.scheduled.push({ at: ms, run });
  }

  private due(): void {
    for (const event of this.scheduled.filter((one) => one.at <= this.clock)) {
      this.scheduled.splice(this.scheduled.indexOf(event), 1);
      event.run();
    }
  }

  /** How far down the reader has been scrolled, wherever it scrolls. */
  get at(): number {
    return this.inner ? this.inner.scrollTop : this.scrolledTo;
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
        progress: (token: string, percent: number): void => {
          assert.equal(token, TOKEN);
          reader.progress.push(percent);
        },
        done: (token: string, note: string): void => void (reader.outcome.push(`done ${token}`), reader.notes.push(note)),
        fail: (token: string, message: string): void => void reader.outcome.push(`fail ${token} ${message}`),
      },
      __justReadToken: TOKEN,
      __justReadBlobs: this.blobs,
      scrollTo: (_x: number, y: number): void => {
        reader.scrolledTo = y;
        reader.reach();
      },
    };
  }

  /** What the scrolling has brought into view is loaded (the reader's own box counts, the page does not when it has one). */
  reach(): void {
    for (const one of this.pictures) {
      if (one.loadAt <= this.at + SCREEN && !one.complete) Object.assign(one, { complete: true, naturalWidth: 800, naturalHeight: 1200 });
    }
  }

  get document() {
    const reader = this;
    return {
      documentElement: { scrollHeight: reader.height },
      body: { scrollHeight: reader.height },
      querySelectorAll: (selector: string): unknown[] => {
        reader.selectors.push(selector);
        // The places the page keeps for its pictures: there from the start, whatever has come in.
        if (selector === PLACES) return reader.placeElements ?? Array.from({ length: reader.places }, () => picture(0, 0));
        return reader.pictures.filter((one) => one.insertAt <= reader.at + SCREEN).map((one) => Object.assign(one, { parentElement: reader.parentOf() }));
      },
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({ drawImage: () => undefined }),
        toBlob: (callback: (blob: Blob) => void, type: string) => callback(new Blob(['drawn'], { type })),
      }),
    };
  }

  /** The element a picture sits in: the reader's own box, whose scrollTop is the way to move it, or nothing. */
  parentOf(): unknown {
    const reader = this;
    const inner = this.inner;
    if (!inner) return null;
    return {
      get scrollHeight(): number {
        return inner.scrollHeight;
      },
      clientHeight: inner.clientHeight,
      get scrollTop(): number {
        return inner.scrollTop;
      },
      set scrollTop(value: number) {
        inner.scrollTop = value;
        reader.reach();
      },
      parentElement: null,
      overflowY: inner.overflow,
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
      reader.due();
      setImmediate(callback);
    };
    const style = (element: { overflowY?: string }): { overflowY: string } => ({ overflowY: element.overflowY ?? 'visible' });
    new Function('window', 'document', 'fetch', 'FileReader', 'setTimeout', 'Date', 'getComputedStyle', script)(
      this.window,
      this.document,
      this.fetchFunction,
      this.FileReaderClass,
      sleep,
      { now: () => reader.clock },
      style,
    );
    while (this.outcome.length === 0) await new Promise((resolve) => setImmediate(resolve));
  }
}

export const blobOf = (text: string, type = 'image/jpeg'): Blob => new Blob([text], { type });
