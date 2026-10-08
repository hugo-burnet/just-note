import type { AppContext } from '../core/AppContext.ts';
import { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';

/** What the user sees when something fails: plain words, a way to retry, and the details to send back. */
export class ErrorPanel extends Component {
  constructor(app: AppContext, error: unknown, options: { retry?: () => void } = {}) {
    super(h('section', { class: 'error-panel', role: 'alert' }));
    const t = app.i18n.t.bind(app.i18n);
    const text = app.errors.describe(error);
    const report = app.errors.report(error);

    const retry = options.retry && h('button', { class: 'btn btn-primary pressable', type: 'button' }, t('common.retry'));
    const copy = h('button', { class: 'btn btn-soft pressable', type: 'button' }, t('error.copy'));
    if (retry) this.listen(retry, 'click', () => options.retry?.());
    this.listen(copy, 'click', async () => {
      if (await app.clipboard.writeText(report)) app.toasts.show(t('error.copied'));
    });

    this.root.append(
      h('h2', null, text.title),
      h('p', null, text.hint),
      h('div', { class: 'error-actions' }, retry, copy),
      h('details', null, h('summary', null, t('error.details')), h('pre', { class: 'selectable' }, report)),
    );
  }
}
