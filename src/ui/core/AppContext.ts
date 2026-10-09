import type { Catalog, Downloads, Library, Settings, SourceRegistry, Transport, UpdateChecker } from '../../engine/index.ts';
import type { Clipboard, PageProbe } from '../../platform/Platform.ts';
import type { ColorSampler } from '../components/ColorSampler.ts';
import type { Sheet, SheetOptions } from '../components/Sheet.ts';
import type { ErrorPresenter } from '../errors/ErrorPresenter.ts';
import type { I18n } from '../i18n/I18n.ts';
import type { IconName } from './icons.ts';
import type { Router } from './Router.ts';

export interface Toaster {
  show(message: string): void;
}

export interface MenuItem {
  readonly label: string;
  readonly icon: IconName;
  readonly destructive?: boolean;
  readonly run: () => void;
}

export interface SheetHost {
  confirm(options: { title: string; text: string; confirm: string; destructive?: boolean }): Promise<boolean>;
  /** A list of actions in a sheet, for the "more" button of a screen. */
  menu(title: string, items: readonly MenuItem[]): void;
  /** Any content in a sheet; the sheet says when it has gone. */
  present(options: SheetOptions): Sheet;
  addLink(): void;
}

/** Everything a screen may need, handed over by the composition root (App). */
export interface AppContext {
  readonly registry: SourceRegistry;
  readonly catalog: Catalog;
  readonly library: Library;
  /** Looks for the chapters that came out since a series was last opened. */
  readonly updates: UpdateChecker;
  /** The chapters kept on the device to be read offline. */
  readonly downloads: Downloads;
  readonly settings: Settings;
  readonly transport: Transport;
  readonly clipboard: Clipboard;
  /** false in the installed app, which reads the sites itself: there is no proxy to configure. */
  readonly usesProxy: boolean;
  /** Looks at any page from the phone, past an anti-bot check; null in a browser (see Platform). */
  readonly probe: PageProbe | null;
  readonly i18n: I18n;
  readonly errors: ErrorPresenter;
  readonly colors: ColorSampler;
  readonly router: Router;
  readonly toasts: Toaster;
  readonly sheets: SheetHost;
  /** The language series are browsed in: the one chosen in the settings, or the app's own. */
  seriesLanguage(): string;
  /** Opens a pasted or shared link; tells the user and returns false when no source knows it. */
  openLink(input: string): boolean;
  /** Checks the proxy answers (settings screen). */
  checkProxy(): Promise<boolean>;
}
