import type { SourceIO } from '../ports.ts';
import type { Source } from './Source.ts';

/**
 * What the app and the proxy both need to know about a website: who it is, which
 * hosts are its own, and what its image servers want to see as Referer. Both read
 * it from the same place (see sites.ts), so that they cannot disagree.
 */
export interface SiteInfo {
  readonly id: string;
  readonly name: string;
  /** The hosts of the site, pages and image servers alike (subdomains included): all the proxy may reach for it. */
  readonly hosts: readonly string[];
  readonly referer: string;
}

/** A site the app can read: its identity, and how to make the Source that knows its pages. */
export interface SiteModule extends SiteInfo {
  /**
   * The site checks its visitors with a challenge that only a browser passes (and builds its pages with
   * scripts): it can be read in the installed app, which has a WebView, and not through the proxy.
   */
  readonly nativeOnly?: boolean;
  create(io: SourceIO): Source;
}
