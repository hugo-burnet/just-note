import type { AppContext, MenuItem, SheetHost } from '../core/AppContext.ts';
import { h } from '../core/dom.ts';
import { icon } from '../core/icons.ts';
import { openLinkSheet } from './LinkSheet.ts';
import { Sheet } from './Sheet.ts';
import type { SheetOptions } from './Sheet.ts';

/** The sheets the app opens from anywhere: confirmations, menus, and "add by link". */
export class AppSheets implements SheetHost {
  private readonly app: AppContext;
  private readonly parent: HTMLElement;

  constructor(app: AppContext, parent: HTMLElement) {
    this.app = app;
    this.parent = parent;
  }

  confirm(options: { title: string; text: string; confirm: string; destructive?: boolean }): Promise<boolean> {
    return new Promise((resolve) => {
      let answer = false;
      const yes = h('button', { class: `btn btn-block pressable ${options.destructive ? 'btn-danger' : 'btn-primary'}`, type: 'button' }, options.confirm);
      const no = h('button', { class: 'btn btn-block btn-soft pressable', type: 'button' }, this.app.i18n.t('common.cancel'));
      const sheet = new Sheet(this.parent, {
        title: options.title,
        text: options.text,
        actions: h('div', { class: 'sheet-actions' }, yes, no),
      });
      yes.addEventListener('click', () => {
        answer = true;
        void sheet.close();
      });
      no.addEventListener('click', () => void sheet.close());
      void sheet.closed.then(() => resolve(answer));
    });
  }

  menu(title: string, items: readonly MenuItem[]): void {
    const buttons = items.map((item) => {
      const button = h('button', { class: `btn btn-block pressable ${item.destructive ? 'btn-danger' : 'btn-soft'}`, type: 'button' }, icon(item.icon, 20), h('span', { class: 'label' }, item.label));
      button.addEventListener('click', () => {
        void sheet.close().then(item.run);
      });
      return button;
    });
    const sheet = new Sheet(this.parent, { title, actions: h('div', { class: 'sheet-actions' }, buttons) });
  }

  present(options: SheetOptions): Sheet {
    return new Sheet(this.parent, options);
  }

  addLink(): void {
    openLinkSheet(this.app, this.parent);
  }
}
