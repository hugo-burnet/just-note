import { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';

export interface LargeHeaderOptions {
  readonly title: string;
  /** Buttons at the right of the bar. */
  readonly actions?: readonly HTMLElement[];
}

/**
 * The header of a root screen, in two parts a screen puts at its top: the bar,
 * which sticks (clear at first, frosted once the content slides under it, and
 * showing the small title when the large one has scrolled away), and the large
 * title itself.
 */
export class LargeHeader extends Component {
  /** The large title, to put right under the bar. */
  readonly title: HTMLElement;
  private readonly large: HTMLElement;

  constructor(options: LargeHeaderOptions) {
    super(
      h(
        'header',
        { class: 'header' },
        h('div', { class: 'wrap header-row' }, h('span', { class: 'compact-title' }, options.title), h('div', { class: 'header-actions' }, options.actions ?? [])),
      ),
    );
    this.large = h('h1', { class: 'large-title' }, options.title);
    this.title = h('div', { class: 'wrap' }, this.large);

    let frame = 0;
    const update = (): void => {
      frame = 0;
      this.root.dataset.scrolled = String(window.scrollY > 4);
      const barBottom = this.root.getBoundingClientRect().bottom;
      this.root.dataset.collapsed = String(this.large.getBoundingClientRect().bottom < barBottom + 8);
    };
    this.listen(window, 'scroll', () => {
      if (frame === 0) frame = requestAnimationFrame(update);
    }, { passive: true });
    this.own(() => cancelAnimationFrame(frame));
    update();
  }

  override destroy(): void {
    this.title.remove();
    super.destroy();
  }
}
