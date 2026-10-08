// End-to-end check of the built app in Chromium, laid out like the real deployment
// (see Stage.ts), with pretend FanFox and WEBTOON sites behind the proxy: no network,
// made-up titles, generated images. Screenshots land in test-output/ for a human to look at.
//   npm run test:e2e              everything
//   npm run test:e2e -- fanfox    one flow
// Needs Playwright's Chromium (npx playwright install chromium).
import { chromium } from 'playwright';
import type { Context } from './Context.ts';
import { browseAndSettings } from './flows/browse.ts';
import { onDesktop } from './flows/desktop.ts';
import { readFanFox } from './flows/fanfox.ts';
import { readLelScan } from './flows/lelscan.ts';
import { offline } from './flows/offline.ts';
import { update } from './flows/update.ts';
import { readWebtoon } from './flows/webtoon.ts';
import { Pictures } from './Pictures.ts';
import { PretendFanFox } from './PretendFanFox.ts';
import { PretendLelScan } from './PretendLelScan.ts';
import { PretendWeb } from './PretendWeb.ts';
import { PretendWebtoon } from './PretendWebtoon.ts';
import { Runner } from './Runner.ts';
import { Stage } from './Stage.ts';

// The offline flow has to come last: it takes the servers away.
const FLOWS: ReadonlyArray<readonly [string, (context: Context) => Promise<void>]> = [
  ['fanfox', readFanFox],
  ['webtoon', readWebtoon],
  ['lelscan', readLelScan],
  ['browse', browseAndSettings],
  ['desktop', onDesktop],
  ['update', update],
  ['offline', offline],
];

const only = process.argv[2];
const runner = new Runner();
await runner.prepare();
const browser = await chromium.launch();
const pages = await Pictures.draw(browser, { count: 5, width: 400, height: 600, hue: 20 });
const strips = await Pictures.draw(browser, { count: 5, width: 600, height: 1100, hue: 200 });
const scans = await Pictures.draw(browser, { count: 5, width: 400, height: 600, hue: 120 });
const web = new PretendWeb([new PretendFanFox(pages), new PretendWebtoon(strips), new PretendLelScan(scans)]);
const stage = await Stage.open(web);

for (const [name, flow] of FLOWS) {
  if (!only || only === name) await flow({ browser, stage, web, runner });
}
await browser.close();
await stage.goOffline();
process.exit(runner.finish());
