import { Component } from '../../core/Component.ts';
import { h } from '../../core/dom.ts';
import { icon } from '../../core/icons.ts';
import type { I18n } from '../../i18n/I18n.ts';

export interface ChromeCallbacks {
  back(): void;
  slide(index: number): void;
  previous(): void;
  next(): void;
  options(): void;
}

export interface ChromeOptions {
  readonly i18n: I18n;
  readonly title: string;
  readonly subtitle: string;
  readonly pageCount: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
  readonly callbacks: ChromeCallbacks;
}

/** The controls over the page: the title and the page counter above, the slider and the chapter buttons below. */
export class ReaderChrome extends Component {
  private readonly counter = h('span', { class: 'reader-count' });
  private readonly slider: HTMLInputElement;
  private readonly total: number;
  private shown = true;

  constructor(options: ChromeOptions) {
    super(h('div', { class: 'chrome', 'data-visible': 'true' }));
    const { i18n, callbacks } = options;
    this.total = options.pageCount;

    const button = (name: 'chevronLeft' | 'chevronRight' | 'settings', label: string, run: () => void, enabled = true): HTMLElement => {
      const element = h('button', { class: 'icon-btn pressable', type: 'button', 'aria-label': label, 'aria-disabled': enabled ? null : 'true' }, icon(name));
      this.listen(element, 'click', () => enabled && run());
      return element;
    };

    this.slider = h('input', { class: 'slider', type: 'range', min: 1, max: Math.max(1, this.total), step: 1, value: 1, 'aria-label': i18n.t('reader.page') });
    this.listen(this.slider, 'input', () => callbacks.slide(Number(this.slider.value) - 1));

    this.root.append(
      h(
        'header',
        { class: 'chrome-top' },
        button('chevronLeft', i18n.t('common.back'), callbacks.back),
        h('div', { class: 'reader-title' }, h('strong', null, options.title), h('span', null, options.subtitle)),
        this.counter,
      ),
      h(
        'footer',
        { class: 'chrome-bottom' },
        h(
          'div',
          { class: 'reader-bar' },
          button('chevronLeft', i18n.t('reader.previous'), callbacks.previous, options.hasPrevious),
          this.slider,
          button('chevronRight', i18n.t('reader.next'), callbacks.next, options.hasNext),
          button('settings', i18n.t('reader.options'), callbacks.options),
        ),
      ),
    );
    this.setPage(0);
  }

  setPage(page: number): void {
    this.counter.textContent = `${page + 1} / ${this.total}`;
    this.slider.value = String(page + 1);
    this.slider.style.setProperty('--fill', `${this.total > 1 ? (page / (this.total - 1)) * 100 : 100}%`);
  }

  /** In right-to-left reading the slider runs from the right. */
  setDirection(reversed: boolean): void {
    this.slider.dir = reversed ? 'rtl' : 'ltr';
  }

  toggle(): void {
    this.setVisible(!this.shown);
  }

  hide(): void {
    this.setVisible(false);
  }

  private setVisible(visible: boolean): void {
    if (visible === this.shown) return;
    this.shown = visible;
    this.root.dataset.visible = String(visible);
  }
}
