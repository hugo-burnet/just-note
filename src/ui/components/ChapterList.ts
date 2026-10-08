import type { Chapter, ChapterOrder, Library } from '../../engine/index.ts';
import { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';
import { icon } from '../core/icons.ts';
import { Routes } from '../core/Routes.ts';
import type { I18n } from '../i18n/I18n.ts';

export interface ChapterListOptions {
  readonly seriesUrl: string;
  readonly chapters: readonly Chapter[];
  readonly library: Library;
  readonly i18n: I18n;
  readonly order: ChapterOrder;
}

const label = (chapter: Chapter): string => (Number.isFinite(chapter.number) ? String(chapter.number) : '·');

/** The chapters of a series, with the ones read ticked and the one in progress marked. */
export class ChapterList extends Component {
  private readonly options: ChapterListOptions;

  constructor(options: ChapterListOptions) {
    super(h('ul', { class: 'chapters' }));
    this.options = options;
    this.show(options.order);
  }

  show(order: ChapterOrder): void {
    // The engine hands chapters over oldest first.
    const chapters = order === 'desc' ? [...this.options.chapters].reverse() : this.options.chapters;
    this.root.replaceChildren(...chapters.map((chapter) => this.row(chapter)));
  }

  private row(chapter: Chapter): HTMLElement {
    const { seriesUrl, library, i18n } = this.options;
    const read = library.isRead(seriesUrl, chapter.key);
    const current = library.position(seriesUrl)?.chapter === chapter.url;
    return h(
      'li',
      null,
      h(
        'a',
        {
          class: 'chapter pressable',
          href: Routes.read(chapter.url),
          'data-read': String(read),
          'aria-current': current ? 'true' : null,
        },
        h('span', { class: 'chapter-num' }, label(chapter)),
        h('span', { class: 'chapter-text' }, h('span', { class: 'chapter-title' }, chapter.title), chapter.date ? h('span', { class: 'chapter-date' }, chapter.date) : null),
        read ? h('span', { class: 'chapter-mark', role: 'img', 'aria-label': i18n.t('series.read') }, icon('check', 18)) : h('span', { class: 'chapter-mark', 'aria-hidden': 'true' }),
      ),
    );
  }
}
