import type { SiteModule } from '../Site.ts';
import { ScanMangaSource } from './ScanMangaSource.ts';

export const scanmanga: SiteModule = {
  id: 'scanmanga',
  name: 'Scan-Manga',
  // Pages (m. and www.) and pictures (static.) are served from the one domain.
  hosts: ['scan-manga.com'],
  referer: 'https://m.scan-manga.com/',
  create: (io) => new ScanMangaSource(io),
};
