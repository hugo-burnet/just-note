import type { Direction } from '../../../engine/index.ts';
import { h } from '../../core/dom.ts';
import { ReadingSurface, retried } from './ReadingSurface.ts';
import type { SurfaceOptions } from './ReadingSurface.ts';

/**
 * The pages one under the other, like a webtoon. The page being read is the one
 * crossing a thin band in the middle of the screen.
 */
export class ScrollMode extends ReadingSurface {
  private readonly frames: HTMLElement[] = [];
  private readonly observer: IntersectionObserver;

  constructor(options: SurfaceOptions) {
    super(h('div', { class: 'stage', 'data-mode': 'scroll' }), options);
    const strip = h('div', { class: 'strip' });
    options.pages.forEach((address, index) => {
      const frame = this.frame(address, index);
      this.frames.push(frame);
      strip.append(frame);
    });
    if (options.ending) strip.append(options.ending);
    this.root.append(strip);

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) options.handlers.page(Number((entry.target as HTMLElement).dataset.index));
      },
      { root: this.root, rootMargin: '-45% 0px -45% 0px' },
    );
    this.own(() => this.observer.disconnect());

    this.listen(this.root, 'click', (event) => {
      if (!(event.target as Element).closest('a, button')) options.handlers.toggleChrome();
    });
    this.listen(this.root, 'touchmove', () => options.handlers.hideChrome(), { passive: true });
    this.listen(this.root, 'wheel', () => options.handlers.hideChrome(), { passive: true });

    // Land where the reader left off, and only then start watching which page is in the middle.
    requestAnimationFrame(() => {
      this.frames[options.startPage]?.scrollIntoView({ block: 'start' });
      for (const frame of this.frames) this.observer.observe(frame);
    });
  }

  goTo(page: number): void {
    this.frames[page]?.scrollIntoView({ block: 'start' });
  }

  advance(direction: Direction): void {
    this.root.scrollBy({ top: (direction === 'forward' ? 1 : -1) * this.root.clientHeight * 0.85, behavior: 'smooth' });
  }

  private frame(address: string, index: number): HTMLElement {
    const image = h('img', { alt: '', decoding: 'async', loading: 'lazy', draggable: 'false' });
    const retry = h('button', { class: 'btn retry pressable', type: 'button' }, this.options.retryLabel);
    const frame = h('div', { class: 'frame', 'data-index': index, 'data-state': 'loading' }, image, retry);
    let attempt = 0;
    const load = async (): Promise<void> => {
      frame.dataset.state = 'loading';
      const source = await this.options.transport.imageSource(address);
      if (!this.isDestroyed) image.src = retried(source, attempt);
    };
    this.listen(image, 'load', () => {
      frame.dataset.state = 'ready';
    });
    this.listen(image, 'error', () => {
      frame.dataset.state = 'failed';
    });
    this.listen(retry, 'click', () => {
      attempt++;
      void load();
    });
    void load();
    return frame;
  }
}
