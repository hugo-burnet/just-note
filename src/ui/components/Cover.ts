import type { Transport } from '../../engine/index.ts';
import { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';

export interface CoverOptions {
  readonly url: string | null;
  readonly title: string;
  /** Load right away instead of when the browser finds it close to the screen. */
  readonly eager?: boolean;
}

/**
 * A cover: it shimmers while it loads, then fades in. With no address, or when
 * the image fails, the initials of the title stand in.
 */
export class Cover extends Component {
  private readonly title: string;

  constructor(transport: Transport, options: CoverOptions) {
    super(h('div', { class: 'cover', 'data-state': options.url ? 'loading' : 'empty' }));
    this.title = options.title;
    if (!options.url) {
      this.root.append(this.initials());
      return;
    }
    const image = h('img', { alt: '', decoding: 'async', loading: options.eager ? 'eager' : 'lazy', draggable: 'false' });
    this.listen(image, 'load', () => {
      this.root.dataset.state = 'ready';
    });
    this.listen(image, 'error', () => {
      this.root.dataset.state = 'empty';
      image.remove();
      this.root.append(this.initials());
    });
    this.root.append(image);
    void transport.imageSource(options.url).then((src) => {
      if (!this.isDestroyed) image.src = src;
    });
  }

  private initials(): HTMLElement {
    return h('span', { class: 'cover-initials', 'aria-hidden': 'true' }, this.title.trim().slice(0, 2).toUpperCase());
  }
}
