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
 * Fetches pages the way a browser would, past an anti-bot check, and shows one report to copy:
 * what a site really sends, seen from this phone, which is what a module for it is written from.
 * Several addresses (one per line) are fetched in turn, so that one paste is enough.
 */
export class DiagnosticPanel extends Component {
  private readonly app: AppContext;
  private readonly probe: PageProbe;
  private readonly field: HTMLTextAreaElement;
  private readonly fetchButton: HTMLButtonElement;
  private readonly copyButton: HTMLButtonElement;
  private readonly status: HTMLElement;
  private readonly output: HTMLElement;
  private report = '';

  constructor(app: AppContext, probe: PageProbe) {
    const { i18n } = app;
    const field = h('textarea', {
      class: 'field field-area',
      rows: 3,
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
    const addresses = this.field.value.split(/\s+/).filter(Boolean);
    if (addresses.length === 0 || addresses.some((address) => !/^https?:\/\//i.test(address))) {
      toasts.show(i18n.t('diagnostic.noAddress'));
      return;
    }
    this.fetchButton.disabled = true;
    const reports: string[] = [];
    let failed = false;
    for (const [index, address] of addresses.entries()) {
      if (this.isDestroyed) return;
      this.status.textContent = i18n.t('diagnostic.progress', { n: index + 1, total: addresses.length });
      try {
        reports.push(await this.probe.fetch(address, {
          statusLabel: i18n.t('challenge.checking'),
          readingLabel: i18n.t('challenge.reading'),
          cancelLabel: i18n.t('common.cancel'),
        }));
      } catch (error) {
        failed = true;
        reports.push(`Just Read page report\nfailed: ${describe(error)}\naddress: ${address}`);
      }
    }
    this.report = reports.join('\n\n');
    if (this.isDestroyed) return;
    this.status.textContent = i18n.t(failed ? 'diagnostic.failed' : 'diagnostic.done', { n: this.report.length });
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
