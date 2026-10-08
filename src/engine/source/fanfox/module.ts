import type { SiteModule } from '../Site.ts';
import { FanFoxSource } from './FanFoxSource.ts';

export const fanfox: SiteModule = {
  id: 'fanfox',
  name: 'FanFox',
  hosts: ['fanfox.net', 'mangafox.me', 'mangafox.la', 'mangahere.org', 'mfcdn.net'],
  referer: 'https://fanfox.net/',
  create: (io) => new FanFoxSource(io),
};
