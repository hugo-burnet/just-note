import type { LibraryEntry, ReadingPosition, ShelfGenre } from '../../engine/index.ts';
import { Cover } from '../components/Cover.ts';
import { EmptyState } from '../components/EmptyState.ts';
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
    // Drawn again, the row of genres stays where it was scrolled to.
    const scrolled = shelf.querySelector('.genre-bar')?.scrollLeft ?? 0;
    const passing = entries.filter((entry) => genreFilter.matches(entry));
    const count = genreFilter.active ? i18n.t('library.filtered', { shown: passing.length, total: entries.length }) : i18n.plural('library.count', entries.length);
    const bar = this.genreBar(shelf, entries);
    const grid = h('div', { class: 'grid' });
    passing.forEach((entry, index) => grid.append(this.card(entry, index)));
    shelf.replaceChildren(
      h('div', { class: 'shelf-heading' }, h('h2', { class: 'section-title' }, i18n.t('library.shelf')), h('span', { class: 'chip' }, count)),
      h('p', { class: 'shelf-hint' }, i18n.t('library.recent')),
      bar ?? '',
      bar && !genreFilter.active ? h('p', { class: 'genre-hint' }, i18n.t('library.genresHint')) : '',
      passing.length > 0 ? grid : this.noMatch(shelf, entries),
    );
    if (bar) bar.scrollLeft = scrolled;
  }

  /**
   * The genres of the shelf, the commonest first. A tap keeps a genre (only the series that have it), a second
   * leaves it out (only those that have not), a third lets it go. Nothing when no series says its genres.
   */
  private genreBar(shelf: HTMLElement, entries: readonly LibraryEntry[]): HTMLElement | null {
    const { i18n, genreFilter } = this.app;
    const genres = genreFilter.genres(entries);
    if (genres.length === 0) return null;
    const bar = h('div', { class: 'chips chips-scroll genre-bar', role: 'group', 'aria-label': i18n.t('library.genres') });
    if (genreFilter.active) {
      const reset = h('button', { class: 'chip chip-button genre-reset pressable', type: 'button' }, icon('close', 14), i18n.t('library.genresClear'));
      this.listen(reset, 'click', () => {
        genreFilter.clear();
        this.paintShelf(shelf, entries);
      });
      bar.append(reset);
    }
    for (const genre of genres) bar.append(this.genreChip(shelf, entries, genre));
    return bar;
  }

  private genreChip(shelf: HTMLElement, entries: readonly LibraryEntry[], genre: ShelfGenre): HTMLElement {
    const { i18n, genreFilter } = this.app;
    const state = i18n.t(genre.choice === 'include' ? 'library.genreKept' : genre.choice === 'exclude' ? 'library.genreLeftOut' : 'library.genreAny');
    const chip = h(
      'button',
      {
        class: 'chip chip-button genre-chip pressable',
        type: 'button',
        'data-choice': genre.choice,
        'aria-pressed': genre.choice === 'none' ? 'false' : 'true',
        'aria-label': `${genre.name}, ${i18n.plural('library.count', genre.count)}, ${state}`,
      },
      genre.choice === 'include' ? icon('check', 14) : genre.choice === 'exclude' ? icon('close', 14) : null,
      h('span', { class: 'genre-name' }, genre.name),
      h('span', { class: 'genre-count', 'aria-hidden': 'true' }, String(genre.count)),
    );
    this.listen(chip, 'click', () => {
      genreFilter.cycle(genre.key);
      this.paintShelf(shelf, entries);
    });
    return chip;
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
