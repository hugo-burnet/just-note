import type { Source } from '../../engine/index.ts';
import { EmptyState } from '../components/EmptyState.ts';
import { ErrorPanel } from '../components/ErrorPanel.ts';
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
    const chips = h('div', { class: 'chips' });
    for (const source of all) {
      const chip = h('button', { class: 'chip chip-button pressable', type: 'button', 'aria-pressed': String(source === active) }, source.name);
      this.listen(chip, 'click', () => this.app.router.replace(Routes.discover({ source: source.id })));
      chips.append(chip);
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
      items.forEach((item, index) => {
        const card = new SeriesCard(this.app, { url: item.url, title: item.title, cover: item.cover, index });
        this.shown.push(card);
        grid.append(card.root);
      });
      this.results.replaceChildren(title, grid);
    } catch (error) {
      if (this.isDestroyed) return;
      const panel = new ErrorPanel(this.app, error, { retry: () => void this.load(source, query) });
      this.shown.push(panel);
      this.results.replaceChildren(title, panel.root);
    }
  }

  override destroy(): void {
    for (const component of this.shown.splice(0)) component.destroy();
    super.destroy();
  }
}
