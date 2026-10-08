import type { AppContext } from './AppContext.ts';
import { Component } from './Component.ts';
import { h } from './dom.ts';

export type TabId = 'library' | 'discover' | 'settings';

/**
 * A screen. Root screens belong to a tab of the dock; the others (a series, the
 * reader) are pushed on top of them and return where they came from.
 */
export abstract class View extends Component {
  /** The dock tab this screen belongs to; null for a pushed screen. */
  abstract readonly tab: TabId | null;
  protected readonly app: AppContext;

  protected constructor(app: AppContext, name: string) {
    super(h('main', { class: `view view-${name}` }));
    this.app = app;
  }

  /** Called once the screen is on display: this is where loading starts. */
  abstract open(): void | Promise<void>;

  protected setTitle(title?: string): void {
    if (this.isDestroyed) return;
    const name = this.app.i18n.t('app.name');
    document.title = title ? `${title} · ${name}` : name;
  }
}
