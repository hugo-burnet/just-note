import type { Language } from '../../engine/index.ts';
import { en } from './en.ts';
import type { MessageKey } from './en.ts';
import { fr } from './fr.ts';

export type Locale = 'en' | 'fr';
export type PluralKey = 'series.chapters' | 'library.count' | 'library.new' | 'download.unread' | 'download.count' | 'download.pending' | 'download.failedCount' | 'settings.backupImported' | 'discover.genresUnread';
export type Params = Readonly<Record<string, string | number>>;

const DICTIONARIES: Record<Locale, Readonly<Record<MessageKey, string>>> = { en, fr };

/** The texts of the app, in the language the settings (or the browser) ask for. */
export class I18n {
  private locale: Locale = 'en';

  get current(): Locale {
    return this.locale;
  }

  /** `choice` is the setting: 'auto' follows the browser. */
  setLanguage(choice: Language, browserLanguage = 'en'): void {
    const wanted = choice === 'auto' ? browserLanguage.slice(0, 2).toLowerCase() : choice;
    this.locale = wanted === 'fr' ? 'fr' : 'en';
    document.documentElement.lang = this.locale;
  }

  t(key: MessageKey, params: Params = {}): string {
    return this.fill(DICTIONARIES[this.locale][key], params);
  }

  /** Picks "<key>.one" or "<key>.other", and fills {n}. */
  plural(key: PluralKey, count: number, params: Params = {}): string {
    return this.t(`${key}.${count === 1 ? 'one' : 'other'}` as MessageKey, { ...params, n: count });
  }

  /** A size on disk, the way the language writes it: "84 Mo", "1,2 Go", "84 MB". */
  size(bytes: number): string {
    const giga = bytes >= 1e9;
    const value = bytes / (giga ? 1e9 : 1e6);
    return new Intl.NumberFormat(this.locale, { style: 'unit', unit: giga ? 'gigabyte' : 'megabyte', unitDisplay: 'short', maximumFractionDigits: value < 10 ? 1 : 0 }).format(value);
  }

  /** For keys built at run time (error codes): undefined when there is no such text. */
  lookup(key: string, params: Params = {}): string | undefined {
    const text = (DICTIONARIES[this.locale] as Readonly<Record<string, string>>)[key];
    return text === undefined ? undefined : this.fill(text, params);
  }

  private fill(text: string, params: Params): string {
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
  }
}
