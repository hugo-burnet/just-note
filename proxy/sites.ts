import { SITES as MODULES } from '../src/engine/sites.ts';
import type { SiteInfo } from '../src/engine/source/Site.ts';

/** What the proxy needs of a site: its hosts (pages and image servers, subdomains included) and the Referer its image servers expect. */
export type Site = Pick<SiteInfo, 'id' | 'hosts' | 'referer'>;

// The same list the app reads its sources from: a site cannot be readable in the app
// and refused by the proxy.
export const SITES: readonly Site[] = MODULES.map(({ id, hosts, referer }) => ({ id, hosts, referer }));
