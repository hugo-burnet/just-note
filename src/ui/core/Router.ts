import { Routes } from './Routes.ts';
import type { Route, RouteName } from './Routes.ts';
import type { View } from './View.ts';

export type ViewFactory = (route: Route) => View;
export type Motion = 'push' | 'pop' | 'fade' | 'none';

interface HistoryState {
  idx?: number;
}

/**
 * Shows the screen the address asks for. Entries we create are numbered, which
 * tells forward from back (so a screen can slide in or out) and whether Back
 * would stay in the app. Reading chapter after chapter replaces the entry instead
 * of adding one, so Back does not walk through every chapter.
 */
export class Router {
  private readonly outlet: HTMLElement;
  private readonly factories: ReadonlyMap<RouteName, ViewFactory>;
  private readonly listeners = new Set<(view: View) => void>();
  private readonly scrolls = new Map<string, number>();
  private current: View | null = null;
  private currentHash = '';
  private index = 0;
  private counter = 0;
  private started = false;

  constructor(outlet: HTMLElement, factories: ReadonlyMap<RouteName, ViewFactory>) {
    this.outlet = outlet;
    this.factories = factories;
  }

  start(): void {
    window.addEventListener('hashchange', this.render);
    this.render();
  }

  go(hash: string): void {
    location.hash = hash;
  }

  /** Swaps the current entry for another one. (location.replace would drop our numbering.) */
  replace(hash: string): void {
    history.replaceState({ idx: this.index } satisfies HistoryState, '', hash);
    this.render();
  }

  /**
   * The screen moved on by itself (scrolling carried the reader into the next
   * chapter): the address follows, so that a reload or a shared link lands there,
   * but nothing is shown again.
   */
  follow(hash: string): void {
    history.replaceState({ idx: this.index } satisfies HistoryState, '', hash);
    this.currentHash = location.hash || '#/';
  }

  /** For a screen that finds, while opening, that it has nothing to show. */
  redirect(hash: string): void {
    queueMicrotask(() => this.replace(hash));
  }

  /** One step back when the previous page belongs to the app, else to `fallback`. */
  back(fallback: string): void {
    if (this.index > 0) history.back();
    else this.replace(fallback);
  }

  /** Tells the dock which screen is showing. */
  onNavigate(listener: (view: View) => void): void {
    this.listeners.add(listener);
  }

  /** A screen calls this once its content is in place, to land where the user left it. */
  restoreScroll(): void {
    window.scrollTo(0, this.scrolls.get(this.currentHash) ?? 0);
  }

  private readonly render = (): void => {
    const previousIndex = this.index;
    this.syncIndex();
    this.scrolls.set(this.currentHash, window.scrollY);

    const route = Routes.parse(location.hash);
    const factory = this.factories.get(route.name) ?? this.factories.get('library');
    if (!factory) return;

    const wasTab = this.current?.tab ?? null;
    this.current?.destroy();
    const view = factory(route);
    view.root.dataset.motion = this.motion(previousIndex, wasTab !== null && view.tab !== null);

    this.currentHash = location.hash || '#/';
    this.outlet.append(view.root);
    this.current = view;
    window.scrollTo(0, 0);
    for (const listener of this.listeners) listener(view);
    this.started = true;
    Promise.resolve(view.open()).catch((err: unknown) => console.error(err));
  };

  private syncIndex(): void {
    const stored = (history.state as HistoryState | null)?.idx;
    if (stored === undefined) {
      this.index = this.started ? ++this.counter : 0;
      history.replaceState({ idx: this.index } satisfies HistoryState, '');
    } else {
      this.index = stored;
      this.counter = Math.max(this.counter, stored);
    }
  }

  private motion(previousIndex: number, betweenTabs: boolean): Motion {
    if (!this.started) return 'none';
    if (betweenTabs) return 'fade';
    if (this.index > previousIndex) return 'push';
    if (this.index < previousIndex) return 'pop';
    return 'fade';
  }
}
