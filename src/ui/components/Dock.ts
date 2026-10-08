import type { AppContext } from '../core/AppContext.ts';
import { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';
import { icon } from '../core/icons.ts';
import type { IconName } from '../core/icons.ts';
import { Routes } from '../core/Routes.ts';
import type { TabId } from '../core/View.ts';
import type { MessageKey } from '../i18n/en.ts';

interface Tab {
  readonly id: TabId;
  readonly icon: IconName;
  readonly label: MessageKey;
  readonly href: string;
}

const TABS: readonly Tab[] = [
  { id: 'library', icon: 'library', label: 'tab.library', href: Routes.library() },
  { id: 'discover', icon: 'discover', label: 'tab.discover', href: Routes.discover() },
  { id: 'settings', icon: 'settings', label: 'tab.settings', href: Routes.settings() },
];

/** The tab bar: a floating pill on the root screens, out of the way on the others. */
export class Dock extends Component {
  private readonly app: AppContext;
  private readonly links = new Map<TabId, HTMLAnchorElement>();

  constructor(app: AppContext) {
    super(h('nav', { class: 'dock', 'data-visible': 'false' }));
    this.app = app;
    for (const tab of TABS) {
      const link = h('a', { class: 'dock-item', href: tab.href }, icon(tab.icon, 22), h('span', { class: 'dock-label' }, h('span')));
      this.links.set(tab.id, link);
      this.root.append(link);
    }
    this.relabel();
  }

  /** Writes the names of the tabs in the current language. */
  relabel(): void {
    for (const tab of TABS) {
      const link = this.links.get(tab.id);
      const text = this.app.i18n.t(tab.label);
      const label = link?.querySelector('.dock-label > span');
      if (label) label.textContent = text;
      link?.setAttribute('aria-label', text);
    }
  }

  /** Shows the dock on a root screen, with its tab lit; hides it for a pushed screen (null). */
  show(tab: TabId | null): void {
    this.root.dataset.visible = String(tab !== null);
    for (const [id, link] of this.links) {
      if (id === tab) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
  }
}
