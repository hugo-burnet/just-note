import { LargeHeader } from '../components/LargeHeader.ts';
import { Segmented } from '../components/Segmented.ts';
import type { AppContext } from '../core/AppContext.ts';
import type { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';
import { View } from '../core/View.ts';
import { languageName } from '../i18n/languages.ts';
import { CONTENT_CACHES } from '../../platform/web/cacheNames.ts';

/** Appearance, reading, connection, data: grouped like the settings of a phone. */
export class SettingsView extends View {
  readonly tab = 'settings' as const;
  private readonly parts: Component[] = [];
  private language = this.app.i18n.current;

  constructor(app: AppContext) {
    super(app, 'settings');
  }

  open(): void {
    this.build();
    // The texts are rebuilt when the language changes (the app has already switched it by then).
    this.own(
      this.app.settings.subscribe(() => {
        if (this.app.i18n.current === this.language) return;
        this.language = this.app.i18n.current;
        this.build();
      }),
    );
  }

  private build(): void {
    for (const part of this.parts.splice(0)) part.destroy();
    this.root.replaceChildren();
    const { i18n, settings } = this.app;
    const current = settings.get();
    this.setTitle(i18n.t('settings.title'));

    const header = new LargeHeader({ title: i18n.t('settings.title') });
    this.parts.push(header);
    this.root.append(
      header.root,
      header.title,
      h(
        'div',
        { class: 'wrap' },
        this.group('settings.appearance', [
          this.row(i18n.t('settings.theme'), this.segmented(i18n.t('settings.theme'), current.theme, [
            { value: 'auto', label: i18n.t('settings.themeAuto') },
            { value: 'dark', label: i18n.t('settings.themeDark') },
            { value: 'light', label: i18n.t('settings.themeLight') },
          ], (theme) => settings.set({ theme }))),
          this.row(i18n.t('settings.language'), this.segmented(i18n.t('settings.language'), current.lang, [
            { value: 'auto', label: i18n.t('settings.languageAuto') },
            { value: 'en', label: languageName('en') },
            { value: 'fr', label: languageName('fr') },
          ], (lang) => settings.set({ lang }))),
        ]),
        this.group('settings.reading', [
          this.row(i18n.t('settings.seriesLanguage'), this.segmented(i18n.t('settings.seriesLanguage'), current.seriesLang, [
            { value: 'auto', label: i18n.t('settings.languageAuto') },
            { value: 'en', label: languageName('en') },
            { value: 'fr', label: languageName('fr') },
          ], (seriesLang) => settings.set({ seriesLang })), i18n.t('settings.seriesLanguageHint')),
          this.row(i18n.t('reader.mode'), this.segmented(i18n.t('reader.mode'), current.mode, [
            { value: 'auto', label: i18n.t('reader.auto') },
            { value: 'scroll', label: i18n.t('reader.scroll') },
            { value: 'paged', label: i18n.t('reader.paged') },
          ], (mode) => settings.set({ mode })), i18n.t('reader.autoHint')),
          this.row(i18n.t('reader.direction'), this.segmented(i18n.t('reader.direction'), current.direction, [
            { value: 'auto', label: i18n.t('reader.auto') },
            { value: 'ltr', label: i18n.t('reader.ltr') },
            { value: 'rtl', label: i18n.t('reader.rtl') },
          ], (direction) => settings.set({ direction }))),
        ]),
        this.connection(),
        this.data(),
        h('p', { class: 'fineprint selectable' }, i18n.t('settings.privacy')),
        h('p', { class: 'fineprint' }, `${i18n.t('app.name')} ${__APP_VERSION__}`),
      ),
    );
    this.app.router.restoreScroll();
  }

  private connection(): HTMLElement {
    const { i18n, settings } = this.app;
    const input = h('input', {
      class: 'field',
      type: 'text',
      value: settings.get().proxyBase,
      placeholder: 'https://…',
      inputmode: 'url',
      autocapitalize: 'off',
      autocomplete: 'off',
      spellcheck: 'false',
      'aria-label': i18n.t('settings.proxy'),
    });
    const store = (): void => {
      settings.set({ proxyBase: input.value.trim() });
      // What the box shows is what is used: an emptied box shows the default again.
      input.value = settings.get().proxyBase;
    };
    this.listen(input, 'change', store);

    const status = h('span', { class: 'row-status', role: 'status' });
    const test = h('button', { class: 'row-action pressable', type: 'button' }, h('span', null, i18n.t('settings.testProxy')), status);
    this.listen(test, 'click', async () => {
      store();
      status.textContent = '…';
      status.textContent = (await this.app.checkProxy()) ? i18n.t('settings.proxyOk') : i18n.t('settings.proxyFail');
    });
    return this.group('settings.connection', [this.row(i18n.t('settings.proxy'), input, i18n.t('settings.proxyHint')), test]);
  }

  private data(): HTMLElement {
    const { i18n, library, sheets, toasts } = this.app;
    const cache = h('button', { class: 'row-action pressable', type: 'button' }, i18n.t('settings.clearCache'));
    this.listen(cache, 'click', async () => {
      if ('caches' in window) await Promise.all(CONTENT_CACHES.map((name) => caches.delete(name)));
      toasts.show(i18n.t('settings.cacheCleared'));
    });
    const erase = h('button', { class: 'row-action danger pressable', type: 'button' }, i18n.t('settings.clearLibrary'));
    this.listen(erase, 'click', async () => {
      const confirmed = await sheets.confirm({
        title: i18n.t('settings.clearLibraryTitle'),
        text: i18n.t('settings.clearLibraryText'),
        confirm: i18n.t('settings.clearLibrary'),
        destructive: true,
      });
      if (!confirmed) return;
      library.clear();
      toasts.show(i18n.t('settings.libraryCleared'));
    });
    return this.group('settings.data', [cache, erase]);
  }

  private segmented<T extends string>(label: string, value: T, choices: ReadonlyArray<{ value: T; label: string }>, onChange: (value: T) => void): HTMLElement {
    const control = new Segmented<T>({ label, choices, value, onChange });
    this.parts.push(control);
    return control.root;
  }

  private row(label: string, control: HTMLElement, hint?: string): HTMLElement {
    return h('div', { class: 'row' }, h('span', { class: 'row-label' }, label), control, hint ? h('p', { class: 'row-hint' }, hint) : null);
  }

  private group(title: 'settings.appearance' | 'settings.reading' | 'settings.connection' | 'settings.data', rows: readonly HTMLElement[]): HTMLElement {
    return h('section', null, h('h2', { class: 'group-title' }, this.app.i18n.t(title)), h('div', { class: 'group' }, rows));
  }
}
