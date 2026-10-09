import { ReaderGestures } from '../../../engine/index.ts';
import type { Direction } from '../../../engine/index.ts';
import { h } from '../../core/dom.ts';
import { ReadingSurface, retried } from './ReadingSurface.ts';
import type { SurfaceOptions } from './ReadingSurface.ts';

const PREFETCH_AHEAD = 2;

/**
 * One page at a time, like a book. Tap an edge, swipe or press a key to turn the
 * page; the middle shows the controls. The previous page stays up until the next
 * one is ready to paint, so turning never flashes.
 */
export class PagedMode extends ReadingSurface {
  private readonly image = h('img', { class: 'single', alt: '', draggable: 'false', decoding: 'async' });
  private readonly paged = h('div', { class: 'paged', 'data-state': 'busy' });
  private rtl: boolean;
  private shown = -1;
  private token = 0;
  private touch: { x: number; y: number } | null = null;

  constructor(options: SurfaceOptions) {
    super(h('div', { class: 'stage', 'data-mode': 'paged' }), options);
    this.rtl = options.rtl;
    const retry = h('button', { class: 'btn retry pressable', type: 'button' }, options.retryLabel);
    // Why it failed, when the transport knows: what to say when someone asks what went wrong.
    const why = h('span', { class: 'retry-note' });
    this.paged.append(this.image, retry, why);
    this.root.append(this.paged);

    this.listen(this.image, 'load', () => {
      this.paged.dataset.state = 'ready';
    });
    this.listen(this.image, 'error', () => {
      this.paged.dataset.state = 'failed';
      why.textContent = options.transport.imageProblem?.(options.pages[this.shown] ?? '') ?? '';
    });
    this.listen(retry, 'click', () => void this.show(this.shown, 1));
    this.listen<MouseEvent>(this.paged, 'click', (event) => {
      if ((event.target as Element).closest('button')) return;
      const intent = ReaderGestures.tap(event.clientX / window.innerWidth, this.rtl);
      if (intent === 'toggle') options.handlers.toggleChrome();
      else options.handlers.turn(intent);
    });
    this.listen<TouchEvent>(this.paged, 'touchstart', (event) => {
      const first = event.touches[0];
      this.touch = event.touches.length === 1 && first ? { x: first.clientX, y: first.clientY } : null;
    }, { passive: true });
    this.listen<TouchEvent>(this.paged, 'touchend', (event) => this.swipe(event), { passive: true });

    void this.show(options.startPage, 0);
  }

  goTo(page: number): void {
    void this.show(page, 0);
  }

  advance(direction: Direction): void {
    this.options.handlers.turn(direction);
  }

  override setDirection(rtl: boolean): void {
    this.rtl = rtl;
  }

  private swipe(event: TouchEvent): void {
    const start = this.touch;
    const end = event.changedTouches[0];
    this.touch = null;
    const zoomed = (window.visualViewport?.scale ?? 1) > 1.05;
    if (!start || !end || zoomed) return;
    const direction = ReaderGestures.swipe(end.clientX - start.x, end.clientY - start.y, this.rtl);
    if (direction) this.options.handlers.turn(direction);
  }

  private async show(page: number, attempt: number): Promise<void> {
    const token = ++this.token;
    this.shown = page;
    this.paged.dataset.state = 'busy';
    const source = retried(await this.address(page), attempt);
    // Keep the previous page up until this one is ready to paint.
    const probe = new Image();
    probe.src = source;
    try {
      await probe.decode();
    } catch {
      // The visible <img> below reports the failure.
    }
    if (token !== this.token || this.isDestroyed) return;
    this.image.src = source;
    for (const next of [page + 1, page + PREFETCH_AHEAD, page - 1]) void this.warm(next);
  }

  private async address(page: number): Promise<string> {
    return this.options.transport.imageSource(this.options.pages[page] ?? '');
  }

  private async warm(page: number): Promise<void> {
    if (page < 0 || page >= this.options.pages.length) return;
    new Image().src = await this.address(page);
  }
}
