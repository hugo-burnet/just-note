import type { KeyValueStore } from './ports.ts';

export type Language = 'auto' | 'en' | 'fr';
export type Theme = 'auto' | 'dark' | 'light';
export type ReadingMode = 'scroll' | 'paged';
export type ChapterOrder = 'asc' | 'desc';

export interface SettingsValues {
  lang: Language;
  theme: Theme;
  mode: ReadingMode;
  /** Paged mode: right to left, like a printed manga. */
  rtl: boolean;
  /** desc: newest first. */
  chapterOrder: ChapterOrder;
  /** Where the proxy lives; empty means the same address as the app. */
  proxyBase: string;
}

export const DEFAULT_SETTINGS: SettingsValues = {
  lang: 'auto',
  theme: 'auto',
  mode: 'scroll',
  rtl: true,
  chapterOrder: 'desc',
  proxyBase: '',
};

export type SettingsListener = (values: SettingsValues) => void;

const KEY = 'jr:settings';

/**
 * The user's preferences. `defaults` lets the platform tell where it differs
 * from the engine (the proxy address a build was made for, for instance); what
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
    this.overrides = { ...this.overrides, ...patch };
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
      return value && typeof value === 'object' ? (value as Partial<SettingsValues>) : {};
    } catch {
      return {};
    }
  }
}
