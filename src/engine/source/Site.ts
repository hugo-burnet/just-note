import type { SourceIO } from '../ports.ts';
import type { Source } from './Source.ts';

/**
 * What the app needs to know about a website to reach it: who it is, which hosts are
 * its own, and what its image servers want to see as Referer (see sites.ts).
 */
export interface SiteInfo {
  readonly id: string;
  readonly name: string;
  /** The hosts of the site, pages and image servers alike (subdomains included): all the app may reach for it. */
  readonly hosts: readonly string[];
  readonly referer: string;
}

/** A site the app can read: its identity, and how to make the Source that knows its pages. */
export interface SiteModule extends SiteInfo {
  create(io: SourceIO): Source;
}
