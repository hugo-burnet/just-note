import type { ReadingMode } from '../../../engine/index.ts';
import { Segmented } from '../../components/Segmented.ts';
import type { AppContext } from '../../core/AppContext.ts';
import { Component } from '../../core/Component.ts';
import { h } from '../../core/dom.ts';

export interface OptionsHandlers {
  mode(mode: ReadingMode): void;
  direction(rtl: boolean): void;
}

/** The content of the "reading options" sheet: mode and direction, saved as the new defaults. */
export class ReaderOptions extends Component {
  constructor(app: AppContext, handlers: OptionsHandlers) {
    super(h('div', { class: 'reader-options' }));
    const { i18n, settings } = app;
    const current = settings.get();

    const mode = new Segmented<ReadingMode>({
      label: i18n.t('reader.mode'),
      value: current.mode,
      choices: [
        { value: 'scroll', label: i18n.t('reader.scroll') },
        { value: 'paged', label: i18n.t('reader.paged') },
      ],
      onChange: (value) => {
        settings.set({ mode: value });
        handlers.mode(value);
      },
    });
    const direction = new Segmented<'ltr' | 'rtl'>({
      label: i18n.t('reader.direction'),
      value: current.rtl ? 'rtl' : 'ltr',
      choices: [
        { value: 'ltr', label: i18n.t('reader.ltr') },
        { value: 'rtl', label: i18n.t('reader.rtl') },
      ],
      onChange: (value) => {
        settings.set({ rtl: value === 'rtl' });
        handlers.direction(value === 'rtl');
      },
    });
    this.own(() => mode.destroy());
    this.own(() => direction.destroy());
    this.root.append(
      h('div', null, h('span', { class: 'row-label' }, i18n.t('reader.mode')), mode.root),
      h('div', null, h('span', { class: 'row-label' }, i18n.t('reader.direction')), direction.root),
    );
  }
}
