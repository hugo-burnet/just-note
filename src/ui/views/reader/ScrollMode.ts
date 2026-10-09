import type { Direction } from '../../../engine/index.ts';
import { h } from '../../core/dom.ts';
import { ReadingSurface } from './ReadingSurface.ts';
import { ImageLoader } from '../../core/ImageLoader.ts';
import type { SurfaceOptions } from './ReadingSurface.ts';

/**
 * The pages one under the other, like a webtoon. The page being read is the one
 * crossing a thin band in the middle of the screen.
 */
export class ScrollMode extends ReadingSurface {
  private readonly frames: HTMLElement[] = [];
  private readonly observer: IntersectionObserver;
  private readonly nearby: IntersectionObserver;
  private readonly visibility = new Map<Element, (visible: boolean) => void>();

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
    this.nearby = new IntersectionObserver((entries) => {
      for (const entry of entries) this.visibility.get(entry.target)?.(entry.isIntersecting);
    }, { root: this.root, rootMargin: '100% 0px' });
    this.own(() => this.nearby.disconnect());

    this.listen(this.root, 'click', (event) => {
      if (!(event.target as Element).closest('a, button')) options.handlers.toggleChrome();
    });
    this.listen(this.root, 'touchmove', () => options.handlers.hideChrome(), { passive: true });
    this.listen(this.root, 'wheel', () => options.handlers.hideChrome(), { passive: true });

    // Land where the reader left off, and only then start watching which page is in the middle.
    const firstFrame = requestAnimationFrame(() => {
      if (this.isDestroyed) return;
      this.frames[options.startPage]?.scrollIntoView({ block: 'start' });
      for (const frame of this.frames) {
        this.observer.observe(frame);
        this.nearby.observe(frame);
      }
    });
    this.own(() => cancelAnimationFrame(firstFrame));
  }

  goTo(page: number): void {
    this.frames[page]?.scrollIntoView({ block: 'start' });
  }

  advance(direction: Direction): void {
    this.root.scrollBy({ top: (direction === 'forward' ? 1 : -1) * this.root.clientHeight * 0.85, behavior: 'smooth' });
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
