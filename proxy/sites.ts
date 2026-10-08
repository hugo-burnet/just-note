// The sites the proxy knows: the hosts that belong to each one (pages and image
// CDNs, subdomains included) and the Referer their CDN expects to see.
export interface Site {
  readonly id: string;
  readonly hosts: readonly string[];
  readonly referer: string;
}

export const SITES: readonly Site[] = [
  {
    id: 'fanfox',
    hosts: ['fanfox.net', 'mangafox.me', 'mangafox.la', 'mangahere.org', 'mfcdn.net'],
    referer: 'https://fanfox.net/',
  },
  {
    id: 'webtoon',
    hosts: ['webtoons.com', 'pstatic.net'],
    referer: 'https://www.webtoons.com/',
  },
];
