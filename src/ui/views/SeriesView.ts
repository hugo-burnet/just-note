import type { Chapter, Series } from '../../engine/index.ts';
import { ChapterList } from '../components/ChapterList.ts';
import { applyTint } from '../components/ColorSampler.ts';
import { Cover } from '../components/Cover.ts';
import { ErrorPanel } from '../components/ErrorPanel.ts';
import type { AppContext } from '../core/AppContext.ts';
import type { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';
import { ImageLoader } from '../core/ImageLoader.ts';
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
  private readonly backdrop: ImageLoader;
  private chaptersShown: readonly Chapter[] = [];
  /** Stops the status line from following the downloads, when the page is drawn again. */
  private unwatch: (() => void) | null = null;

  constructor(app: AppContext, route: Route) {
    super(app, 'series');
    this.requested = route.params.u ?? '';
    this.backdrop = new ImageLoader(app.transport);
    this.own(() => this.backdrop.destroy());
    this.own(() => this.unwatch?.());
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
      if (this.isDestroyed) return;
      this.render(series);
      // Its chapters have been seen: none of them is new any more.
      this.app.library.markSeen(this.url);
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
    this.chaptersShown = series.chapters;
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
    const actions = h('div', { class: 'cta-row' }, cta, this.downloadButton(series));
    this.root.append(hero, h('div', { class: 'wrap' }, stats, actions, this.offlineStatus(), this.description(series.description), this.chapters(series)));
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
    const { downloads } = this.app;
    const list = new ChapterList({
      seriesUrl: this.url,
      chapters: series.chapters,
      library,
      i18n,
      order: settings.get().chapterOrder,
      downloads,
      onDownload: (chapter) => this.downloadOne(series, chapter),
    });
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

  /** The button beside the way into the story: chapters to keep for a journey with no network, or to let go. */
  private downloadButton(series: Series): HTMLElement | null {
    const { downloads, i18n } = this.app;
    if (!downloads.available || series.chapters.length === 0) return null;
    const button = h('button', { class: 'btn btn-soft btn-square pressable', type: 'button', 'aria-label': i18n.t('download.menu'), title: i18n.t('download.menu') }, icon('download', 20));
    this.listen(button, 'click', () => this.downloadMenu(series));
    return button;
  }

  private downloadMenu(series: Series): void {
    const { downloads, i18n, sheets } = this.app;
    const unread = this.toDownload(series);
    const items = [];
    for (const n of [5, 10]) if (unread.length > n) items.push({ label: i18n.t('download.next', { n }), icon: 'download' as const, run: () => this.download(series, unread.slice(0, n)) });
    if (unread.length > 0) items.push({ label: i18n.plural('download.unread', unread.length), icon: 'download' as const, run: () => this.download(series, unread) });
    if (downloads.pending(this.url) > 0) {
      const waiting = series.chapters.filter((chapter) => downloads.state(chapter.url)?.status === 'queued').map((chapter) => chapter.url);
      items.push({ label: i18n.t('download.cancel'), icon: 'close' as const, run: () => downloads.cancel(waiting) });
    }
    if (downloads.saved(this.url).length > 0) {
      items.push({ label: i18n.t('download.removeSeries'), icon: 'trash' as const, destructive: true, run: () => void downloads.removeSeries(this.url).then(() => this.app.toasts.show(i18n.t('download.removed'))) });
    }
    if (items.length === 0) {
      this.app.toasts.show(i18n.t('download.nothing'));
      return;
    }
    sheets.menu(i18n.t('download.menu'), items);
  }

  /**
   * The chapters worth taking along, in reading order: those not read yet from where the reader is (or from the
   * first unread one), then any unread before it, leaving out what is already kept or on its way.
   */
  private toDownload(series: Series): Chapter[] {
    const { downloads, library } = this.app;
    const position = library.position(this.url);
    const from = Math.max(0, series.chapters.findIndex((chapter) => chapter.url === position?.chapter));
    const ordered = [...series.chapters.slice(from), ...series.chapters.slice(0, from)];
    return ordered.filter((chapter) => (chapter.url === position?.chapter || !library.isRead(this.url, chapter.key)) && !['saved', 'queued', 'running'].includes(downloads.state(chapter.url)?.status ?? ''));
  }

  private download(series: Series, chapters: readonly Chapter[]): void {
    this.app.downloads.download(series, chapters);
    this.app.toasts.show(this.app.i18n.t('download.keepOpen'));
  }

  /** A chapter's own button: download it, stop waiting for it, try again, or let it go once kept. */
  private downloadOne(series: Series, chapter: Chapter): void {
    const { downloads, i18n, sheets } = this.app;
    const status = downloads.state(chapter.url)?.status;
    if (status === 'queued') downloads.cancel([chapter.url]);
    else if (status === 'saved') sheets.menu(chapter.title, [{ label: i18n.t('download.removeOne'), icon: 'trash', destructive: true, run: () => void downloads.remove([chapter.url]) }]);
    else if (status !== 'running') downloads.download(series, [chapter]);
  }

  /** What is kept of the series, or how its downloads go; nothing when there is nothing to say. */
  private offlineStatus(): HTMLElement | null {
    const { downloads, i18n } = this.app;
    if (!downloads.available) return null;
    const line = h('p', { class: 'offline-status', 'aria-live': 'polite' });
    const paint = (): void => {
      const pending = downloads.pending(this.url);
      const saved = downloads.saved(this.url);
      const failed = this.failedHere();
      const parts: string[] = [];
      if (pending > 0) parts.push(i18n.plural('download.pending', pending));
      else if (saved.length > 0) parts.push(i18n.plural('download.count', saved.length, { size: i18n.size(saved.reduce((sum, one) => sum + one.bytes, 0)) }));
      if (failed > 0) parts.push(i18n.plural('download.failedCount', failed));
      line.hidden = parts.length === 0;
      line.dataset.busy = String(pending > 0);
      line.replaceChildren(pending > 0 ? h('span', { class: 'dl-ring', 'aria-hidden': 'true' }) : icon('downloaded', 16), h('span', null, parts.join(' · ')));
    };
    paint();
    this.unwatch = downloads.subscribe(paint);
    return line;
  }

  private failedHere(): number {
    return this.chaptersShown.filter((chapter) => this.app.downloads.state(chapter.url)?.status === 'failed').length;
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
    void this.app.downloads.removeSeries(this.url);
    router.back(Routes.library());
  }

  /** The cover blown up behind the page, and its colour lent to the accent. */
  private async light(cover: string, backdrop: HTMLImageElement): Promise<void> {
    const src = await this.backdrop.load(cover);
    if (!src || this.isDestroyed) return;
    backdrop.src = src;
    const tint = await this.app.colors.sample(src);
    if (tint && !this.isDestroyed) applyTint(this.root, tint);
  }

  private clear(): void {
    this.unwatch?.();
    this.unwatch = null;
    this.backdrop.clear();
    for (const component of this.shown.splice(0)) component.destroy();
    this.root.replaceChildren();
  }
}
