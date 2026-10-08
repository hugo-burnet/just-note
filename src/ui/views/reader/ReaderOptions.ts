import type { DirectionChoice, ModeChoice } from '../../../engine/index.ts';
import { Segmented } from '../../components/Segmented.ts';
import type { AppContext } from '../../core/AppContext.ts';
import { Component } from '../../core/Component.ts';
import { h } from '../../core/dom.ts';

/**
 * The content of the "reading options" sheet: mode and direction, saved as the new
 * choices. "Auto" gives the decision back to the site being read. `changed` runs
 * after each choice, so the reader can apply it.
 */
export class ReaderOptions extends Component {
  constructor(app: AppContext, changed: () => void) {
    super(h('div', { class: 'reader-options' }));
    const { i18n, settings } = app;
    const current = settings.get();

    const mode = new Segmented<ModeChoice>({
      label: i18n.t('reader.mode'),
      value: current.mode,
      choices: [
        { value: 'auto', label: i18n.t('reader.auto') },
        { value: 'scroll', label: i18n.t('reader.scroll') },
        { value: 'paged', label: i18n.t('reader.paged') },
      ],
      onChange: (value) => {
        settings.set({ mode: value });
        changed();
      },
    });
    const direction = new Segmented<DirectionChoice>({
      label: i18n.t('reader.direction'),
      value: current.direction,
      choices: [
        { value: 'auto', label: i18n.t('reader.auto') },
        { value: 'ltr', label: i18n.t('reader.ltr') },
        { value: 'rtl', label: i18n.t('reader.rtl') },
      ],
      onChange: (value) => {
        settings.set({ direction: value });
        changed();
      },
    });
    this.own(() => mode.destroy());
    this.own(() => direction.destroy());
    this.root.append(
      h('div', null, h('span', { class: 'row-label' }, i18n.t('reader.mode')), mode.root),
      h('div', null, h('span', { class: 'row-label' }, i18n.t('reader.direction')), direction.root),
      h('p', { class: 'row-hint' }, i18n.t('reader.autoHint')),
    );
  }
}
