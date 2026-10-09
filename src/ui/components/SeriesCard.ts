import type { AppContext } from '../core/AppContext.ts';
import { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';
import { Routes } from '../core/Routes.ts';
import { Cover } from './Cover.ts';

export interface SeriesCardOptions {
  readonly url: string;
  readonly title: string;
  readonly cover: string | null;
  /** The line under the title. */
  readonly meta?: string;
  /** 0 to 1: how much of the series is read. Omitted: no bar. */
  readonly progress?: number;
  /** Position in the grid, which sets when the card appears. */
  readonly index: number;
  /** A long press, or a right click. */
  readonly onMenu?: () => void;
  /**
   * A better cover than `cover`, asked for when the card comes into view (`wanted` says whether it still is, once the
   * answer's turn comes). Null when there is none.
   */
  readonly better?: (wanted: () => boolean) => Promise<string | null>;
}

export class SeriesCard extends Component {
  constructor(app: AppContext, options: SeriesCardOptions) {
    super(h('a', { class: 'card pressable', href: Routes.series(options.url) }));
    this.root.style.setProperty('--i', String(Math.min(options.index, 10)));

    const cover = new Cover(app.transport, { url: options.cover, title: options.title });
    this.own(() => cover.destroy());
    if (options.progress !== undefined) {
      const bar = h('div', { class: 'progress', 'aria-hidden': 'true' }, h('i'));
      bar.style.setProperty('--p', String(Math.min(Math.max(options.progress, 0), 1)));
      cover.root.append(bar);
    }
    this.root.append(cover.root, h('p', { class: 'card-title' }, options.title));
    if (options.meta) this.root.append(h('p', { class: 'card-meta' }, options.meta));
    if (options.better) this.betterWhenSeen(cover, options.better);

    if (options.onMenu) {
      this.listen(this.root, 'contextmenu', (event) => {
        event.preventDefault();
        options.onMenu?.();
      });
    }
  }

  /** Asks for the better cover once, when the card is on screen (or about to be): not for the hundreds a list holds. */
  private betterWhenSeen(cover: Cover, better: (wanted: () => boolean) => Promise<string | null>): void {
    let seen = false;
    let state: 'idle' | 'asking' | 'done' = 'idle';
    const ask = (): void => {
      if (state !== 'idle') return;
      state = 'asking';
      void better(() => seen && !this.isDestroyed).then((url) => {
        // Passed over because the card had left the screen by its turn: it is asked for again when it is seen again.
        state = url || seen ? 'done' : 'idle';
        if (url) cover.upgrade(url);
      });
    };
    if (typeof IntersectionObserver === 'undefined') {
      seen = true;
      ask();
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) seen = entry.isIntersecting;
        if (seen) ask();
      },
      { rootMargin: '300px 0px' },
    );
    observer.observe(this.root);
    this.own(() => observer.disconnect());
  }
}

/** Placeholders shown while a grid loads. */
export function skeletonGrid(count: number): HTMLElement {
  const grid = h('div', { class: 'grid', 'aria-hidden': 'true' });
  for (let i = 0; i < count; i++) {
    const card = h('div', { class: 'card card-skeleton' }, h('div', { class: 'cover', 'data-state': 'loading' }), h('div', { class: 'line-skeleton' }));
    card.style.setProperty('--i', String(Math.min(i, 8)));
    grid.append(card);
  }
  return grid;
}
