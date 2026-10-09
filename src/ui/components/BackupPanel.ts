import { MAX_BACKUP_BYTES } from '../../engine/index.ts';
import type { AppContext } from '../core/AppContext.ts';
import { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';
import { icon } from '../core/icons.ts';

type BackupContext = Pick<AppContext, 'library' | 'i18n' | 'usesProxy' | 'toasts'> & {
  readonly clipboard: Pick<AppContext['clipboard'], 'writeText'>;
  readonly sheets: Pick<AppContext['sheets'], 'present'>;
};

/** Export explicitly; imports merge only after the whole file has been validated. */
export class BackupPanel extends Component {
  constructor(app: BackupContext) {
    const { i18n } = app;
    const exportButton = h('button', { class: 'btn btn-primary pressable', type: 'button' }, icon('download', 18), i18n.t('settings.exportLibrary'));
    const importButton = h('button', { class: 'btn btn-soft pressable', type: 'button' }, icon('upload', 18), i18n.t('settings.importLibrary'));
    const input = h('input', { type: 'file', accept: '.json,application/json', hidden: true, 'aria-label': i18n.t('settings.importLibrary') });
    const status = h('p', { class: 'backup-status', role: 'status' });
    super(h('div', { class: 'backup-panel' },
      h('div', { class: 'backup-heading' }, h('span', { class: 'setting-symbol' }, icon('library', 22)), h('div', null,
        h('h3', null, i18n.t('settings.backupTitle')), h('p', { class: 'row-hint' }, i18n.t('settings.backupHint')))),
      h('div', { class: 'backup-actions' }, exportButton, importButton), input, status));

    this.listen(exportButton, 'click', () => {
      const raw = app.library.exportBackup();
      if (!app.usesProxy) {
        const text = h('textarea', { class: 'backup-text selectable', readonly: true, 'aria-label': i18n.t('settings.backupTitle') }, raw);
        const copy = h('button', { class: 'btn btn-primary pressable', type: 'button' }, i18n.t('settings.copyBackup'));
        copy.addEventListener('click', async () => {
          app.toasts.show(i18n.t(await app.clipboard.writeText(raw) ? 'settings.backupCopied' : 'diagnostic.copyFailed'));
        });
        app.sheets.present({ title: i18n.t('settings.exportLibrary'), body: h('div', { class: 'stack' }, text, copy) });
        return;
      }
      const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
      const link = h('a', { href: url, download: `just-read-${new Date().toISOString().slice(0, 10)}.json` });
      this.root.append(link);
      link.click();
      link.remove();
      this.after(1000, () => URL.revokeObjectURL(url));
      this.own(() => URL.revokeObjectURL(url));
      status.textContent = i18n.t('settings.backupExported');
      status.dataset.error = 'false';
    });
    this.listen(importButton, 'click', () => input.click());
    this.listen(input, 'change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      importButton.disabled = true;
      try {
        if (file.size > MAX_BACKUP_BYTES) throw new Error('large backup');
        const raw = await file.text();
        if (this.isDestroyed) return;
        const result = app.library.importBackup(raw);
        status.textContent = result.persisted ? i18n.plural('settings.backupImported', result.count) : i18n.t('settings.backupStorageFull');
        status.dataset.error = String(!result.persisted);
      } catch {
        if (!this.isDestroyed) {
          status.textContent = i18n.t('settings.backupInvalid');
          status.dataset.error = 'true';
        }
      } finally { importButton.disabled = false; }
    });
  }
}
