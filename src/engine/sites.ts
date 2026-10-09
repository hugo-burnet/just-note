import { demonicscans } from './source/demonicscans/module.ts';
import { fanfox } from './source/fanfox/module.ts';
import { lelscan } from './source/lelscan/module.ts';
import { scanmanga } from './source/scanmanga/module.ts';
import type { SiteModule } from './source/Site.ts';
import { sushiscan } from './source/sushiscan/module.ts';
import { webtoon } from './source/webtoon/module.ts';

/**
 * Every site the app can read. Adding one is writing its module and listing it here:
 * the app builds its sources from this list, and the proxy takes its allowlist from it.
 */
export const SITES: readonly SiteModule[] = [fanfox, webtoon, lelscan, scanmanga, sushiscan, demonicscans];
