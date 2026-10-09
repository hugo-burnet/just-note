import type { Direction } from '../../../engine/index.ts';
import { h } from '../../core/dom.ts';
import { ReadingSurface } from './ReadingSurface.ts';
import { ImageLoader } from '../../core/ImageLoader.ts';
import type { SurfaceOptions } from './ReadingSurface.ts';

/** How far below the screen the end of the column is noticed: the next chapter has time to arrive. */
const AHEAD = '0px 0px 150% 0px';

/**
 * The pages one under the other, like a webtoon. The page being read is the one
 * crossing a thin band in the middle of the screen. The column does not stop at
 * the end of a chapter: the next one can be appended under it, so reading goes on
 * by scrolling.
 */
export class ScrollMode extends ReadingSurface {
  private readonly strip = h('div', { class: 'strip' });
  /** The frames of each chapter in the column, in reading order. */
  private readonly parts = new Map<string, HTMLElement[]>();
  private readonly places = new Map<Element, { chapter: string; index: number }>();
  private readonly observer: IntersectionObserver;
  private readonly nearby: IntersectionObserver;
  private readonly ahead: IntersectionObserver;
  private readonly visibility = new Map<Element, (visible: boolean) => void>();
  private reading: string;
  private ending: HTMLElement | null = null;
  private watching = false;

  constructor(options: SurfaceOptions) {
    super(h('div', { class: 'stage', 'data-mode': 'scroll' }), options);
    this.reading = options.chapter;
    this.root.append(this.strip);

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const place = entry.isIntersecting ? this.places.get(entry.target) : undefined;
          if (!place) continue;
          this.reading = place.chapter;
          options.handlers.page(place.index, place.chapter);
        }
      },
      { root: this.root, rootMargin: '-45% 0px -45% 0px' },
    );
    this.own(() => this.observer.disconnect());
    this.nearby = new IntersectionObserver((entries) => {
      for (const entry of entries) this.visibility.get(entry.target)?.(entry.isIntersecting);
    }, { root: this.root, rootMargin: '100% 0px' });
    this.own(() => this.nearby.disconnect());
    this.ahead = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) options.handlers.nearEnd();
    }, { root: this.root, rootMargin: AHEAD });
    this.own(() => this.ahead.disconnect());

    this.add(options.chapter, options.pages, options.ending);

    this.listen(this.root, 'click', (event) => {
      if (!(event.target as Element).closest('a, button')) options.handlers.toggleChrome();
    });
    this.listen(this.root, 'touchmove', () => options.handlers.hideChrome(), { passive: true });
    this.listen(this.root, 'wheel', () => options.handlers.hideChrome(), { passive: true });

    // Land where the reader left off, and only then start watching which page is in the middle.
    const firstFrame = requestAnimationFrame(() => {
      if (this.isDestroyed) return;
      this.parts.get(options.chapter)?.[options.startPage]?.scrollIntoView({ block: 'start' });
      this.watching = true;
      for (const frames of this.parts.values()) this.watch(frames);
      this.watchEnding();
    });
    this.own(() => cancelAnimationFrame(firstFrame));
  }

  /** The chapter at the bottom of the column. */
  get last(): string {
    return [...this.parts.keys()].at(-1) ?? this.options.chapter;
  }

  goTo(page: number): void {
    this.parts.get(this.reading)?.[page]?.scrollIntoView({ block: 'start' });
  }

  /** Scrolls to a chapter already in the column. False when it is not there. */
  reveal(chapter: string, atEnd: boolean): boolean {
    const frames = this.parts.get(chapter);
    const frame = atEnd ? frames?.at(-1) : frames?.[0];
    if (!frame) return false;
    frame.scrollIntoView({ block: 'start' });
    return true;
  }

  /** Puts a chapter under the last one, followed by what closes it. */
  append(chapter: string, pages: readonly string[], ending?: HTMLElement): void {
    if (this.parts.has(chapter)) return;
    const frames = this.add(chapter, pages, ending);
    if (!this.watching) return;
    this.watch(frames);
    this.watchEnding();
  }

  advance(direction: Direction): void {
    this.root.scrollBy({ top: (direction === 'forward' ? 1 : -1) * this.root.clientHeight * 0.85, behavior: 'smooth' });
  }

  private add(chapter: string, pages: readonly string[], ending: HTMLElement | undefined): HTMLElement[] {
    const frames = pages.map((address, index) => {
      const frame = this.frame(address, index);
      this.places.set(frame, { chapter, index });
      return frame;
    });
    this.parts.set(chapter, frames);
    this.strip.append(h('div', { class: 'part' }, frames, ending));
    this.ending = ending ?? null;
    return frames;
  }

  private watch(frames: readonly HTMLElement[]): void {
    for (const frame of frames) {
      this.observer.observe(frame);
      this.nearby.observe(frame);
    }
  }

  /** Only the end of the column matters: the ends of the chapters above it are behind. */
  private watchEnding(): void {
    this.ahead.disconnect();
    if (this.ending) this.ahead.observe(this.ending);
  }

  private frame(address: string, index: number): HTMLElement {
    const image = h('img', { alt: '', decoding: 'async', draggable: 'false' });
    const retry = h('button', { class: 'btn retry pressable', type: 'button' }, this.options.retryLabel);
    const why = h('span', { class: 'retry-note' });
    const frame = h('div', { class: 'frame', 'data-index': index, 'data-state': 'loading' }, image, retry, why);
    let attempt = 0;
    let active = false;
    const loader = new ImageLoader(this.options.transport);
    this.own(() => loader.destroy());
    const load = async (): Promise<void> => {
      frame.dataset.state = 'loading';
      try {
        const source = await loader.load(address, attempt);
        if (source && active && !this.isDestroyed) image.src = source;
      } catch {
        if (active && !this.isDestroyed) frame.dataset.state = 'failed';
      }
    };
    this.listen(image, 'load', () => {
      if (!active) return;
      frame.style.setProperty('--page-aspect', `${image.naturalWidth} / ${image.naturalHeight}`);
      frame.dataset.state = 'ready';
    });
    this.listen(image, 'error', () => {
      if (active) {
        frame.dataset.state = 'failed';
        why.textContent = this.options.transport.imageProblem?.(address) ?? '';
      }
    });
    this.listen(retry, 'click', () => {
      attempt++;
      void load();
    });
    this.visibility.set(frame, (visible) => {
      if (visible === active) return;
      active = visible;
      if (active) void load();
      else {
        loader.clear();
        image.removeAttribute('src');
        frame.dataset.state = 'loading';
      }
    });
    return frame;
  }
}
