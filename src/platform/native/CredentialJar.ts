import type { FetchedPage } from './PageFetcher.ts';

/** What the app's own requests carry besides what they always do, host by host. */
export interface Credentials {
  headersFor(host: string): Readonly<Record<string, string>>;
}

interface Entry {
  readonly cookie: string;
  readonly userAgent: string;
  readonly at: number;
}

/** `scan-manga.com` for `static.scan-manga.com`: the hosts of one site share its domain. */
const domainOf = (host: string): string => host.split('.').slice(-2).join('.');

function hostOf(address: string): string {
  try {
    return new URL(address).hostname;
  } catch {
    return '';
  }
}

/**
 * What a WebView was given when a site's anti-bot check let it through: the cookies, and the
 * User-Agent they are tied to (a clearance is only good for the browser it was given to), host by
 * host. Kept in memory only: the WebView keeps its own cookies, so a new run earns these again
 * in a moment.
 */
export class CredentialJar implements Credentials {
  private readonly kept = new Map<string, Entry>();
  private readonly now: () => number;
  /** Goes up each time something is remembered, which lets a request that was turned away tell whether another got through while it waited. */
  version = 0;

  constructor(now: () => number = Date.now) {
    this.now = now;
  }

  /**
   * A host nothing was earned for goes with what its site's other hosts earned: a clearance is usually
   * given to the whole domain (to `.example.com`), and where it is not, sending it does no harm.
   */
  headersFor(host: string): Readonly<Record<string, string>> {
    const entry = this.kept.get(host) ?? this.newestOf(domainOf(host));
    if (!entry) return {};
    return entry.cookie ? { 'User-Agent': entry.userAgent, Cookie: entry.cookie } : { 'User-Agent': entry.userAgent };
  }

  /** `hosts`: the ones that turned the phone away; the one the WebView ended on is remembered too. */
  remember(page: FetchedPage, ...hosts: string[]): void {
    const entry: Entry = { cookie: page.cookies, userAgent: page.userAgent, at: this.now() };
    for (const host of new Set([...hosts, hostOf(page.url)])) {
      if (host) this.kept.set(host, entry);
    }
    this.version++;
  }

  private newestOf(domain: string): Entry | undefined {
    let newest: Entry | undefined;
    for (const [host, entry] of this.kept) {
      if (domainOf(host) === domain && (!newest || entry.at > newest.at)) newest = entry;
    }
    return newest;
  }

  /** Whether a WebView earned this very host's credentials less than `ms` ago. */
  earnedWithin(host: string, ms: number): boolean {
    const entry = this.kept.get(host);
    return entry !== undefined && this.now() - entry.at < ms;
  }
}
