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
  private readonly transport: Transport;
  private readonly title: string;
  private image: HTMLImageElement | null = null;

  constructor(transport: Transport, options: CoverOptions) {
    super(h('div', { class: 'cover', 'data-state': options.url ? 'loading' : 'empty' }));
    this.transport = transport;
    this.title = options.title;
    if (!options.url) {
      this.root.append(this.initials());
      return;
    }
    this.image = this.picture(options.eager === true);
    this.root.append(this.image);
    void transport.imageSource(options.url).then((src) => {
      if (!this.isDestroyed && this.image) this.image.src = src;
    });
  }

  /**
   * A better picture for the same cover (the one a listing showed was a thumbnail): it takes the place of
   * the first once it has loaded, and where it never does, the first stays.
   */
  upgrade(url: string): void {
    void this.transport.imageSource(url).then((src) => {
      if (this.isDestroyed) return;
      const loading = new Image();
      loading.addEventListener('load', () => this.replace(src));
      loading.src = src;
    });
  }

  private replace(src: string): void {
    if (this.isDestroyed) return;
    if (!this.image) {
      // There was no picture, or it failed: the better one is the first.
      this.root.querySelector('.cover-initials')?.remove();
      this.image = this.picture(true);
      this.root.append(this.image);
    }
    this.image.src = src;
  }

  private picture(eager: boolean): HTMLImageElement {
    const image = h('img', { alt: '', decoding: 'async', loading: eager ? 'eager' : 'lazy', draggable: 'false' });
    this.listen(image, 'load', () => {
      this.root.dataset.state = 'ready';
    });
    this.listen(image, 'error', () => {
      // A picture that was replaced by a better one is not a cover that failed.
      if (this.image !== image) return;
      this.root.dataset.state = 'empty';
      image.remove();
      this.image = null;
      this.root.append(this.initials());
    });
    return image;
  }

  private initials(): HTMLElement {
    return h('span', { class: 'cover-initials', 'aria-hidden': 'true' }, this.title.trim().slice(0, 2).toUpperCase());
  }
}
