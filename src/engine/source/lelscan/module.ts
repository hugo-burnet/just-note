import type { SiteModule } from '../Site.ts';
import { LelScanSource } from './LelScanSource.ts';

export const lelscan: SiteModule = {
  id: 'lelscan',
  name: 'LelScan',
  // Pages and images are served from the same host.
  hosts: ['lelscans.net'],
  referer: 'https://lelscans.net/',
  create: (io) => new LelScanSource(io),
};
