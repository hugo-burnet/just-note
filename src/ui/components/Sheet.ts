import { Component } from '../core/Component.ts';
import { h, nextFrame } from '../core/dom.ts';

export interface SheetOptions {
  readonly title: string;
  readonly text?: string;
  readonly body?: HTMLElement;
  readonly actions?: HTMLElement;
}

const DISMISS_DISTANCE = 100;
const CLOSE_MS = 300;

/**
 * A panel that slides up from the bottom, dims what is behind it, and goes away
 * when dragged down, tapped outside of, or on Escape.
 */
export class Sheet extends Component {
  /** Settles once the sheet has gone. */
  readonly closed: Promise<void>;
  private settle: () => void = () => {};
  private readonly panel: HTMLElement;
  private readonly opener: Element | null = document.activeElement;
  private closing = false;

  constructor(parent: HTMLElement, options: SheetOptions) {
    super(h('div', { class: 'sheet-host', 'data-open': 'false', role: 'dialog', 'aria-modal': 'true', 'aria-label': options.title }));
    this.closed = new Promise((resolve) => {
      this.settle = resolve;
    });
    this.panel = h(
      'div',
      { class: 'sheet' },
      h('span', { class: 'sheet-grip' }),
      h('h2', { class: 'sheet-title' }, options.title),
      options.text && h('p', { class: 'sheet-text' }, options.text),
      options.body && h('div', { class: 'sheet-body' }, options.body),
      options.actions,
    );
    const backdrop = h('div', { class: 'sheet-backdrop' });
    this.root.append(backdrop, this.panel);

    this.listen(backdrop, 'click', () => void this.close());
    this.listen<KeyboardEvent>(document, 'keydown', (event) => {
      if (event.key === 'Escape') void this.close();
    });
    this.dragToDismiss();

    document.documentElement.classList.add('sheet-open');
    this.own(() => document.documentElement.classList.remove('sheet-open'));
    parent.append(this.root);
    nextFrame(() => {
      this.root.dataset.open = 'true';
      this.panel.querySelector<HTMLElement>('input, button')?.focus({ preventScroll: true });
    });
  }

  async close(): Promise<void> {
    if (this.closing) return;
    this.closing = true;
    this.root.dataset.open = 'false';
    await new Promise<void>((resolve) => setTimeout(resolve, CLOSE_MS));
    (this.opener as HTMLElement | null)?.focus?.({ preventScroll: true });
    this.destroy();
    this.settle();
  }

  private dragToDismiss(): void {
    let startY = 0;
    let dragging = false;
    const travelled = (event: PointerEvent): number => Math.max(0, event.clientY - startY);

    this.listen<PointerEvent>(this.panel, 'pointerdown', (event) => {
      if (!(event.target as Element).closest('.sheet-grip, .sheet-title, .sheet-text')) return;
      dragging = true;
      startY = event.clientY;
      this.panel.dataset.dragging = 'true';
      this.panel.setPointerCapture(event.pointerId);
    });
    this.listen<PointerEvent>(this.panel, 'pointermove', (event) => {
      if (dragging) this.root.style.setProperty('--drag', `${travelled(event)}px`);
    });
    const release = (event: PointerEvent): void => {
      if (!dragging) return;
      dragging = false;
      delete this.panel.dataset.dragging;
      if (travelled(event) > DISMISS_DISTANCE) void this.close();
      else this.root.style.setProperty('--drag', '0px');
    };
    this.listen<PointerEvent>(this.panel, 'pointerup', release);
    this.listen<PointerEvent>(this.panel, 'pointercancel', release);
  }
}
