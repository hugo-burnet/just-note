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
  /** Nobody is waiting (new chapters being looked for): a site that asks for a human check is left alone, not shown. */
  readonly background?: boolean;
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
  /** A CSS selector for the places the page keeps for them, if it has them before it has the pictures: how many to wait for. */
  readonly slots?: string;
  /** Nobody is waiting for it (the next chapter is read ahead): it is done out of sight, and gives up quietly where it would have to ask. */
  readonly background?: boolean;
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
  /** Holds an image until its consumer releases it; retry bypasses a failed cached image. */
  acquireImage?(url: string, retry?: boolean): Promise<ImageResource>;
  /** Why the last try at this picture failed, in a few words ("403 · host"), for whoever has to tell what went wrong; where the transport knows. */
  imageProblem?(url: string): string | undefined;
  /**
   * Shows the page in a browser of the app's own, scrolled as a reader would, and collects the pictures
   * its scripts built. Only where there is one (the installed app); the proxy cannot.
   */
  render?(url: string, request: RenderRequest): Promise<RenderedPage>;
  /** Where chapters are downloaded to, where the platform can keep them. */
  readonly shelf?: OfflineShelf;
}

/**
 * Where downloaded chapters are kept for good, apart from what is kept while reading (which makes room for
 * what is read next). Pictures go by their address, as the transport knows them; texts by a key of the
 * engine's. Every call may fail (storage full or blocked): the caller says so.
 */
export interface OfflineShelf {
  /** Keeps a picture for good: the copy kept while reading when there is one, else downloaded now. Answers its size in bytes. */
  keepPicture(address: string): Promise<number>;
  dropPictures(addresses: readonly string[]): Promise<void>;
  keepText(key: string, text: string): Promise<void>;
  /** null when nothing is kept under `key`. */
  text(key: string): Promise<string | null>;
  dropText(key: string): Promise<void>;
  /** Asks the system not to clear this storage when the device runs short of room; whether it promised. */
  persist(): Promise<boolean>;
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
