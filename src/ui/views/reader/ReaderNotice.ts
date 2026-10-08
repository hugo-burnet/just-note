import type { ErrorPanel } from '../../components/ErrorPanel.ts';
import type { AppContext } from '../../core/AppContext.ts';
import { Component } from '../../core/Component.ts';
import { h } from '../../core/dom.ts';
import { icon } from '../../core/icons.ts';

/** What the reader shows while a chapter opens, or when it cannot: a way back, and one message. */
export class ReaderNotice extends Component {
  constructor(app: AppContext, back: () => void, failure?: ErrorPanel) {
    super(h('div', { class: 'reader-notice' }));
    const button = h('button', { class: 'icon-btn pressable', type: 'button', 'aria-label': app.i18n.t('common.back') }, icon('chevronLeft'));
    this.listen(button, 'click', back);

    let body: HTMLElement;
    if (failure) {
      body = failure.root;
      this.own(() => failure.destroy());
    } else {
      body = h('div', { class: 'reader-waiting', role: 'status' }, h('span', { class: 'spinner', 'aria-hidden': 'true' }), h('p', { class: 'muted' }, app.i18n.t('reader.loading')));
    }
    this.root.append(button, h('div', { class: 'wrap reader-notice-body' }, body));
  }
}
