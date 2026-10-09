import type { Target } from '../../../proxy/HostPolicy.ts';
import { ProxyError } from '../../../proxy/ProxyError.ts';
import type { Policy } from './SiteClient.ts';

/**
 * Any plain https address, with its own site as the Referer. For looking at a page the app has
 * no module for yet; the sites the app reads keep to the list of their hosts (HostPolicy).
 */
export class OpenPolicy implements Policy {
  parse(value: string | null): Target {
    let url: URL;
    try {
      url = new URL(value ?? '');
    } catch {
      throw new ProxyError(400, 'bad_url', 'Missing or invalid address.');
    }
    if (url.protocol === 'http:') url.protocol = 'https:';
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
      throw new ProxyError(400, 'bad_url', 'Only plain https addresses are supported.');
    }
    return { url, site: { id: url.hostname, hosts: [url.hostname], referer: `${url.origin}/` } };
  }
}
