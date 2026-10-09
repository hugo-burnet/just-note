import { ReaderGestures, ReaderSession, ReadingStyles } from '../../../engine/index.ts';
import type { ChapterRef, Direction, ReadingMode, ReadingStyle } from '../../../engine/index.ts';
import type { AppContext } from '../../core/AppContext.ts';
import { Component } from '../../core/Component.ts';
import { h } from '../../core/dom.ts';
import { icon } from '../../core/icons.ts';
import { Routes } from '../../core/Routes.ts';
import { PagedMode } from './PagedMode.ts';
import { ProgressSaver } from './ProgressSaver.ts';
import { ReaderChrome } from './ReaderChrome.ts';
import { ReaderOptions } from './ReaderOptions.ts';
import type { ReadingSurface, SurfaceHandlers, SurfaceOptions } from './ReadingSurface.ts';
import { ScrollMode } from './ScrollMode.ts';

export interface ChapterReaderOptions {
  readonly chapter: ChapterRef;
  readonly seriesUrl: string;
  readonly seriesTitle: string;
  readonly pages: readonly string[];
  readonly startPage: number;
  readonly previous: ChapterRef | null;
  readonly next: ChapterRef | null;
  /** How the site wants to be read: what "auto" in the settings stands for. */
  readonly natural: ReadingStyle;
}

/** The controls show for a moment when a chapter opens, then leave the page alone. */
const INTRO_MS = 2600;
const WARM_PAGES = 2;

/**
 * A chapter on screen: the pages, the controls over them, and the bookkeeping
 * that goes with reading (the place kept, the chapter marked read, the next one
 * warmed up).
 */
export class ChapterReader extends Component {
  private readonly app: AppContext;
  private readonly options: ChapterReaderOptions;
  private readonly session: ReaderSession;
  private readonly chrome: ReaderChrome;
  private readonly saver: ProgressSaver;
  private surface: ReadingSurface;
  private mode: ReadingMode;
  private rtl: boolean;

  private readonly handlers: SurfaceHandlers = {
    page: (index) => this.arrive(index),
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
    this.session = new ReaderSession({ pageCount: options.pages.length, startPage: options.startPage, previous: options.previous, next: options.next });
    this.saver = new ProgressSaver(() => this.save());
    this.chrome = new ReaderChrome({
      i18n: app.i18n,
      title: options.chapter.title,
      subtitle: options.seriesTitle,
      pageCount: this.session.count,
      hasPrevious: options.previous !== null,
      hasNext: options.next !== null,
      callbacks: {
        back: () => this.leave(),
        slide: (index) => this.jump(index),
        previous: () => this.go(options.previous, false),
        next: () => this.go(options.next, false),
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
  private arrive(index?: number): void {
    if (index !== undefined) this.session.goTo(index);
    this.chrome.setPage(this.session.page);
    this.saver.schedule();
    if (this.session.isLast) this.finish();
    if (this.session.takePrefetch()) void this.warmNext();
  }

  private turn(direction: Direction): void {
    const outcome = this.session.step(direction === 'forward' ? 1 : -1);
    if (outcome === 'moved') {
      this.surface.goTo(this.session.page);
      this.arrive();
    } else if (outcome === 'next-chapter') this.go(this.options.next, false);
    else if (outcome === 'previous-chapter') this.go(this.options.previous, true);
    else if (outcome === 'end') this.app.toasts.show(this.app.i18n.t('reader.upToDate'));
  }

  private jump(index: number): void {
    this.session.goTo(index);
    this.surface.goTo(this.session.page);
    this.arrive();
  }

  /** Another chapter takes this one's place in the history, so Back does not walk through every chapter. */
  private go(chapter: ChapterRef | null, atEnd: boolean): void {
    if (chapter) this.app.router.replace(Routes.read(chapter.url, { end: atEnd }));
  }

  private leave(): void {
    this.app.router.back(Routes.series(this.options.seriesUrl));
  }

  private finish(): void {
    this.app.library.markRead(this.options.seriesUrl, this.options.chapter.key);
  }

  private save(): void {
    const { chapter, seriesUrl } = this.options;
    this.app.library.setPosition(seriesUrl, { chapter: chapter.url, key: chapter.key, title: chapter.title, page: this.session.page });
  }

  private async warmNext(): Promise<void> {
    const { next } = this.options;
    if (!next) return;
    try {
      const { pages } = await this.app.catalog.chapter(next.url, { background: true });
      for (const page of pages.slice(0, WARM_PAGES)) new Image().src = await this.app.transport.imageSource(page);
    } catch {
      // A head start, nothing more: opening the chapter will report a real failure.
    }
  }

  private buildSurface(mode: ReadingMode): ReadingSurface {
    const options: SurfaceOptions = {
      pages: this.options.pages,
      startPage: this.session.page,
      transport: this.app.transport,
      rtl: this.rtl,
      retryLabel: this.app.i18n.t('reader.retryImage'),
      ending: mode === 'scroll' ? this.endCard() : undefined,
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

  /** What closes a scrolled chapter: where to go next, or the news that there is nothing after. */
  private endCard(): HTMLElement {
    const { i18n } = this.app;
    const { chapter, next } = this.options;
    const chapters = h('button', { class: 'btn btn-block pressable', type: 'button' }, i18n.t('reader.toChapters'));
    this.listen(chapters, 'click', () => this.leave());
    let onward: HTMLElement | null = null;
    if (next) {
      onward = h('button', { class: 'btn btn-primary btn-block pressable', type: 'button' }, h('span', { class: 'label' }, next.title), icon('arrowRight', 20));
      this.listen(onward, 'click', () => this.go(next, false));
    }
    return h(
      'section',
      { class: 'end-card' },
      h('h2', null, i18n.t('reader.finished', { chapter: chapter.title })),
      h('p', { class: 'muted' }, i18n.t(next ? 'reader.nextUp' : 'reader.upToDate')),
      onward,
      chapters,
    );
  }

  private key(event: KeyboardEvent): void {
    const blocked = event.metaKey || event.ctrlKey || event.altKey || event.target instanceof HTMLInputElement;
    if (blocked || document.documentElement.classList.contains('sheet-open')) return;
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
