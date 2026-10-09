import type { KeyValueStore } from './ports.ts';

export type Language = 'auto' | 'en' | 'fr';
export type Theme = 'auto' | 'dark' | 'light';
export type ReadingMode = 'scroll' | 'paged';
/** What the user picks: "auto" lets each site decide (see ReadingStyle). */
export type ModeChoice = ReadingMode | 'auto';
export type DirectionChoice = 'auto' | 'ltr' | 'rtl';
export type ChapterOrder = 'asc' | 'desc';

export interface SettingsValues {
  /** The language of the app. */
  lang: Language;
  /** The language of the series, for the sites that publish in several: auto follows the app. */
  seriesLang: Language;
  theme: Theme;
  mode: ModeChoice;
  /** Which way pages turn: right to left like a printed manga, or left to right. */
  direction: DirectionChoice;
  /** desc: newest first. */
  chapterOrder: ChapterOrder;
}

export const DEFAULT_SETTINGS: SettingsValues = {
  lang: 'auto',
  seriesLang: 'auto',
  theme: 'auto',
  mode: 'auto',
  direction: 'auto',
  chapterOrder: 'desc',
};

export type SettingsListener = (values: SettingsValues) => void;

const KEY = 'jr:settings';
const LANGUAGES: readonly Language[] = ['auto', 'en', 'fr'];
const MODES: readonly ModeChoice[] = ['auto', 'scroll', 'paged'];
const DIRECTIONS: readonly DirectionChoice[] = ['auto', 'ltr', 'rtl'];

/**
 * The user's preferences. `defaults` lets the platform tell where it differs
 * from the engine (a test's language, for instance); what
 * the user changed always wins.
 */
export class Settings {
  private readonly store: KeyValueStore;
  private readonly defaults: SettingsValues;
  private readonly listeners = new Set<SettingsListener>();
  private overrides: Partial<SettingsValues>;

  constructor(store: KeyValueStore, defaults: Partial<SettingsValues> = {}) {
    this.store = store;
    this.defaults = { ...DEFAULT_SETTINGS, ...defaults };
    this.overrides = this.load();
  }

  get(): SettingsValues {
    return { ...this.defaults, ...this.overrides };
  }

  set(patch: Partial<SettingsValues>): void {
    this.overrides = this.tidy({ ...this.overrides, ...patch });
    try {
      this.store.set(KEY, JSON.stringify(this.overrides));
    } catch {
      // Storage blocked or full: the change still applies for this session.
    }
    for (const listener of this.listeners) listener(this.get());
  }

  /** Returns the function that stops listening. */
  subscribe(listener: SettingsListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private load(): Partial<SettingsValues> {
    try {
      const value: unknown = JSON.parse(this.store.get(KEY) ?? 'null');
      return value && typeof value === 'object' ? this.tidy(value as Partial<SettingsValues>) : {};
    } catch {
      return {};
    }
  }

  /** What an earlier version saved, made what this one reads; anything it no longer has (the proxy's address) forgotten. */
  private tidy(values: Partial<SettingsValues> & { rtl?: unknown; proxyBase?: unknown }): Partial<SettingsValues> {
    const kept = { ...values };
    delete kept.proxyBase;
    // Before the direction could be left to the site it was a yes or no.
    if (typeof kept.rtl === 'boolean' && kept.direction === undefined) kept.direction = kept.rtl ? 'rtl' : 'ltr';
    delete kept.rtl;
    if (kept.seriesLang !== undefined && !LANGUAGES.includes(kept.seriesLang)) delete kept.seriesLang;
    if (kept.mode !== undefined && !MODES.includes(kept.mode)) delete kept.mode;
    if (kept.direction !== undefined && !DIRECTIONS.includes(kept.direction)) delete kept.direction;
    return kept;
  }
}
