// What the engine needs from the outside world. It never touches the network,
// the DOM or the storage itself: the platform (the browser today, Capacitor
// later) hands it implementations of these interfaces.

/** The part of an element the sources read. A browser Element fits. */
export interface DomNode {
  readonly textContent: string | null;
  getAttribute(name: string): string | null;
  querySelector(selector: string): DomNode | null;
  querySelectorAll(selector: string): Iterable<DomNode>;
  closest(selector: string): DomNode | null;
}

/** The part of a document the sources read. A browser Document fits. */
export interface DomDocument {
  querySelector(selector: string): DomNode | null;
  querySelectorAll(selector: string): Iterable<DomNode>;
}

export interface HtmlParser {
  parse(html: string): DomDocument;
}

export interface TextRequest {
  /** A page to present as the Referer (some sites check it). */
  readonly referer?: string;
  /** false: the answer is only good once (it carries a token), do not keep it. */
  readonly cache?: boolean;
}

export interface FetchedText {
  readonly text: string;
  /** Where the request ended up, after redirects. */
  readonly url: string;
}

/** What a page is shown for. */
export interface RenderRequest {
  /** A CSS selector for the pictures the page's scripts build: they are what is collected. */
  readonly pictures: string;
}

/** A page as a real browser shows it once its scripts have run. */
export interface RenderedPage {
  readonly text: string;
  /** Where the browser ended up. */
  readonly url: string;
  /** The pictures the page built (no address names them), in reading order: addresses for `imageSource`. */
  readonly pictures: readonly string[];
}

export interface Transport {
  text(url: string, request?: TextRequest): Promise<FetchedText>;
  /** The address to give an <img> so that the site's image shows up. */
  imageSource(url: string): Promise<string>;
  /**
   * Shows the page in a browser of the app's own, scrolled as a reader would, and collects the pictures
   * its scripts built. Only where there is one (the installed app); the proxy cannot.
   */
  render?(url: string, request: RenderRequest): Promise<RenderedPage>;
}

export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

export interface SourceIO {
  readonly transport: Transport;
  readonly parser: HtmlParser;
}
