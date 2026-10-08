import type { Series } from '../../engine/index.ts';
import { ChapterList } from '../components/ChapterList.ts';
import { applyTint } from '../components/ColorSampler.ts';
import { Cover } from '../components/Cover.ts';
import { ErrorPanel } from '../components/ErrorPanel.ts';
import type { AppContext } from '../core/AppContext.ts';
import type { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';
import { icon } from '../core/icons.ts';
import { Routes } from '../core/Routes.ts';
import type { Route } from '../core/Routes.ts';
import { View } from '../core/View.ts';

/** A series: its cover lights the page, and the way back into the story is one tap. */
export class SeriesView extends View {
  readonly tab = null;
  private readonly requested: string;
  private url = '';
  private readonly shown: Component[] = [];

  constructor(app: AppContext, route: Route) {
    super(app, 'series');
    this.requested = route.params.u ?? '';
  }

  async open(): Promise<void> {
    const link = this.app.registry.resolve(this.requested);
    if (link?.kind !== 'series') {
      this.app.router.redirect(Routes.library());
      return;
    }
    this.url = link.url;
    await this.load(false);
  }

  private async load(fresh: boolean): Promise<void> {
    this.showWaiting();
    try {
      const series = await this.app.catalog.series(this.url, { fresh });
      if (!this.isDestroyed) this.render(series);
    } catch (error) {
      if (this.isDestroyed) return;
      this.clear();
      const panel = new ErrorPanel(this.app, error, { retry: () => void this.load(true) });
      this.shown.push(panel);
      this.root.append(this.topBar(), h('div', { class: 'wrap' }, panel.root));
    }
  }

  private showWaiting(): void {
    this.clear();
    const cover = h('div', { class: 'cover series-cover', 'data-state': 'loading' });
    const lines = h('div', { class: 'series-info' }, h('div', { class: 'line-skeleton' }), h('div', { class: 'line-skeleton' }));
    this.root.append(h('header', { class: 'series-hero' }, this.topBar(), h('div', { class: 'wrap series-head' }, cover, lines)));
  }

  private render(series: Series): void {
    this.clear();
    const { i18n, library, transport } = this.app;
    this.setTitle(series.title);
    const position = library.position(this.url);
    const resumeAt = position ? series.chapters.find((chapter) => chapter.url === position.chapter) : undefined;
    const startAt = resumeAt ?? series.chapters[0];

    const cover = new Cover(transport, { url: series.cover, title: series.title, eager: true });
    cover.root.classList.add('series-cover');
    this.shown.push(cover);
    const backdrop = h('img', { class: 'series-backdrop', alt: '' });
    if (series.cover) void this.light(series.cover, backdrop);

    const hero = h('header', { class: 'series-hero' }, backdrop, this.topBar(() => this.menu(series)), h('div', { class: 'wrap series-head' }, cover.root, this.info(series)));

    const stats = h(
      'div',
      { class: 'stats' },
      this.stat(String(series.chapters.length), i18n.t('series.statChapters')),
      this.stat(String(library.readCount(this.url)), i18n.t('series.statRead')),
    );
    const cta = startAt
      ? h(
          'a',
          { class: 'btn btn-primary btn-block pressable', href: Routes.read(startAt.url) },
          icon('play', 18, { filled: true }),
          h('span', { class: 'label' }, resumeAt ? i18n.t('series.continue', { chapter: resumeAt.title }) : i18n.t('series.start')),
        )
      : null;
    this.root.append(hero, h('div', { class: 'wrap' }, stats, cta, this.description(series.description), this.chapters(series)));
    this.app.router.restoreScroll();
  }

  private info(series: Series): HTMLElement {
    const source = this.app.registry.resolve(this.url)?.source.name ?? '';
    return h(
      'div',
      { class: 'series-info' },
      h('span', { class: 'eyebrow' }, series.status || source),
      h('h1', { class: 'series-title' }, series.title),
      series.author ? h('p', { class: 'series-author muted' }, series.author) : null,
      series.genres.length > 0 ? h('div', { class: 'chips' }, series.genres.map((genre) => h('span', { class: 'chip' }, genre))) : null,
    );
  }

  private stat(value: string, label: string): HTMLElement {
    return h('div', { class: 'stat' }, h('strong', null, value), h('span', null, label));
  }

  private description(text: string): HTMLElement | null {
    if (!text) return null;
    const { i18n } = this.app;
    const paragraph = h('p', { class: 'desc selectable', 'data-clamped': 'true' }, text);
    const toggle = h('button', { class: 'link-button', type: 'button', hidden: true }, i18n.t('common.more'));
    this.listen(toggle, 'click', () => {
      const clamped = paragraph.dataset.clamped !== 'true';
      paragraph.dataset.clamped = String(clamped);
      toggle.textContent = i18n.t(clamped ? 'common.more' : 'common.less');
    });
    // "More" is only offered when the text really is cut off.
    requestAnimationFrame(() => {
      toggle.hidden = paragraph.scrollHeight <= paragraph.clientHeight + 1;
    });
    return h('div', null, paragraph, toggle);
  }

  private chapters(series: Series): HTMLElement {
    const { i18n, settings, library } = this.app;
    const list = new ChapterList({ seriesUrl: this.url, chapters: series.chapters, library, i18n, order: settings.get().chapterOrder });
    this.shown.push(list);

    const sort = h('button', { class: 'btn btn-ghost pressable', type: 'button' });
    const label = (): void => {
      const newest = settings.get().chapterOrder === 'desc';
      sort.replaceChildren(icon('sort', 18), i18n.t(newest ? 'series.newest' : 'series.oldest'));
    };
    label();
    this.listen(sort, 'click', () => {
      settings.set({ chapterOrder: settings.get().chapterOrder === 'desc' ? 'asc' : 'desc' });
      list.show(settings.get().chapterOrder);
      label();
    });
    return h('section', null, h('div', { class: 'chapters-head' }, h('h2', { class: 'section-title' }, i18n.plural('series.chapters', series.chapters.length)), sort), list.root);
  }

  private topBar(menu?: () => void): HTMLElement {
    const { i18n, router } = this.app;
    const back = h('button', { class: 'icon-btn icon-btn-glass pressable', type: 'button', 'aria-label': i18n.t('common.back') }, icon('chevronLeft'));
    this.listen(back, 'click', () => router.back(Routes.library()));
    const more = menu ? h('button', { class: 'icon-btn icon-btn-glass pressable', type: 'button', 'aria-label': i18n.t('series.menu') }, icon('more')) : null;
    if (more && menu) this.listen(more, 'click', menu);
    return h('div', { class: 'wrap series-top' }, back, more);
  }

  private menu(series: Series): void {
    const { i18n, sheets } = this.app;
    sheets.menu(series.title, [
      { label: i18n.t('series.refresh'), icon: 'refresh', run: () => void this.load(true) },
      { label: i18n.t('series.remove'), icon: 'trash', destructive: true, run: () => void this.remove(series) },
    ]);
  }

  private async remove(series: Series): Promise<void> {
    const { i18n, library, router, sheets } = this.app;
    const confirmed = await sheets.confirm({
      title: i18n.t('library.removeTitle', { title: series.title }),
      text: i18n.t('library.removeText'),
      confirm: i18n.t('common.remove'),
      destructive: true,
    });
    if (!confirmed || this.isDestroyed) return;
    library.remove(this.url);
    router.back(Routes.library());
  }

  /** The cover blown up behind the page, and its colour lent to the accent. */
  private async light(cover: string, backdrop: HTMLImageElement): Promise<void> {
    const src = await this.app.transport.imageSource(cover);
    if (this.isDestroyed) return;
    backdrop.src = src;
    const tint = await this.app.colors.sample(src);
    if (tint && !this.isDestroyed) applyTint(this.root, tint);
  }

  private clear(): void {
    for (const component of this.shown.splice(0)) component.destroy();
    this.root.replaceChildren();
  }
}
