import type { DirectionChoice, ModeChoice, ReadingMode } from '../Settings.ts';

/**
 * How a site is meant to be read: manga turn their pages from right to left, a webtoon is
 * one long column. Each source says so, and the app follows unless the user chose otherwise.
 */
export interface ReadingStyle {
  readonly mode: ReadingMode;
  /** Pages turn from right to left. Only matters when pages are turned, not in a column. */
  readonly rtl: boolean;
}

export class ReadingStyles {
  /** What the user asked for, where "auto" leaves the choice to the site. */
  static resolve(choice: { readonly mode: ModeChoice; readonly direction: DirectionChoice }, natural: ReadingStyle): ReadingStyle {
    return {
      mode: choice.mode === 'auto' ? natural.mode : choice.mode,
      rtl: choice.direction === 'auto' ? natural.rtl : choice.direction === 'rtl',
    };
  }
}
