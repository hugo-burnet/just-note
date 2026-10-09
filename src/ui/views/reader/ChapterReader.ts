import { ReaderGestures, ReadingStyles } from '../../../engine/index.ts';
import type { ChapterRef, Direction, ReaderSession, ReadingMode, ReadingStyle } from '../../../engine/index.ts';
import type { AppContext } from '../../core/AppContext.ts';
import { Component } from '../../core/Component.ts';
import { h } from '../../core/dom.ts';
import { ImageLoader } from '../../core/ImageLoader.ts';
import { Routes } from '../../core/Routes.ts';
import { endCard } from './EndCard.ts';
import { PagedMode } from './PagedMode.ts';
import { ProgressSaver } from './ProgressSaver.ts';
import { ReaderChrome } from './ReaderChrome.ts';
import type { ChromeChapter } from './ReaderChrome.ts';
import { ReaderOptions } from './ReaderOptions.ts';
import { ReadingOrder } from './ReadingOrder.ts';
import type { Part } from './ReadingOrder.ts';
import type { ReadingSurface, SurfaceHandlers, SurfaceOptions } from './ReadingSurface.ts';
import { ScrollMode } from './ScrollMode.ts';

export interface ChapterReaderOptions {
  readonly chapter: ChapterRef;
  readonly seriesUrl: string;
  readonly seriesTitle: string;
  readonly pages: readonly string[];
  readonly startPage: number;
  /** The chapters of the series in reading order, to know what comes before and after (empty when unknown). */
  readonly chapters: readonly ChapterRef[];
  /** How the site wants to be read: what "auto" in the settings stands for. */
  readonly natural: ReadingStyle;
  /** Scrolling carried the reader on into another chapter. */
  readonly entered: (chapter: ChapterRef) => void;
}

/** The controls show for a moment when a chapter opens, then leave the page alone. */
const INTRO_MS = 2600;
const WARM_PAGES = 2;

/**
 * A chapter on screen: the pages, the controls over them, and the bookkeeping
 * that goes with reading (the place kept, the chapter marked read, the next one
 * warmed up). In a column, the next chapter is put under the last page as the
 * end comes near, and the reader carries on into it by scrolling.
 */
export class ChapterReader extends Component {
  private readonly app: AppContext;
  private readonly options: ChapterReaderOptions;
  private readonly order: ReadingOrder;
  /** What closes each chapter in the column, to tell it once the next one follows. */
  private readonly endings = new Map<string, HTMLElement>();
  private part: Part;
  private session: ReaderSession;
  private extending = false;
  private readonly chrome: ReaderChrome;
  private readonly saver: ProgressSaver;
  private surface: ReadingSurface;
  private mode: ReadingMode;
  private rtl: boolean;

  private readonly handlers: SurfaceHandlers = {
    page: (index, chapter) => this.arrive(index, chapter),
    nearEnd: () => void this.extend(),
    turn: (direction) => this.turn(direction),
    toggleChrome: () => this.chrome.toggle(),
    hideChrome: () => this.chrome.hide(),
  };

  constructor(app: AppContext, options: ChapterReaderOptions) {
    super(h('div', { class: 'reader-live' }));
    this.app = app;
    this.options = options;
    const style = ReadingStyles.resolve(app.settings.get(), options.natural);
    this.mode = style.mode;
    this.rtl = style.rtl;
    this.part = { chapter: options.chapter, pages: options.pages };
    this.order = new ReadingOrder(options.chapters);
    this.order.keep(this.part);
    this.session = this.order.session(this.part, options.startPage);
    this.saver = new ProgressSaver(() => this.save());
    this.chrome = new ReaderChrome({
      i18n: app.i18n,
      subtitle: options.seriesTitle,
      ...this.chromeChapter(),
      callbacks: {
        back: () => this.leave(),
        slide: (index) => this.jump(index),
        previous: () => this.go(this.session.previous, false),
        next: () => this.go(this.session.next, false),
        options: () => this.openOptions(),
      },
    });
    this.chrome.setDirection(this.reversed());
    this.surface = this.buildSurface(this.mode);
    this.root.append(this.surface.root, this.chrome.root);

    this.own(() => this.surface.destroy());
    this.own(() => this.chrome.destroy());
    this.own(this.saver.attach());
    this.own(this.saver.flush);
    this.listen<KeyboardEvent>(document, 'keydown', (event) => this.key(event));
    this.after(INTRO_MS, () => this.chrome.hide());
    this.arrive();
  }

  /** The reader is on `session.page`: show it, keep the place, count the chapter as read at the end. */
  private arrive(index?: number, chapter?: string): void {
    if (chapter !== undefined && chapter !== this.part.chapter.url) this.enter(chapter);
    if (index !== undefined) this.session.goTo(index);
    this.chrome.setPage(this.session.page);
    this.saver.schedule();
    if (this.session.isLast) this.finish();
    if (this.session.takePrefetch()) void this.warmNext();
  }

  /** Scrolling went on into another chapter of the column: it becomes the one being read. */
  private enter(url: string): void {
    const part = this.order.part(url);
    if (!part) return;
    // Scrolling past the end of a chapter is reading it to its end, even in one fling.
    if (url === this.session.next?.url) this.finish();
    this.part = part;
    this.session = this.order.session(part);
    this.chrome.setChapter(this.chromeChapter());
    this.options.entered(part.chapter);
  }

  private chromeChapter(): ChromeChapter {
    return {
      title: this.part.chapter.title,
      pageCount: this.session.count,
      hasPrevious: this.session.previous !== null,
      hasNext: this.session.next !== null,
    };
  }

