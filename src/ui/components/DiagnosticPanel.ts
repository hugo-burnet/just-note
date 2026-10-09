import type { PageProbe } from '../../platform/Platform.ts';
import type { AppContext } from '../core/AppContext.ts';
import { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';

/** What went wrong, as a line: the code the app gave it when it has one, then the words. */
function describe(error: unknown): string {
  const { code, message } = error as { code?: unknown; message?: unknown };
  return [typeof code === 'string' ? code : '', typeof message === 'string' ? message : String(error)].filter(Boolean).join(': ');
}

/**
 * Fetches a page the way a browser would, past an anti-bot check, and shows a report to copy:
 * what a site really sends, seen from this phone, which is what a module for it is written from.
 */
export class DiagnosticPanel extends Component {
  private readonly app: AppContext;
  private readonly probe: PageProbe;
  private readonly field: HTMLInputElement;
  private readonly fetchButton: HTMLButtonElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly output: HTMLElement;
  private report = '';

  constructor(app: AppContext, probe: PageProbe) {
    const { i18n } = app;
    const field = h('input', {
      class: 'field',
      type: 'url',
      placeholder: i18n.t('link.placeholder'),
      inputmode: 'url',
      autocapitalize: 'off',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': i18n.t('diagnostic.address'),
    });
    const status = h('span', { class: 'row-status', role: 'status' });
    const fetchButton = h('button', { class: 'row-action pressable', type: 'button' }, h('span', null, i18n.t('diagnostic.fetch')), status);
    const copyButton = h('button', { class: 'row-action pressable', type: 'button', hidden: true }, i18n.t('diagnostic.copy'));
    const output = h('pre', { class: 'diag-output selectable', hidden: true });
    super(h('div', { class: 'row' }, h('p', { class: 'row-hint' }, i18n.t('diagnostic.hint')), field, fetchButton, copyButton, output));
    this.app = app;
    this.probe = probe;
    this.field = field;
    this.fetchButton = fetchButton;
    this.copyButton = copyButton;
    this.status = status;
    this.output = output;
    this.listen(fetchButton, 'click', () => void this.run());
    this.listen(copyButton, 'click', () => void this.copy());
  }

  private async run(): Promise<void> {
    const { i18n, toasts } = this.app;
    const address = this.field.value.trim();
    if (!/^https?:\/\//i.test(address)) {
      toasts.show(i18n.t('diagnostic.noAddress'));
      return;
    }
    this.fetchButton.disabled = true;
    this.status.textContent = i18n.t('diagnostic.working');
    let outcome: string;
    try {
      this.report = await this.probe.fetch(address, { statusLabel: i18n.t('diagnostic.checking'), cancelLabel: i18n.t('common.cancel') });
      outcome = i18n.t('diagnostic.done', { n: this.report.length });
    } catch (error) {
      this.report = `Just Read page report\nfailed: ${describe(error)}`;
      outcome = i18n.t('diagnostic.failed');
    }
    if (this.isDestroyed) return;
    this.status.textContent = outcome;
    this.fetchButton.disabled = false;
    this.output.textContent = this.report;
    this.output.hidden = false;
    this.copyButton.hidden = false;
  }

  private async copy(): Promise<void> {
    const { clipboard, i18n, toasts } = this.app;
    toasts.show(i18n.t((await clipboard.writeText(this.report)) ? 'diagnostic.copied' : 'diagnostic.copyFailed'));
  }
}
