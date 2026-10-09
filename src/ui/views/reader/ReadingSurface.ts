import type { Direction, Transport } from '../../../engine/index.ts';
import { Component } from '../../core/Component.ts';

/** What a surface tells the reader about what the user did. */
export interface SurfaceHandlers {
  /** Scrolling moved the reader onto another page, of the chapter at this address. */
  page(index: number, chapter: string): void;
  /** What is shown is about to run out: a surface that can grow asks for the next chapter. */
  nearEnd(): void;
  /** The user asked to turn the page: a tap on an edge, a swipe. */
  turn(direction: Direction): void;
  /** A tap in the middle: show or hide the controls. */
  toggleChrome(): void;
  /** The user started to scroll or pinch: the controls get out of the way. */
  hideChrome(): void;
}

export interface SurfaceOptions {
  /** The address of the chapter the pages belong to. */
  readonly chapter: string;
  readonly pages: readonly string[];
  readonly startPage: number;
  readonly transport: Transport;
  readonly rtl: boolean;
  readonly retryLabel: string;
  /** Shown after the last page, in the surface that scrolls (and between chapters there). */
  readonly ending?: HTMLElement;
  readonly handlers: SurfaceHandlers;
}

/** The part of the reader that shows the pages: in a column to scroll through, or one at a time. */
export abstract class ReadingSurface extends Component {
  protected readonly options: SurfaceOptions;

  protected constructor(root: HTMLElement, options: SurfaceOptions) {
    super(root);
    this.options = options;
  }

  abstract goTo(page: number): void;

  /** Moves by about a screen (the space bar, the page keys). */
  abstract advance(direction: Direction): void;

  /** The reading direction changed. Only the surface that turns pages cares. */
  setDirection(_rtl: boolean): void {}
}
