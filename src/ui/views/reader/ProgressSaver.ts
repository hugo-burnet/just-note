const DELAY_MS = 500;

/**
 * Keeps the place in the book without writing it at every scroll event: it waits
 * until the user pauses, and saves at once when the page is hidden or closed,
 * which is when a phone may kill the app.
 */
export class ProgressSaver {
  private readonly save: () => void;
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor(save: () => void) {
    this.save = save;
  }

  schedule(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(this.flush, DELAY_MS);
  }

  readonly flush = (): void => {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.save();
  };

  /** Starts listening for the page being hidden. Returns the function that stops. */
  attach(): () => void {
    const hidden = (): void => {
      if (document.visibilityState === 'hidden') this.flush();
    };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', this.flush);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', this.flush);
    };
  }
}
