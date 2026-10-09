import type { Chapter, ChapterRef, ReadingStyle, ResolvedLink, Series } from '../../../engine/index.ts';
import { ErrorPanel } from '../../components/ErrorPanel.ts';
import type { AppContext } from '../../core/AppContext.ts';
import type { Component } from '../../core/Component.ts';
import { Routes } from '../../core/Routes.ts';
import type { Route } from '../../core/Routes.ts';
import { View } from '../../core/View.ts';
import { ChapterReader } from './ChapterReader.ts';
import { ReaderNotice } from './ReaderNotice.ts';

interface Target {
  readonly url: string;
  readonly key: string;
  readonly seriesUrl: string;
  readonly reading: ReadingStyle;
}

const refOf = (chapter: Chapter | undefined): ChapterRef | null => (chapter ? { url: chapter.url, key: chapter.key, title: chapter.title } : null);

/**
 * The reader, full screen and always dark. This screen finds the chapter and its
 * neighbours and says what is going on (waiting, failing); reading is the
 * ChapterReader's job.
 */
export class ReaderView extends View {
  readonly tab = null;
  private readonly requested: string;
  private readonly atEnd: boolean;
  private shown: Component | null = null;

  constructor(app: AppContext, route: Route) {
    super(app, 'read');
    this.requested = route.params.u ?? '';
    this.atEnd = route.params.end === '1';
    this.root.classList.add('reader');
    // The page behind must not scroll while reading.
    document.documentElement.classList.add('reader-open');
    this.own(() => document.documentElement.classList.remove('reader-open'));
  }

  async open(): Promise<void> {
    // A chapter link that does not name its series (pasted from a site) is looked up first.
    const leave = (): void => this.app.router.back(Routes.library());
    this.show(new ReaderNotice(this.app, leave));
    let link: ResolvedLink | null;
    try {
      link = await this.app.catalog.resolve(this.requested);
    } catch (error) {
      if (this.isDestroyed) return;
      this.show(new ReaderNotice(this.app, leave, new ErrorPanel(this.app, error, { retry: () => void this.open() })));
      return;
    }
    if (this.isDestroyed) return;
    if (link?.kind !== 'chapter' || !link.key || !link.seriesUrl) {
      this.app.router.redirect(Routes.library());
      return;
    }
    await this.load({ url: link.url, key: link.key, seriesUrl: link.seriesUrl, reading: link.source.reading });
  }

  override destroy(): void {
    this.shown?.destroy();
    super.destroy();
  }

  private async load(target: Target): Promise<void> {
    const leave = (): void => this.app.router.back(Routes.series(target.seriesUrl));
    this.show(new ReaderNotice(this.app, leave));
    try {
      // The series gives the neighbours; reading does not depend on it.
      const [{ pages }, series] = await Promise.all([
        this.app.catalog.chapter(target.url),
        this.app.catalog.series(target.seriesUrl).catch(() => null),
      ]);
      if (this.isDestroyed) return;
      this.show(this.reader(target, pages, series));
    } catch (error) {
      if (this.isDestroyed) return;
      const panel = new ErrorPanel(this.app, error, { retry: () => void this.load(target) });
      this.show(new ReaderNotice(this.app, leave, panel));
    }
  }

  private reader(target: Target, pages: readonly string[], series: Series | null): ChapterReader {
    const chapters = series?.chapters ?? [];
    const at = chapters.findIndex((chapter) => chapter.url === target.url);
    const title = chapters[at]?.title ?? target.key;
    const seriesTitle = series?.title ?? this.app.registry.resolve(target.seriesUrl)?.source.name ?? '';
    this.setTitle(seriesTitle ? `${title} – ${seriesTitle}` : title);
    return new ChapterReader(this.app, {
      chapter: { url: target.url, key: target.key, title },
      seriesUrl: target.seriesUrl,
      seriesTitle,
      pages,
      startPage: this.startPage(target, pages.length),
      previous: at > 0 ? refOf(chapters[at - 1]) : null,
      next: at >= 0 ? refOf(chapters[at + 1]) : null,
      natural: series?.reading ?? target.reading,
    });
  }

  private startPage(target: Target, count: number): number {
    if (this.atEnd) return Math.max(0, count - 1);
    const saved = this.app.library.position(target.seriesUrl);
    // A chapter left on its last page was finished: it is read again from the start.
    return saved?.chapter === target.url && saved.page < count - 1 ? saved.page : 0;
  }

  private show(next: Component): void {
    this.shown?.destroy();
    this.shown = next;
    this.root.append(next.root);
  }
}
