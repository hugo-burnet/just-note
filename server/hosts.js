// Hosts the proxy may talk to. An entry matches the host itself and any of its
// subdomains; `referer` is what that family of sites expects to receive.
export const SITES = [
  { hosts: ['fanfox.net', 'mangafox.me', 'mangafox.la'], referer: 'https://fanfox.net/' },
  // Image CDNs of the same network.
  { hosts: ['mangahere.org', 'mfcdn.net'], referer: 'https://fanfox.net/' },
];

const HOSTNAME = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

// PROXY_EXTRA_HOSTS="cdn.example.com,img.example.net": more hosts of the first
// site family (typically a CDN that shows up in the logs as "not allowed").
export function withExtraHosts(sites, extra) {
  const hosts = String(extra ?? '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter((h) => HOSTNAME.test(h));
  return hosts.length ? [...sites, { hosts, referer: sites[0].referer }] : sites;
}

export function siteFor(hostname, sites = SITES) {
  const host = hostname.toLowerCase();
  return sites.find((s) => s.hosts.some((h) => host === h || host.endsWith(`.${h}`))) ?? null;
}