  /** The end of the column is near: the chapter after the last one in it is put under it. */
  private async extend(): Promise<void> {
    const surface = this.surface;
    if (this.extending || !(surface instanceof ScrollMode)) return;
    const last = this.order.part(surface.last);
    const next = last ? this.order.session(last).next : null;
    if (!last || !next) return;
    this.extending = true;
    try {
      const pages = this.order.part(next.url)?.pages ?? (await this.app.catalog.chapter(next.url)).pages;
      if (this.isDestroyed || surface !== this.surface || pages.length === 0) return;
      const part: Part = { chapter: next, pages };
      this.order.keep(part);
      this.endings.get(last.chapter.url)?.setAttribute('data-state', 'joined');
      surface.append(next.url, pages, this.endCard(part));
    } catch {
      // The card under the last page still offers the next chapter: opening it reports the failure.
    } finally {
      this.extending = false;
    }
  }

  private turn(direction: Direction): void {
    const outcome = this.session.step(direction === 'forward' ? 1 : -1);
    if (outcome === 'moved') {
      this.surface.goTo(this.session.page);
      this.arrive();
    } else if (outcome === 'next-chapter') this.go(this.session.next, false);
    else if (outcome === 'previous-chapter') this.go(this.session.previous, true);
    else if (outcome === 'end') this.app.toasts.show(this.app.i18n.t('reader.upToDate'));
  }

  private jump(index: number): void {
    this.session.goTo(index);
    this.surface.goTo(this.session.page);
    this.arrive();
  }

  /**
   * Another chapter takes this one's place in the history, so Back does not walk
   * through every chapter. One already in the column is simply scrolled to.
   */
  private go(chapter: ChapterRef | null, atEnd: boolean): void {
    if (!chapter) return;
    if (this.surface instanceof ScrollMode && this.surface.reveal(chapter.url, atEnd)) return;
    this.app.router.replace(Routes.read(chapter.url, { end: atEnd }));
  }

  private leave(): void {
    this.app.router.back(Routes.series(this.options.seriesUrl));
  }

  private finish(): void {
    this.app.library.markRead(this.options.seriesUrl, this.part.chapter.key);
  }

  private save(): void {
    const { chapter } = this.part;
    const { seriesUrl } = this.options;
    this.app.library.setPosition(seriesUrl, { chapter: chapter.url, key: chapter.key, title: chapter.title, page: this.session.page });
  }

  private async warmNext(): Promise<void> {
    const { next } = this.session;
    if (!next) return;
    try {
      const { pages } = await this.app.catalog.chapter(next.url, { background: true });
      if (this.isDestroyed) return;
      await Promise.all(pages.slice(0, WARM_PAGES).map(async (page) => {
        const loader = new ImageLoader(this.app.transport);
        try {
          const src = await loader.load(page);
          if (src && !this.isDestroyed) {
            const image = new Image();
            image.src = src;
            await image.decode();
          }
        } finally {
          loader.destroy();
        }
      }));
    } catch {
      // A head start, nothing more: opening the chapter will report a real failure.
    }
  }

  private buildSurface(mode: ReadingMode): ReadingSurface {
    const options: SurfaceOptions = {
      chapter: this.part.chapter.url,
      pages: this.part.pages,
      startPage: this.session.page,
      transport: this.app.transport,
      rtl: this.rtl,
      retryLabel: this.app.i18n.t('reader.retryImage'),
      ending: mode === 'scroll' ? this.endCard(this.part) : undefined,
      handlers: this.handlers,
    };
    return mode === 'scroll' ? new ScrollMode(options) : new PagedMode(options);
  }

  private setMode(mode: ReadingMode): void {
    this.mode = mode;
    this.surface.destroy();
    this.surface = this.buildSurface(mode);
    this.root.prepend(this.surface.root);
    this.chrome.setDirection(this.reversed());
  }

  /** The settings changed (from the options sheet): read the way they say now, on the page being read. */
  private applyReading(): void {
    const { mode, rtl } = ReadingStyles.resolve(this.app.settings.get(), this.options.natural);
    this.rtl = rtl;
    if (mode !== this.mode) this.setMode(mode);
    else this.surface.setDirection(rtl);
    this.chrome.setDirection(this.reversed());
  }

  /** A column always reads downwards: only turned pages can run from right to left. */
  private reversed(): boolean {
    return this.rtl && this.mode === 'paged';
  }

  private openOptions(): void {
    const { i18n, sheets } = this.app;
    const content = new ReaderOptions(this.app, () => this.applyReading());
    const sheet = sheets.present({ title: i18n.t('reader.options'), body: content.root });
    void sheet.closed.then(() => content.destroy());
  }

  private endCard(part: Part): HTMLElement {
    const card = endCard({
      i18n: this.app.i18n,
      chapter: part.chapter,
      next: this.order.session(part).next,
      onward: (next) => this.go(next, false),
      toChapters: () => this.leave(),
    });
    this.endings.set(part.chapter.url, card);
    return card;
  }

  private key(event: KeyboardEvent): void {
    const blocked = event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLInputElement;
    if (blocked || document.querySelector('.sheet-host:not([inert])')) return;
    if (event.key === 'Escape') {
      this.leave();
      return;
    }
    const direction = event.shiftKey && event.key === ' ' ? 'backward' : ReaderGestures.key(event.key, this.rtl);
    if (!direction) return;
    event.preventDefault();
    // Left and right turn a page; the other keys move by a screen.
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') this.turn(direction);
    else this.surface.advance(direction);
  }
}
