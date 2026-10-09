import type { Target } from './HostPolicy.ts';
import { plainHttps } from './HostPolicy.ts';
import type { Policy } from './SiteClient.ts';

/**
 * Any plain https address, with its own site as the Referer. For looking at a page the app has
 * no module for yet; the sites the app reads keep to the list of their hosts (HostPolicy).
 */
export class OpenPolicy implements Policy {
  parse(value: string | null): Target {
    const url = plainHttps(value);
    return { url, site: { id: url.hostname, hosts: [url.hostname], referer: `${url.origin}/` } };
  }
}
