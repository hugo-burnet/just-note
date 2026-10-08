export interface ChapterRef {
  readonly url: string;
  readonly key: string;
  readonly title: string;
}

export interface ReaderSessionOptions {
  readonly pageCount: number;
  readonly startPage?: number;
  readonly previous: ChapterRef | null;
  readonly next: ChapterRef | null;
}

/** What stepping by one page did, or what the reader should do instead. */
export type StepOutcome = 'moved' | 'next-chapter' | 'previous-chapter' | 'end' | 'start';

const WARM_NEXT_FROM = 0.6;

/**
 * Where the reader is in a chapter and what it means: the page, the progress,
 * when the chapter counts as read, when to warm up the next one. No display in
 * here: the scroll and paged views drive it, and it could be tested without one.
 */
export class ReaderSession {
  readonly count: number;
  readonly previous: ChapterRef | null;
  readonly next: ChapterRef | null;
  private index: number;
  private warmed = false;

  constructor(options: ReaderSessionOptions) {
    this.count = Math.max(0, options.pageCount);
    this.previous = options.previous;
    this.next = options.next;
    this.index = this.clamp(options.startPage ?? 0);
  }

  get page(): number {
    return this.index;
  }

  /** The last page was reached: the chapter counts as read. */
  get isLast(): boolean {
    return this.index >= this.count - 1;
  }

  /** 0 on the first page, 1 on the last. */
  get progress(): number {
    return this.count > 1 ? this.index / (this.count - 1) : 1;
  }

  /** True when the page changed. */
  goTo(page: number): boolean {
    const to = this.clamp(page);
    const changed = to !== this.index;
    this.index = to;
    return changed;
  }

  step(delta: 1 | -1): StepOutcome {
    const to = this.index + delta;
    if (to >= this.count) return this.next ? 'next-chapter' : 'end';
    if (to < 0) return this.previous ? 'previous-chapter' : 'start';
    this.index = to;
    return 'moved';
  }

  /** True once, when the reader is far enough into the chapter to warm the next one up. */
  takePrefetch(): boolean {
    if (this.warmed || !this.next || this.index < this.count * WARM_NEXT_FROM) return false;
    this.warmed = true;
    return true;
  }

  private clamp(page: number): number {
    if (!Number.isFinite(page)) return 0;
    return Math.min(Math.max(0, Math.floor(page)), Math.max(0, this.count - 1));
  }
}
