import type { SeriesSummary, Source } from '../../engine/index.ts';
import { EmptyState } from '../components/EmptyState.ts';
import { ErrorPanel } from '../components/ErrorPanel.ts';
import { GenreBar } from '../components/GenreBar.ts';
import { LargeHeader } from '../components/LargeHeader.ts';
import { SeriesCard, skeletonGrid } from '../components/SeriesCard.ts';
import type { AppContext } from '../core/AppContext.ts';
import type { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';
import { icon } from '../core/icons.ts';
import { Routes } from '../core/Routes.ts';
import type { Route } from '../core/Routes.ts';
import { View } from '../core/View.ts';
import { languageName } from '../i18n/languages.ts';

/**
 * Finding something to read: what a source shows on its home page, or what it
 * finds for a search. A link pasted in the search field is opened instead.
 */
export class DiscoverView extends View {
  readonly tab = 'discover' as const;
  private readonly route: Route;
  private readonly results = h('section', { class: 'section' });
  private readonly shown: Component[] = [];

  constructor(app: AppContext, route: Route) {
    super(app, 'discover');
    this.route = route;
  }

  async open(): Promise<void> {
    const { i18n, registry } = this.app;
    const source = registry.byId(this.route.params.src ?? '') ?? registry.all()[0];
    if (!source) return;
    const query = this.route.params.q ?? '';

    this.setTitle(i18n.t('discover.title'));
    const header = new LargeHeader({ title: i18n.t('discover.title'), subtitle: i18n.t('discover.subtitle') });
    this.own(() => header.destroy());
    this.root.append(header.root, header.title, h('div', { class: 'wrap stack' }, this.sources(source), this.search(source, query)), h('div', { class: 'wrap' }, this.results));
    this.app.router.restoreScroll();
    await this.load(source, query);
  }

  private sources(active: Source): HTMLElement | null {
    const all = this.app.registry.all();
    if (all.length < 2) return null;
    const chips = h('div', { class: 'chips chips-scroll', role: 'group', 'aria-label': this.app.i18n.t('discover.sources') });
    let current: HTMLElement | null = null;
    for (const source of all) {
      const chip = h('button', { class: 'chip chip-button pressable', type: 'button', 'aria-pressed': String(source === active) }, source.name);
      this.listen(chip, 'click', () => this.app.router.replace(Routes.discover({ source: source.id })));
      chips.append(chip);
      if (source === active) current = chip;
    }
    // The row scrolls: the site being browsed is brought into view, without moving the page.
    if (current) {
      const chip = current;
      requestAnimationFrame(() => {
        if (chip.offsetLeft + chip.offsetWidth > chips.clientWidth) chips.scrollLeft = chip.offsetLeft - chips.clientWidth / 2 + chip.offsetWidth / 2;
      });
    }
    return chips;
  }

  private search(source: Source, query: string): HTMLElement {
    const { i18n } = this.app;
    const input = h('input', {
      class: 'field',
      type: 'search',
      name: 'q',
      value: query,
      // The chip above already says which site: the visible hint stays short enough for a phone.
      placeholder: i18n.t('discover.placeholder'),
      'aria-label': i18n.t('discover.search', { source: source.name }),
      enterkeyhint: 'search',
      autocapitalize: 'off',
      autocomplete: 'off',
      spellcheck: 'false',
    });
    const clear = h('button', { class: 'icon-btn field-clear pressable', type: 'button', 'aria-label': i18n.t('discover.clear'), hidden: query === '' }, icon('close', 18));
    this.listen(input, 'input', () => {
      clear.hidden = input.value === '';
    });
    this.listen(clear, 'click', () => {
      input.value = '';
      clear.hidden = true;
      input.focus();
    });

    const form = h('form', { class: 'field-wrap', role: 'search' }, icon('search', 20), input, clear);
    this.listen(form, 'submit', (event) => {
      event.preventDefault();
      const text = input.value.trim();
      // A pasted link is opened, anything else is searched.
      if (text && this.app.registry.resolve(text)) this.app.openLink(text);
      else this.app.router.replace(Routes.discover({ source: source.id, query: text }));
    });
    return form;
  }

  private async load(source: Source, query: string): Promise<void> {
    const { i18n, catalog } = this.app;
    // The catalogue is browsed in the language chosen, when the site has it; the title says which one it is.
    const language = source.languageFor(this.app.seriesLanguage());
    const named = `${source.name} · ${languageName(language)}`;
    const title = h('h2', { class: 'section-title' }, query ? i18n.t('discover.results', { query }) : i18n.t('discover.popular', { source: named }));
    this.results.replaceChildren(title, skeletonGrid(6));
    try {
      const items = await catalog.list(query ? source.searchUrl(query, language) : source.home(language));
      if (this.isDestroyed) return;
      if (items.length === 0) {
        const empty = new EmptyState({ icon: 'search', title: i18n.t('discover.empty'), text: '' });
        this.shown.push(empty);
        this.results.replaceChildren(title, empty.root);
        return;
      }
      const grid = h('div', { class: 'grid' });
      const cards = items.map((item, index) => {
        const better = source.betterCovers ? (wanted: () => boolean) => catalog.cover(item.url, wanted) : undefined;
        const card = new SeriesCard(this.app, { url: item.url, title: item.title, cover: item.cover, index, ...(better ? { better } : {}) });
        this.shown.push(card);
        grid.append(card.root);
        return card.root;
      });
      this.results.replaceChildren(title, this.genreFilter(items, cards), grid);
    } catch (error) {
      if (this.isDestroyed) return;
      const panel = new ErrorPanel(this.app, error, { retry: () => void this.load(source, query) });
      this.shown.push(panel);
      this.results.replaceChildren(title, panel.root);
    }
  }

  /**
   * Filtering the results by genre. A listing does not say the genres of its series, their pages do: they are
   * read (a few at a time, and kept) when the filter is asked for, or at once when one is already chosen. Until
   * its genres are known, a series passes a filter that only leaves genres out, and not one that keeps some.
   */
  private genreFilter(items: readonly SeriesSummary[], cards: readonly HTMLElement[]): HTMLElement {
    const { i18n, catalog, discoverGenres: filter } = this.app;
    const known = new Map<string, readonly string[]>();
    let started = false;
    let answered = 0;
    let drawing = false;
    const start = h('button', { class: 'chip chip-button genre-start pressable', type: 'button' }, icon('sort', 14), i18n.t('discover.genres'));
    const status = h('p', { class: 'genre-hint', 'aria-live': 'polite' });
    const nothing = h('p', { class: 'genre-empty', hidden: true }, i18n.t('discover.genresNone'));
    const bar = new GenreBar({ i18n, filter, onChange: () => draw() });
    this.shown.push(bar);

    const draw = (): void => {
      const said = items.map((item) => ({ genres: known.get(item.url) }));
      bar.paint(said.filter((one) => one.genres !== undefined));
      let passing = 0;
      said.forEach((one, index) => {
        const card = cards[index];
        const pass = filter.matches(one);
        if (card) card.hidden = !pass;
        if (pass) passing++;
      });
      start.hidden = started;
      const reading = started && answered < items.length;
      status.textContent = reading
        ? i18n.t('discover.genresReading', { done: answered, total: items.length })
        : filter.active
          ? i18n.t('library.filtered', { shown: passing, total: items.length })
          : started
            ? i18n.t('library.genresHint')
            : '';
      status.hidden = status.textContent === '';
      nothing.hidden = reading || passing > 0;
    };
    // Many answers come in a burst: the results are filtered again once per frame.
    const later = (): void => {
      if (drawing) return;
      drawing = true;
      requestAnimationFrame(() => {
        drawing = false;
        if (!this.isDestroyed) draw();
      });
    };
    const begin = (): void => {
      started = true;
      for (const item of items) {
        void catalog.genres(item.url, () => !this.isDestroyed).then((genres) => {
          answered++;
          if (genres) known.set(item.url, genres);
          later();
        });
      }
      draw();
    };
    this.listen(start, 'click', begin);
    if (filter.active && items.length > 0) begin();
    else draw();
    return h('div', { class: 'discover-genres' }, h('div', { class: 'genre-tools' }, start, bar.root), status, nothing);
  }

  override destroy(): void {
    for (const component of this.shown.splice(0)) component.destroy();
    super.destroy();
  }
}
