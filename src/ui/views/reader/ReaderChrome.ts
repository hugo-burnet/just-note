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

/** What the controls say about the chapter being read. */
export interface ChromeChapter {
  readonly title: string;
  readonly pageCount: number;
  readonly hasPrevious: boolean;
  readonly hasNext: boolean;
}

export interface ChromeOptions extends ChromeChapter {
  readonly i18n: I18n;
  readonly subtitle: string;
  readonly callbacks: ChromeCallbacks;
}

/** The controls over the page: the title and the page counter above, the slider and the chapter buttons below. */
export class ReaderChrome extends Component {
  private readonly counter = h('span', { class: 'reader-count' });
  private readonly title = h('strong');
  private readonly slider: HTMLInputElement;
  private readonly previous: HTMLElement;
  private readonly next: HTMLElement;
  private total = 0;
  private shown = true;

  constructor(options: ChromeOptions) {
    super(h('div', { class: 'chrome', 'data-visible': 'true' }));
    const { i18n, callbacks } = options;

    const button = (name: 'chevronLeft' | 'chevronRight' | 'settings', label: string, run: () => void): HTMLElement => {
      const element = h('button', { class: 'icon-btn pressable', type: 'button', 'aria-label': label }, icon(name));
      this.listen(element, 'click', () => element.getAttribute('aria-disabled') !== 'true' && run());
      return element;
    };

    this.slider = h('input', { class: 'slider', type: 'range', min: 1, step: 1, value: 1, 'aria-label': i18n.t('reader.page') });
    this.previous = button('chevronLeft', i18n.t('reader.previous'), callbacks.previous);
    this.next = button('chevronRight', i18n.t('reader.next'), callbacks.next);
    this.listen(this.slider, 'input', () => callbacks.slide(Number(this.slider.value) - 1));

    this.root.append(
      h(
        'header',
        { class: 'chrome-top' },
        button('chevronLeft', i18n.t('common.back'), callbacks.back),
        h('div', { class: 'reader-title' }, this.title, h('span', null, options.subtitle)),
        this.counter,
      ),
      h(
        'footer',
        { class: 'chrome-bottom' },
        h(
          'div',
          { class: 'reader-bar' },
          this.previous,
          this.slider,
          this.next,
          button('settings', i18n.t('reader.options'), callbacks.options),
        ),
      ),
    );
    this.setChapter(options);
  }

  /** Another chapter is being read (scrolling went on into it). */
  setChapter(chapter: ChromeChapter): void {
    this.title.textContent = chapter.title;
    this.total = chapter.pageCount;
    this.slider.max = String(Math.max(1, this.total));
    const enable = (element: HTMLElement, enabled: boolean): void => {
      if (enabled) element.removeAttribute('aria-disabled');
      else element.setAttribute('aria-disabled', 'true');
    };
    enable(this.previous, chapter.hasPrevious);
    enable(this.next, chapter.hasNext);
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
