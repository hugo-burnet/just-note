/**
 * Anything on screen that owns an element, and the listeners, observers and
 * timers that go with it. Whatever it registers through `own` or `listen` is
 * undone by destroy(), so leaving a view never leaves anything running.
 */
export abstract class Component {
  readonly root: HTMLElement;
  private readonly cleanups: Array<() => void> = [];
  private gone = false;

  protected constructor(root: HTMLElement) {
    this.root = root;
  }

  /** True once destroy() ran: async work started earlier checks it before touching the screen. */
  get isDestroyed(): boolean {
    return this.gone;
  }

  protected own(cleanup: () => void): void {
    this.cleanups.push(cleanup);
  }

  protected listen<E extends Event = Event>(
    target: EventTarget,
    type: string,
    handler: (event: E) => void,
    options?: AddEventListenerOptions,
  ): void {
    const listener = handler as EventListener;
    target.addEventListener(type, listener, options);
    this.own(() => target.removeEventListener(type, listener, options));
  }

  /** setTimeout that dies with the component. */
  protected after(ms: number, callback: () => void): void {
    const id = setTimeout(callback, ms);
    this.own(() => clearTimeout(id));
  }

  destroy(): void {
    if (this.gone) return;
    this.gone = true;
    for (const cleanup of this.cleanups.splice(0).reverse()) cleanup();
    this.root.remove();
  }
}
