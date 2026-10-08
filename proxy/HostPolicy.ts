import { ProxyError } from './ProxyError.ts';
import { SITES } from './sites.ts';
import type { Site } from './sites.ts';

const HOSTNAME = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

export interface Target {
  readonly url: URL;
  readonly site: Site;
}

// Decides which addresses the proxy may fetch. A host matches itself and its
// subdomains, never a look-alike (evilfanfox.net, fanfox.net.evil.com).
export class HostPolicy {
  private readonly sites: readonly Site[];

  constructor(sites: readonly Site[] = SITES) {
    this.sites = sites;
  }

  // PROXY_EXTRA_HOSTS="cdn.example.com,webtoon:img.example.net": more hosts for a
  // site ("site:host", a bare host goes to the first site). Entries that do not
  // look like a domain are ignored, so a typo cannot open a whole TLD.
  withExtraHosts(spec: string | undefined): HostPolicy {
    const additions = new Map<string, string[]>();
    for (const entry of (spec ?? '').split(',')) {
      const parts = entry.trim().toLowerCase().split(':');
      const host = parts.pop() ?? '';
      const siteId = parts[0] ?? this.sites[0]?.id;
      if (!siteId || !HOSTNAME.test(host) || !this.sites.some((site) => site.id === siteId)) continue;
      additions.set(siteId, [...(additions.get(siteId) ?? []), host]);
    }
    if (additions.size === 0) return this;
    return new HostPolicy(this.sites.map((site) => ({ ...site, hosts: [...site.hosts, ...(additions.get(site.id) ?? [])] })));
  }

  siteFor(hostname: string): Site | null {
    const host = hostname.toLowerCase();
    return this.sites.find((site) => site.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null;
  }

  // Validates an address coming from the app (or from a redirect).
  parse(value: string | null): Target {
    let url: URL;
    try {
      url = new URL(value ?? '');
    } catch {
      throw new ProxyError(400, 'bad_url', 'Missing or invalid "u" parameter.');
    }
    if (url.protocol === 'http:') url.protocol = 'https:';
    if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443')) {
      throw new ProxyError(400, 'bad_url', 'Only plain https URLs are supported.');
    }
    const site = this.siteFor(url.hostname);
    if (!site) {
      throw new ProxyError(403, 'host_not_allowed', `The proxy does not allow ${url.hostname}.`, { host: url.hostname });
    }
    return { url, site };
  }
}
