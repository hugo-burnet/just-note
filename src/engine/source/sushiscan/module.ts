import type { SiteModule } from '../Site.ts';
import { SushiScanSource } from './SushiScanSource.ts';

export const sushiscan: SiteModule = {
  id: 'sushiscan',
  name: 'SushiScan',
  // Pages (sushiscan.net) and pictures (c.sushiscan.net) are served from the one domain.
  hosts: ['sushiscan.net'],
  referer: 'https://sushiscan.net/',
  // Cloudflare answers a data centre (the proxy) with its check, and the phone with the page: only the installed app reads it.
  nativeOnly: true,
  create: (io) => new SushiScanSource(io),
};
