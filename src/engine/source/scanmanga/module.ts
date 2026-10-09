import type { SiteModule } from '../Site.ts';
import { ScanMangaSource } from './ScanMangaSource.ts';

export const scanmanga: SiteModule = {
  id: 'scanmanga',
  name: 'Scan-Manga',
  // Pages (m. and www.) and pictures (static.) are served from the one domain.
  hosts: ['scan-manga.com'],
  referer: 'https://m.scan-manga.com/',
  // Cloudflare checks its visitors: a WebView, which only the installed app has, passes the check.
  nativeOnly: true,
  create: (io) => new ScanMangaSource(io),
};
