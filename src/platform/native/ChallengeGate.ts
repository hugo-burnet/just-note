import { TransportError } from '../../engine/index.ts';
import type { DialogLabels, FetchOptions } from '../Platform.ts';
import { isChallenge } from './Challenge.ts';
import type { CredentialJar } from './CredentialJar.ts';
import type { FetchedPage, PageFetcher } from './PageFetcher.ts';
import type { Fetched, Kind, SiteClient, Sites } from './SiteClient.ts';

// A picture server that turns the phone away again right after a WebView got it through is not going to
// let pictures through: asking the user again for each of the pictures of a chapter would be no help.
const PICTURE_WINDOW_MS = 5 * 60_000;
const ROUNDS = 3;

/** Shows a page in the WebView of the app and gives back the pictures its scripts built. */
export interface PageRenderer {
  render(address: string, selector: string): Promise<FetchedPage>;
}

/** One at a time: the WebView is a full-screen dialog, and two cannot be answered together. */
class Queue {
  private tail: Promise<unknown> = Promise.resolve();

  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/**
 * Reaches the sites like SiteClient, and when one of them turns the phone away with an anti-bot
 * check (Cloudflare's "Just a moment..."), has a WebView pass it. The WebView is given the very
 * address that was refused; what it earns (cookie, User-Agent) goes with the next requests, so
 * the phone's own network is used again and the WebView is only needed when the clearance runs out.
 * A page that the phone is still turned away from is read from the WebView's own copy instead.
 */
export class ChallengeGate implements Sites, PageRenderer {
  private readonly client: SiteClient;
  private readonly jar: CredentialJar;
  private readonly fetcher: PageFetcher;
  private readonly dialog: () => DialogLabels;
  private readonly queue = new Queue();

  /** `jar` is the one `client` reads its credentials from. */
  constructor(client: SiteClient, jar: CredentialJar, fetcher: PageFetcher, dialog: () => DialogLabels = () => ({})) {
    this.client = client;
    this.jar = jar;
    this.fetcher = fetcher;
    this.dialog = dialog;
  }

  resolve(address: string): URL {
    return this.client.resolve(address);
  }

  async get(address: string, kind: Kind, referer?: string): Promise<Fetched> {
    let shown: FetchedPage | undefined;
    for (let round = 0; ; round++) {
      const version = this.jar.version;
      const fetched = await this.client.exchange(address, kind, referer);
      if (!isChallenge(fetched.response)) return this.client.checked(fetched);
      // Turned away even with what the WebView earned: a page can still be read from the WebView.
      if (shown && kind === 'text') return this.rendered(shown, fetched.url);
      if (shown || round === ROUNDS) return this.client.checked(fetched);
      shown = await this.queue.run(() => this.pass(fetched.url, kind, version));
    }
  }

  /**
   * The page as the WebView shows it once its scripts have run, with the pictures they built (those
   * that `selector` matches, in the order they are in the page). It is the WebView that passes a check
   * on the way, and what it earns is kept as for any other page.
   */
  render(address: string, selector: string): Promise<FetchedPage> {
    const url = this.client.resolve(address);
    return this.queue.run(() => this.visit(url, { ...this.dialog(), pictures: selector }));
  }

  /** The page as the WebView shows it once the site let it through; nothing when another request got through while this one waited. */
  private async pass(url: URL, kind: Kind, version: number): Promise<FetchedPage | undefined> {
    if (this.jar.version !== version) return undefined;
    if (kind === 'image' && this.jar.earnedWithin(url.hostname, PICTURE_WINDOW_MS)) {
      throw new TransportError('upstream_status', 'The source answered 403.', { upstreamStatus: 403, host: url.hostname });
    }
    return this.visit(url, this.dialog());
  }

  private async visit(url: URL, options: FetchOptions): Promise<FetchedPage> {
    let page: FetchedPage;
    try {
      page = await this.fetcher.fetch(url.href, options);
    } catch (error) {
      // The check was not passed (the user cancelled, or the site never let the WebView through), or the
      // page was passed and its pictures did not come.
      const host = url.hostname;
      if ((error as { code?: unknown }).code === 'pictures') throw new TransportError('upstream_unreachable', 'The pictures of the page did not come.', { host });
      throw new TransportError('blocked', 'The site asked for a human check that was not passed.', { host });
    }
    this.jar.remember(page, url.hostname);
    return page;
  }

  private rendered(page: FetchedPage, asked: URL): Fetched {
    let url = asked;
    try {
      url = this.client.resolve(page.url);
    } catch {
      // The WebView ended up somewhere the app does not read: the address that was asked for stands.
    }
    return { response: { status: 200, headers: { 'content-type': 'text/html' }, body: page.html }, url };
  }
}
