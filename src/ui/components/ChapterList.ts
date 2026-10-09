import type { Chapter, ChapterOrder, Downloads, Library } from '../../engine/index.ts';
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
  /** Each chapter gets a button to download it (or to say how its download goes); omitted where nothing can be kept. */
  readonly downloads?: Downloads | undefined;
  /** The download button of a chapter was pressed. */
  readonly onDownload?: (chapter: Chapter) => void;
}

const label = (chapter: Chapter): string => (Number.isFinite(chapter.number) ? String(chapter.number) : '·');

/** The chapters of a series, with the ones read ticked, the one in progress marked, and the ones kept offline shown so. */
export class ChapterList extends Component {
  private readonly options: ChapterListOptions;
  private readonly buttons = new Map<string, { button: HTMLButtonElement; chapter: Chapter }>();

  constructor(options: ChapterListOptions) {
    super(h('ul', { class: 'chapters' }));
    this.options = options;
    this.show(options.order);
    if (options.downloads) this.own(options.downloads.subscribe(() => this.refreshDownloads()));
    // One listener for every row, which show() redraws.
    this.listen(this.root, 'click', (event) => {
      const button = (event.target as Element | null)?.closest<HTMLButtonElement>('.chapter-dl');
      const row = button ? [...this.buttons.values()].find((one) => one.button === button) : undefined;
      if (row) this.options.onDownload?.(row.chapter);
    });
  }

  show(order: ChapterOrder): void {
    // The engine hands chapters over oldest first.
    const chapters = order === 'desc' ? [...this.options.chapters].reverse() : this.options.chapters;
    this.buttons.clear();
    this.root.replaceChildren(...chapters.map((chapter) => this.row(chapter)));
  }

  private row(chapter: Chapter): HTMLElement {
    const { seriesUrl, library, i18n, downloads } = this.options;
    const read = library.isRead(seriesUrl, chapter.key);
    const current = library.position(seriesUrl)?.chapter === chapter.url;
    const link = h(
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
    );
    if (!downloads?.available) return h('li', null, link);
    const button = h('button', { class: 'chapter-dl icon-btn pressable', type: 'button' });
    this.buttons.set(chapter.url, { button, chapter });
    this.paint(button, chapter);
    return h('li', { class: 'has-dl' }, link, button);
  }

  private refreshDownloads(): void {
    for (const { button, chapter } of this.buttons.values()) this.paint(button, chapter);
  }

  /** The button says where the chapter's download is: not asked, waiting, coming in (a ring that fills), kept, or failed. */
  private paint(button: HTMLButtonElement, chapter: Chapter): void {
    const { i18n, downloads } = this.options;
    const state = downloads?.state(chapter.url) ?? null;
    const status = state?.status ?? 'none';
    if (button.dataset.state === status && status !== 'running') return;
    button.dataset.state = status;
    const title = chapter.title;
    if (status === 'running' || status === 'queued') {
      const done = state?.done ?? 0;
      const total = state?.total ?? 0;
      button.style.setProperty('--p', String(total > 0 ? done / total : 0));
      button.setAttribute('aria-label', status === 'queued' ? i18n.t('download.queued', { title }) : i18n.t('download.running', { title, done, total }));
      if (!button.querySelector('.dl-ring')) button.replaceChildren(h('span', { class: 'dl-ring', 'aria-hidden': 'true' }));
      return;
    }
    button.style.removeProperty('--p');
    if (status === 'saved') {
      button.setAttribute('aria-label', i18n.t('download.saved', { title }));
      button.replaceChildren(icon('downloaded', 20));
    } else if (status === 'failed') {
      button.setAttribute('aria-label', i18n.t('download.failed', { title }));
      button.replaceChildren(icon('refresh', 18));
    } else {
      button.setAttribute('aria-label', i18n.t('download.chapter', { title }));
      button.replaceChildren(icon('download', 18));
    }
  }
}
