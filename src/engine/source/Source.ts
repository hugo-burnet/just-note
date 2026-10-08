import type { ChapterPages, Series, SeriesSummary, SourceTarget } from '../model.ts';
import type { ReadingStyle } from '../reader/ReadingStyle.ts';
import type { DomDocument, HtmlParser, SourceIO, TextRequest, Transport } from '../ports.ts';

export interface LoadedDocument {
  readonly doc: DomDocument;
  readonly text: string;
  readonly url: string;
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

  protected readonly transport: Transport;
  protected readonly parser: HtmlParser;

  constructor(io: SourceIO) {
    this.transport = io.transport;
    this.parser = io.parser;
  }

  /** What a link points at on this site, in canonical form; null when it is not ours. */
  abstract resolve(input: string): SourceTarget | null;

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

  abstract getChapter(url: string): Promise<ChapterPages>;

  protected async load(url: string, request?: TextRequest): Promise<LoadedDocument> {
    const fetched = await this.transport.text(url, request);
    return { doc: this.parser.parse(fetched.text), text: fetched.text, url: fetched.url };
  }
}
