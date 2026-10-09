import { Catalog, Library, Settings, SITES, SourceRegistry } from '../engine/index.ts';
import type { ResolvedLink } from '../engine/index.ts';
import type { Connection, Platform } from '../platform/Platform.ts';
import { AppSheets } from './components/AppSheets.ts';
import { ColorSampler } from './components/ColorSampler.ts';
import { Dock } from './components/Dock.ts';
import { ToastHost } from './components/ToastHost.ts';
import { Appearance } from './core/Appearance.ts';
import type { AppContext } from './core/AppContext.ts';
import { Router } from './core/Router.ts';
import type { ViewFactory } from './core/Router.ts';
import { Routes } from './core/Routes.ts';
import type { RouteName } from './core/Routes.ts';
import { ShareTarget } from './core/ShareTarget.ts';
import { ErrorPresenter } from './errors/ErrorPresenter.ts';
import { I18n } from './i18n/I18n.ts';
import { DiscoverView } from './views/DiscoverView.ts';
import { LibraryView } from './views/LibraryView.ts';
import { ReaderView } from './views/reader/ReaderView.ts';
import { SeriesView } from './views/SeriesView.ts';
import { SettingsView } from './views/SettingsView.ts';

export interface AppElements {
  /** Where the screens go. */
  readonly outlet: HTMLElement;
  /** Where the short messages go. */
  readonly toasts: HTMLElement;
}

/**
 * The composition root: builds the engine on top of the platform, builds the
 * screens on top of the engine, and hands each screen what it needs (AppContext).
 */
export class App implements AppContext {
  readonly settings: Settings;
  readonly library: Library;
  readonly registry: SourceRegistry;
  readonly catalog: Catalog;
  readonly transport: Connection;
  readonly clipboard: Platform['clipboard'];
  readonly usesProxy: boolean;
  readonly probe: Platform['probe'];
  readonly i18n = new I18n();
  readonly errors = new ErrorPresenter(this.i18n);
  readonly colors = new ColorSampler();
  readonly toasts: ToastHost;
  readonly sheets: AppSheets;
  readonly router: Router;
  private readonly dock: Dock;
  private readonly appearance: Appearance;

  constructor(platform: Platform, elements: AppElements) {
    this.settings = new Settings(platform.store, platform.defaults);
    this.library = new Library(platform.store);
    this.transport = platform.connect(() => this.settings.get().proxyBase);
    this.clipboard = platform.clipboard;
    this.usesProxy = platform.usesProxy;
    this.probe = platform.probe;
    const io = { transport: this.transport, parser: platform.parser };
    this.registry = new SourceRegistry(SITES.map((site) => site.create(io)));
    this.catalog = new Catalog(this.registry, this.library);
    this.toasts = new ToastHost(elements.toasts);
    this.sheets = new AppSheets(this, document.body);
    this.appearance = new Appearance(this.settings, this.i18n);
    this.dock = new Dock(this);
    this.router = new Router(elements.outlet, this.screens());
  }

  start(): void {
    this.appearance.start();
    this.dock.relabel();
    this.settings.subscribe(() => this.dock.relabel());
    document.body.append(this.dock.root);
    this.router.onNavigate((view) => {
      this.dock.show(view.tab);
      this.appearance.setReading(view instanceof ReaderView);
    });
    const shared = this.takeShared();
    this.router.start();
    if (shared === false) this.toasts.show(this.i18n.t('link.unsupported'));
  }

  openLink(input: string): boolean {
    const link = this.registry.resolve(input);
    if (!link) {
      this.toasts.show(this.i18n.t('link.unsupported'));
      return false;
    }
    this.router.go(this.addressOf(link));
    return true;
  }

  seriesLanguage(): string {
    const { seriesLang } = this.settings.get();
    return seriesLang === 'auto' ? this.i18n.current : seriesLang;
  }

  checkProxy(): Promise<boolean> {
    return this.transport.isHealthy();
  }

  private screens(): ReadonlyMap<RouteName, ViewFactory> {
    return new Map<RouteName, ViewFactory>([
      ['library', () => new LibraryView(this)],
      ['discover', (route) => new DiscoverView(this, route)],
      ['settings', () => new SettingsView(this)],
      ['series', (route) => new SeriesView(this, route)],
      ['read', (route) => new ReaderView(this, route)],
    ]);
  }

  private addressOf(link: ResolvedLink): string {
    if (link.kind === 'chapter') return Routes.read(link.url);
    if (link.kind === 'series') return Routes.series(link.url);
    return Routes.discover({ source: link.source.id });
  }

  /**
   * A link shared to the app opens straight away. Returns null when nothing was
   * shared, false when something was but no source knows it. The address is
   * cleaned either way, so that reloading does not open the link again.
   */
  private takeShared(): boolean | null {
    const candidates = ShareTarget.candidates(location.search);
    if (candidates.length === 0) return null;
    const link = candidates.map((text) => this.registry.resolve(text)).find((found) => found !== null);
    history.replaceState(null, '', `${location.pathname}${link ? this.addressOf(link) : location.hash}`);
    return link !== undefined;
  }
}
