import type { LibraryEntry, ReadingPosition } from '../../engine/index.ts';
import { Cover } from '../components/Cover.ts';
import { EmptyState } from '../components/EmptyState.ts';
import { LargeHeader } from '../components/LargeHeader.ts';
import { SeriesCard } from '../components/SeriesCard.ts';
import type { AppContext } from '../core/AppContext.ts';
import type { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';
import { icon } from '../core/icons.ts';
import { Routes } from '../core/Routes.ts';
import { View } from '../core/View.ts';

/** What the user is reading: the one to pick up again, and the shelf. */
export class LibraryView extends View {
  readonly tab = 'library' as const;
  private readonly content = h('div', { class: 'wrap' });
  private readonly shown: Component[] = [];

  constructor(app: AppContext) {
    super(app, 'library');
  }

  open(): void {
    const { i18n } = this.app;
    this.setTitle();
    const add = h('button', { class: 'icon-btn icon-btn-glass pressable', type: 'button', 'aria-label': i18n.t('library.add') }, icon('plus'));
    this.listen(add, 'click', () => this.app.sheets.addLink());
    const header = new LargeHeader({ title: i18n.t('library.title'), actions: [add] });
    this.own(() => header.destroy());
    this.root.append(header.root, header.title, this.content);
    this.render();
    this.app.router.restoreScroll();
  }

  private render(): void {
    for (const component of this.shown.splice(0)) component.destroy();
    this.content.replaceChildren();
    const { library, i18n } = this.app;
    const entries = library.list();
    if (entries.length === 0) {
      this.content.append(this.empty());
      return;
    }
    const resuming = entries.find((entry) => entry.position);
    if (resuming?.position) this.content.append(this.resumeCard(resuming, resuming.position));
    const grid = h('div', { class: 'grid' });
    entries.forEach((entry, index) => grid.append(this.card(entry, index)));
    this.content.append(h('section', { class: 'section' }, h('h2', { class: 'section-title' }, i18n.plural('library.count', entries.length)), grid));
  }

  private card(entry: LibraryEntry, index: number): HTMLElement {
    const { library, i18n } = this.app;
    const total = entry.chapterCount ?? 0;
    const card = new SeriesCard(this.app, {
      url: entry.url,
      title: entry.title,
      cover: entry.cover,
      meta: entry.position?.title ?? i18n.t('library.notStarted'),
      progress: total > 0 ? library.readCount(entry.url) / total : undefined,
      index,
      onMenu: () => void this.confirmRemoval(entry),
    });
    this.shown.push(card);
    return card.root;
  }

  private resumeCard(entry: LibraryEntry, position: ReadingPosition): HTMLElement {
    const { library, i18n, transport } = this.app;
    const cover = new Cover(transport, { url: entry.cover, title: entry.title, eager: true });
    this.shown.push(cover);

    const total = entry.chapterCount ?? 0;
    const bar = h('div', { class: 'progress', 'aria-hidden': 'true' }, h('i'));
    bar.style.setProperty('--p', String(total > 0 ? library.readCount(entry.url) / total : 0));

    const backdrop = h('img', { class: 'continue-backdrop', alt: '' });
    if (entry.cover) void transport.imageSource(entry.cover).then((src) => (backdrop.src = src));

    return h(
      'a',
      { class: 'continue pressable', href: Routes.read(position.chapter) },
      backdrop,
      cover.root,
      h(
        'div',
        { class: 'continue-text' },
        h('span', { class: 'eyebrow' }, i18n.t('library.continue')),
        h('span', { class: 'continue-title' }, entry.title),
        h('span', { class: 'continue-meta' }, `${position.title} · ${i18n.t('reader.page')} ${position.page + 1}`),
        total > 0 ? bar : null,
      ),
      h('span', { class: 'continue-play' }, icon('play', 20, { filled: true })),
    );
  }

  private empty(): HTMLElement {
    const { i18n } = this.app;
    const paste = h('button', { class: 'btn btn-primary pressable', type: 'button' }, icon('link', 18), i18n.t('library.emptyPaste'));
    this.listen(paste, 'click', () => this.app.sheets.addLink());
    const discover = h('a', { class: 'btn btn-soft pressable', href: Routes.discover() }, icon('discover', 18), i18n.t('library.emptyBrowse'));
    const empty = new EmptyState({ icon: 'book', title: i18n.t('library.emptyTitle'), text: i18n.t('library.emptyText'), actions: [paste, discover] });
    this.shown.push(empty);
    return empty.root;
  }

  private async confirmRemoval(entry: LibraryEntry): Promise<void> {
    const { i18n, library, sheets } = this.app;
    const confirmed = await sheets.confirm({
      title: i18n.t('library.removeTitle', { title: entry.title }),
      text: i18n.t('library.removeText'),
      confirm: i18n.t('common.remove'),
      destructive: true,
    });
    if (!confirmed || this.isDestroyed) return;
    library.remove(entry.url);
    this.render();
  }
}
