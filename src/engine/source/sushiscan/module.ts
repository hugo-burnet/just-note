import type { SiteModule } from '../Site.ts';
import { SushiScanSource } from './SushiScanSource.ts';

export const sushiscan: SiteModule = {
  id: 'sushiscan',
  name: 'SushiScan',
  // Pages (sushiscan.net) and pictures (c.sushiscan.net) are served from the one domain.
  hosts: ['sushiscan.net'],
  referer: 'https://sushiscan.net/',
  create: (io) => new SushiScanSource(io),
};
