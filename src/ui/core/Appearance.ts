import type { Settings } from '../../engine/index.ts';
import type { I18n } from '../i18n/I18n.ts';

// The colour of the system bar on a phone: the background of each theme, and of the reader.
const BAR = { dark: '#0f1015', light: '#f8f4ec', reader: '#0b0c10' } as const;

/** Puts the theme, the language and the colour of the system bar on the page. */
export class Appearance {
  private readonly settings: Settings;
  private readonly i18n: I18n;
  private readonly lightScheme = matchMedia('(prefers-color-scheme: light)');
  private reading = false;

  constructor(settings: Settings, i18n: I18n) {
    this.settings = settings;
    this.i18n = i18n;
  }

  start(): void {
    this.apply();
    this.settings.subscribe(() => this.apply());
    this.lightScheme.addEventListener('change', () => this.apply());
  }

  /** The reader is dark whatever the theme, and so is the bar above it. */
  setReading(reading: boolean): void {
    this.reading = reading;
    this.apply();
  }

  private apply(): void {
    const { theme, lang } = this.settings.get();
    const root = document.documentElement;
    if (theme === 'auto') delete root.dataset.theme;
    else root.dataset.theme = theme;
    this.i18n.setLanguage(lang, navigator.language);

    const dark = theme === 'dark' || (theme === 'auto' && !this.lightScheme.matches);
    const color = this.reading ? BAR.reader : dark ? BAR.dark : BAR.light;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
  }
}
