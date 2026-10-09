import type { LibraryEntry, ReadingPosition } from '../../engine/index.ts';
import { Cover } from '../components/Cover.ts';
import { EmptyState } from '../components/EmptyState.ts';
import { GenreBar } from '../components/GenreBar.ts';
import { LargeHeader } from '../components/LargeHeader.ts';
import { SeriesCard } from '../components/SeriesCard.ts';
import type { AppContext } from '../core/AppContext.ts';
import type { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';
import { ImageLoader } from '../core/ImageLoader.ts';
import { icon } from '../core/icons.ts';
import { Routes } from '../core/Routes.ts';
import { View } from '../core/View.ts';

/** What the user is reading: the one to pick up again, and the shelf. */
export class LibraryView extends View {
  readonly tab = 'library' as const;
  private readonly content = h('div', { class: 'wrap' });
  private readonly shown: Component[] = [];
  /** The cards of the shelf, drawn again on their own when the genres it is filtered by change. */
  private readonly cards: Component[] = [];
  /** The genres above the shelf, made once per drawing of the screen. */
  private genres: GenreBar | null = null;
  private backdrop: ImageLoader | null = null;

  constructor(app: AppContext) {
    super(app, 'library');
    this.own(() => this.backdrop?.destroy());
  }

  open(): void {
    const { i18n } = this.app;
    this.setTitle();
    const add = h('button', { class: 'btn btn-soft header-add pressable', type: 'button', 'aria-label': i18n.t('library.add') }, icon('plus', 18), h('span', null, i18n.t('library.add')));
    this.listen(add, 'click', () => this.app.sheets.addLink());
    const header = new LargeHeader({ title: i18n.t('library.title'), subtitle: i18n.t('library.subtitle'), actions: [add] });
    this.own(() => header.destroy());
    this.root.append(header.root, header.title, this.content);
    this.render();
    this.own(this.app.library.subscribe(() => this.render()));
    // A download that ends (or is let go) changes the marks on the covers.
    let kept = this.app.downloads.usage().chapters;
    this.own(this.app.downloads.subscribe(() => {
      const now = this.app.downloads.usage().chapters;
      if (now !== kept) this.render();
      kept = now;
    }));
    this.app.router.restoreScroll();
    this.lookForNewChapters();
    // Back to the app after a while (the phone was in a pocket): the series may have new chapters.
    this.listen(document, 'visibilitychange', () => {
      if (document.visibilityState === 'visible') this.lookForNewChapters();
    });
  }

  /** The series not checked for a while are read again from their sites; the shelf is drawn again if one has news. */
  private lookForNewChapters(): void {
    let changed = false;
    // Series whose genres are not known yet learn them now: the genres above the shelf change.
    const learning = this.app.library.list().some((entry) => entry.genres === undefined);
    void this.app.updates
      .run(() => {
        changed = true;
      })
      .then((read) => {
        if ((changed || (learning && read > 0)) && !this.isDestroyed) this.render();
      });
  }

  private render(): void {
    this.backdrop?.destroy();
    this.backdrop = null;
    for (const component of [...this.shown.splice(0), ...this.cards.splice(0)]) component.destroy();
    this.genres = null;
    this.content.replaceChildren();
    const { library } = this.app;
    const entries = library.list();
    if (entries.length === 0) {
      this.content.append(this.empty());
      return;
    }
    const resuming = entries.find((entry) => entry.position);
    if (resuming?.position) this.content.append(this.resumeCard(resuming, resuming.position));
    const shelf = h('section', { class: 'section shelf' });
    this.content.append(shelf);
    this.paintShelf(shelf, entries);
  }

  /** The shelf: its genres to filter by, and the series that pass, most recently read first. */
  private paintShelf(shelf: HTMLElement, entries: readonly LibraryEntry[]): void {
    const { i18n, genreFilter } = this.app;
    for (const card of this.cards.splice(0)) card.destroy();
    if (!this.genres) {
      this.genres = new GenreBar({ i18n, filter: genreFilter, onChange: () => this.paintShelf(shelf, entries) });
      this.shown.push(this.genres);
    }
    this.genres.paint(entries);
    const passing = entries.filter((entry) => genreFilter.matches(entry));
    const count = genreFilter.active ? i18n.t('library.filtered', { shown: passing.length, total: entries.length }) : i18n.plural('library.count', entries.length);
    const grid = h('div', { class: 'grid' });
    passing.forEach((entry, index) => grid.append(this.card(entry, index)));
    // The row of genres stays in the shelf as it is, what is around it is drawn again: taken out and put back,
    // it would scroll back to its start, away from the genre just tapped, and that genre would lose the focus.
    const bar = this.genres.root;
    if (bar.parentNode !== shelf) shelf.replaceChildren(bar);
    for (const node of [...shelf.childNodes]) if (node !== bar) node.remove();
    bar.before(
      h('div', { class: 'shelf-heading' }, h('h2', { class: 'section-title' }, i18n.t('library.shelf')), h('span', { class: 'chip' }, count)),
      h('p', { class: 'shelf-hint' }, i18n.t('library.recent')),
    );
    bar.after(
      !bar.hidden && !genreFilter.active ? h('p', { class: 'genre-hint' }, i18n.t('library.genresHint')) : '',
      passing.length > 0 ? grid : this.noMatch(shelf, entries),
    );
  }

  /** Every series is filtered out: said so, with the way back. */
  private noMatch(shelf: HTMLElement, entries: readonly LibraryEntry[]): HTMLElement {
    const { i18n, genreFilter } = this.app;
    const reset = h('button', { class: 'btn btn-soft pressable', type: 'button' }, i18n.t('library.genresClear'));
    this.listen(reset, 'click', () => {
      genreFilter.clear();
      this.paintShelf(shelf, entries);
    });
    return h('div', { class: 'genre-empty' }, h('p', null, i18n.t('library.genresNone')), reset);
  }

  private card(entry: LibraryEntry, index: number): HTMLElement {
    const { library, i18n } = this.app;
    const total = entry.chapterCount ?? 0;
    const fresh = library.newChapters(entry.url);
    const card = new SeriesCard(this.app, {
      url: entry.url,
      title: entry.title,
      cover: entry.cover,
      meta: entry.position?.title ?? i18n.t('library.notStarted'),
      progress: total > 0 ? library.readCount(entry.url) / total : undefined,
      progressLabel: total > 0 ? i18n.t('library.progress', { read: library.readCount(entry.url), total }) : undefined,
      fresh: fresh > 0 ? i18n.plural('library.new', fresh) : undefined,
      offline: this.app.downloads.saved(entry.url).length > 0 ? i18n.t('download.offline') : undefined,
      index,
      onMenu: () => void this.confirmRemoval(entry),
    });
    this.cards.push(card);
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
    if (entry.cover) {
      this.backdrop = new ImageLoader(transport);
      void this.backdrop.load(entry.cover).then((src) => {
        if (src && !this.isDestroyed) backdrop.src = src;
      });
    }

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
    void this.app.downloads.removeSeries(entry.url);
    this.render();
  }
}
