export type RouteName = 'library' | 'discover' | 'settings' | 'series' | 'read';

export interface Route {
  readonly name: RouteName;
  readonly params: Readonly<Record<string, string>>;
}

const NAMES: ReadonlySet<string> = new Set<RouteName>(['library', 'discover', 'settings', 'series', 'read']);

const encode = encodeURIComponent;

/** The addresses of the app's screens. Hash based, so any static host serves them. */
export class Routes {
  static library(): string {
    return '#/';
  }

  static discover(options: { source?: string; query?: string } = {}): string {
    const parts = [options.source && `src=${encode(options.source)}`, options.query && `q=${encode(options.query)}`].filter(Boolean);
    return `#/discover${parts.length > 0 ? `?${parts.join('&')}` : ''}`;
  }

  static settings(): string {
    return '#/settings';
  }

  static series(url: string): string {
    return `#/series?u=${encode(url)}`;
  }

  /** `end`: open on the last page, for coming back from the chapter that follows. */
  static read(url: string, options: { end?: boolean } = {}): string {
    return `#/read?u=${encode(url)}${options.end ? '&end=1' : ''}`;
  }

  static parse(hash: string): Route {
    const [path = '', query = ''] = hash.replace(/^#/, '').split('?');
    const name = path.replace(/^\//, '') || 'library';
    return {
      name: (NAMES.has(name) ? name : 'library') as RouteName,
      params: Object.fromEntries(new URLSearchParams(query)),
    };
  }
}
