import type { ChapterPages, Series, SeriesSummary, SourceTarget } from '../model.ts';
import type { ReadingStyle } from '../reader/ReadingStyle.ts';
import type { DomDocument, HtmlParser, SourceIO, TextRequest, Transport } from '../ports.ts';

export interface ChapterOptions {
  readonly background?: boolean;
}

export interface LoadedDocument {
  readonly doc: DomDocument;
  readonly text: string;
  readonly url: string;
}

/** What the page of a series says of it at a glance (see Source.glance). */
export interface Glance {
  readonly cover: string | null;
  readonly genres: readonly string[];
}

/**
 * A source teaches the app one website: it recognises the site's links and turns
 * its pages into series, chapters and images. Adding a site means writing a
 * subclass, a module that describes the site (see Site.ts) and listing it in
 * sites.ts. Everything it needs from outside arrives through the two ports.
 */
export abstract class Source {
  abstract readonly id: string;
  abstract readonly name: string;
  /** The languages the site publishes in, its default first. Most sites publish in one. */
  abstract readonly languages: readonly string[];
  /** How what this site publishes is meant to be read: pages of a manga, or a long column. */
  abstract readonly reading: ReadingStyle;

  /**
   * Whether the covers in this site's listings are poor ones (thumbnails, a crop): the one on the series page
   * is then worth asking for (`glance`) as the listing is looked at.
   */
  readonly betterCovers: boolean = false;

  /** Whether this site's series pages say their genres: where they never do, there is nothing to filter its listings by. */
  readonly genres: boolean = true;

  protected readonly transport: Transport;
  protected readonly parser: HtmlParser;

  constructor(io: SourceIO) {
    this.transport = io.transport;
    this.parser = io.parser;
  }

  /** What a link points at on this site, in canonical form; null when it is not ours. */
  abstract resolve(input: string): SourceTarget | null;

  /**
   * A chapter whose address does not say which series it belongs to (a link pasted from the site) is
   * completed from the site; null when it cannot be. Every other target is already whole.
   */
  async complete(target: SourceTarget): Promise<SourceTarget | null> {
    return target;
  }

  /** The language the site is browsed in when `wanted` is asked for: that one if the site has it, else its default. */
  languageFor(wanted?: string): string {
    return wanted !== undefined && this.languages.includes(wanted) ? wanted : (this.languages[0] ?? 'en');
  }

  /** A listing page to start browsing from, in the language asked for when the site has it. */
  home(language?: string): string {
    return this.homeIn(this.languageFor(language));
  }

  /** Address of the site's search results for `query` (a listing), in the same way. */
  searchUrl(query: string, language?: string): string {
    return this.searchIn(query, this.languageFor(language));
  }

  /** `language` is always one of the site's own. */
  protected abstract homeIn(language: string): string;

  protected abstract searchIn(query: string, language: string): string;

  abstract getSeries(url: string): Promise<Series>;

  abstract getList(url: string): Promise<SeriesSummary[]>;

  /**
   * What the page of a series says of it at a glance, for a listing: its cover and its genres, from one reading
   * of the page. A source overrides it to ask for less than the whole series.
   */
  async glance(url: string): Promise<Glance> {
    const { cover, genres } = await this.getSeries(url);
    return { cover, genres };
  }

  /** `options.background`: it is read ahead, nobody is waiting (only a source that has to open a browser for it cares). */
  abstract getChapter(url: string, options?: ChapterOptions): Promise<ChapterPages>;

  protected async load(url: string, request?: TextRequest): Promise<LoadedDocument> {
    const fetched = await this.transport.text(url, request);
    return { doc: this.parser.parse(fetched.text), text: fetched.text, url: fetched.url };
  }
}
