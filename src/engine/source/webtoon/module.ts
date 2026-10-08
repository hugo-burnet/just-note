import type { SiteModule } from '../Site.ts';
import { WebtoonSource } from './WebtoonSource.ts';

export const webtoon: SiteModule = {
  id: 'webtoon',
  name: 'WEBTOON',
  hosts: ['webtoons.com', 'pstatic.net'],
  referer: 'https://www.webtoons.com/',
  create: (io) => new WebtoonSource(io),
};
