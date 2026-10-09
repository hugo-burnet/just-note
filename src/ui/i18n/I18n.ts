import type { Language } from '../../engine/index.ts';
import { en } from './en.ts';
import type { MessageKey } from './en.ts';
import { fr } from './fr.ts';

export type Locale = 'en' | 'fr';
export type PluralKey = 'series.chapters' | 'library.count' | 'settings.backupImported';
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

  /** For keys built at run time (error codes): undefined when there is no such text. */
  lookup(key: string, params: Params = {}): string | undefined {
    const text = (DICTIONARIES[this.locale] as Readonly<Record<string, string>>)[key];
    return text === undefined ? undefined : this.fill(text, params);
  }

  private fill(text: string, params: Params): string {
    return text.replace(/\{(\w+)\}/g, (_, name: string) => String(params[name] ?? ''));
  }
}
