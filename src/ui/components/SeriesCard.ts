import type { AppContext } from '../core/AppContext.ts';
import { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';
import { icon } from '../core/icons.ts';
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
  readonly progressLabel?: string | undefined;
  /** Position in the grid, which sets when the card appears. */
  readonly index: number;
  /** A long press, or a right click. */
  readonly onMenu?: () => void;
}

export class SeriesCard extends Component {
  constructor(app: AppContext, options: SeriesCardOptions) {
    super(h('article', { class: 'card' }));
    this.root.style.setProperty('--i', String(Math.min(options.index, 10)));

    const cover = new Cover(app.transport, { url: options.cover, title: options.title });
    this.own(() => cover.destroy());
    if (options.progress !== undefined) {
      const bar = h('div', { class: 'progress', 'aria-hidden': 'true' }, h('i'));
      bar.style.setProperty('--p', String(Math.min(Math.max(options.progress, 0), 1)));
      cover.root.append(bar);
    }
    if (options.progressLabel) cover.root.append(h('span', { class: 'cover-progress' }, options.progressLabel));
    const link = h('a', { class: 'card-link pressable', href: Routes.series(options.url) }, cover.root, h('p', { class: 'card-title' }, options.title));
    this.root.append(link);
    if (options.meta) link.append(h('p', { class: 'card-meta' }, options.meta));

    if (options.onMenu) {
      const menu = h('button', { class: 'card-menu icon-btn pressable', type: 'button', 'aria-label': app.i18n.t('library.cardMenu', { title: options.title }) }, icon('more', 18));
      this.listen(menu, 'click', () => options.onMenu?.());
      this.root.append(menu);
      this.listen(this.root, 'contextmenu', (event) => {
        event.preventDefault();
        options.onMenu?.();
      });
    }
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
