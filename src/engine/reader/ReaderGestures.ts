export type Direction = 'forward' | 'backward';
export type TapIntent = Direction | 'toggle';

const EDGE = 0.3;
const SWIPE_DISTANCE = 50;
const SWIPE_RATIO = 1.5;

/**
 * What a tap, a key or a swipe means for reading. "Forward" is the direction
 * of reading: to the right on a western page, to the left on a manga page.
 */
export class ReaderGestures {
  /** `x` is where the tap landed: 0 on the left edge, 1 on the right. The middle shows or hides the controls. */
  static tap(x: number, rtl: boolean): TapIntent {
    if (x < EDGE) return rtl ? 'forward' : 'backward';
    if (x > 1 - EDGE) return rtl ? 'backward' : 'forward';
    return 'toggle';
  }

  static key(key: string, rtl: boolean): Direction | null {
    if (key === 'ArrowDown' || key === 'PageDown' || key === ' ') return 'forward';
    if (key === 'ArrowUp' || key === 'PageUp') return 'backward';
    if (key === 'ArrowRight') return rtl ? 'backward' : 'forward';
    if (key === 'ArrowLeft') return rtl ? 'forward' : 'backward';
    return null;
  }

  /** `dx`, `dy`: how far the finger travelled. A mostly vertical move is not a swipe. */
  static swipe(dx: number, dy: number, rtl: boolean): Direction | null {
    if (Math.abs(dx) < SWIPE_DISTANCE || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return null;
    const towardsRight = dx > 0;
    return towardsRight === rtl ? 'forward' : 'backward';
  }
}
