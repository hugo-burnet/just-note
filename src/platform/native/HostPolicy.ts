import { SITES as MODULES, TransportError } from '../../engine/index.ts';
import type { SiteInfo } from '../../engine/index.ts';

/** What the app needs of a site to reach it: its hosts (pages and image servers, subdomains included) and the Referer its image servers expect. */
export type Site = Pick<SiteInfo, 'id' | 'hosts' | 'referer'>;

// The same list the app reads its sources from: a site cannot have a source and be out of reach.
const SITES: readonly Site[] = MODULES.map(({ id, hosts, referer }) => ({ id, hosts, referer }));

export interface Target {
  readonly url: URL;
  readonly site: Site;
}

/**
 * Decides which addresses the app may ask for: only the hosts of the sites it reads, so that a page's
 * links cannot send it anywhere else. A host matches itself and its subdomains, never a look-alike
 * (evilfanfox.net, fanfox.net.evil.com).
 */
export class HostPolicy {
  private readonly sites: readonly Site[];

  constructor(sites: readonly Site[] = SITES) {
    this.sites = sites;
  }

  siteFor(hostname: string): Site | null {
    const host = hostname.toLowerCase();
    return this.sites.find((site) => site.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null;
  }

  /** Validates an address (asked for, or a redirect): a TransportError when it is no plain https address of a listed site. */
  parse(value: string | null): Target {
    const url = plainHttps(value);
    const site = this.siteFor(url.hostname);
    if (!site) throw new TransportError('host_not_allowed', `The app does not read ${url.hostname}.`, { host: url.hostname });
    return { url, site };
  }
}

/** The address, over https; a TransportError when it is none, or not a plain one (credentials, another port). */
export function plainHttps(value: string | null): URL {
  let url: URL;
  try {
    url = new URL(value ?? '');
  } catch {
    throw new TransportError('bad_url', 'Missing or invalid address.');
  }
  if (url.protocol === 'http:') url.protocol = 'https:';
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
    throw new TransportError('bad_url', 'Only plain https addresses are supported.', { host: url.hostname });
  }
  return url;
}
