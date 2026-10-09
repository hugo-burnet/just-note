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

export interface Transport {
  text(url: string, request?: TextRequest): Promise<FetchedText>;
  /** The address to give an <img> so that the site's image shows up. */
  imageSource(url: string): Promise<string>;
  /** Holds an image until its consumer releases it; retry bypasses a failed cached image. */
  acquireImage?(url: string, retry?: boolean): Promise<ImageResource>;
}

export interface ImageResource {
  readonly src: string;
  release(): void;
}

export interface KeyValueStore {
  get(key: string): string | null;
  /** false means this write is available only for the current session. */
  set(key: string, value: string): boolean | void;
  remove(key: string): void;
  keys(): string[];
  /** Changes from another instance of the app. null means all keys changed. */
  subscribe?(listener: (key: string | null) => void): () => void;
}

export interface SourceIO {
  readonly transport: Transport;
  readonly parser: HtmlParser;
}
