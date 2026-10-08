// What a language is called in its own language, so it never needs translating.
const NAMES: Readonly<Record<string, string>> = { en: 'English', fr: 'Français' };

export const languageName = (code: string): string => NAMES[code] ?? code.toUpperCase();
