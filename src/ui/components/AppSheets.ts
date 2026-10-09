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
  private active: Sheet | null = null;

  constructor(app: AppContext, parent: HTMLElement) {
    this.app = app;
    this.parent = parent;
  }

  confirm(options: { title: string; text: string; confirm: string; destructive?: boolean }): Promise<boolean> {
    return new Promise((resolve) => {
      let answer = false;
      const yes = h('button', { class: `btn btn-block pressable ${options.destructive ? 'btn-danger' : 'btn-primary'}`, type: 'button' }, options.confirm);
      const no = h('button', { class: 'btn btn-block btn-soft pressable', type: 'button' }, this.app.i18n.t('common.cancel'));
      const sheet = this.present({
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
    const sheet = this.present({ title, actions: h('div', { class: 'sheet-actions' }, buttons) });
  }

  present(options: SheetOptions): Sheet {
    return this.replace(() => new Sheet(this.parent, options));
  }

  addLink(): void {
    this.replace(() => openLinkSheet(this.app, this.parent));
  }

  private replace(create: () => Sheet): Sheet {
    this.active?.destroy();
    const sheet = create();
    this.active = sheet;
    void sheet.closed.then(() => {
      if (this.active === sheet) this.active = null;
    });
    return sheet;
  }
}
