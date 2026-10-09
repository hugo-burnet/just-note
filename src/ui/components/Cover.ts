import type { Transport } from '../../engine/index.ts';
import { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';
import { ImageLoader } from '../core/ImageLoader.ts';

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
  private displayed: ImageLoader;
  private replacement: ImageLoader | null = null;

  constructor(transport: Transport, options: CoverOptions) {
    super(h('div', { class: 'cover', 'data-state': options.url ? 'loading' : 'empty' }));
    this.transport = transport;
    this.title = options.title;
    this.displayed = new ImageLoader(transport);
    this.own(() => { this.displayed.destroy(); this.replacement?.destroy(); });
    if (!options.url) {
      this.root.append(this.initials());
      return;
    }
    this.image = this.picture(options.eager === true);
    this.root.append(this.image);
    const loader = this.displayed;
    void loader.load(options.url).then((src) => {
      if (src && !this.isDestroyed && this.displayed === loader && this.image) this.image.src = src;
    });
  }

  /**
   * A better picture for the same cover (the one a listing showed was a thumbnail): it takes the place of
   * the first once it has loaded, and where it never does, the first stays.
   */
  upgrade(url: string): void {
    this.replacement?.destroy();
    const loader = new ImageLoader(this.transport);
    this.replacement = loader;
    void this.upgrading(url, loader);
  }

  private async upgrading(url: string, loader: ImageLoader): Promise<void> {
    try {
      const src = await loader.load(url);
      if (!src || this.isDestroyed) return;
      const probe = new Image();
      probe.src = src;
      await probe.decode();
      if (this.isDestroyed || this.replacement !== loader) return;
      this.replace(src);
      this.displayed.destroy();
      this.displayed = loader;
      this.replacement = null;
    } catch {
      // The first cover stays visible when the better one cannot be read.
    } finally {
      if (this.replacement === loader) this.replacement = null;
      if (this.displayed !== loader) loader.destroy();
    }
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
