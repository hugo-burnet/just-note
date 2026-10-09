import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import type { Context } from '../Context.ts';
import type {} from '../NativeSourcesApp.ts';
import * as scan from '../../pretend/scanmangaPages.ts';
import * as sushi from '../../pretend/sushiscanPages.ts';
import { settle } from './helpers.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export async function nativeSources({ browser, stage, runner }: Context): Promise<void> {
  runner.heading('All six sources in the native app');
  buildSync({ absWorkingDir: ROOT, entryPoints: ['test/e2e/NativeSourcesApp.ts'], outfile: 'test-output/site/native-sources.js', bundle: true,
    format: 'esm', target: 'es2022', define: { __APP_VERSION__: JSON.stringify('native-fixture') } });
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: 'fr-FR', colorScheme: 'dark', serviceWorkers: 'block' });
  const page = runner.watch(await context.newPage());
  const step = runner.step.bind(runner);
  try {
    // Start the native composition instead of the browser composition, retaining the production HTML and styles.
    await page.route(/\/test-app\.js$/, (route) => route.abort());
    await page.goto(stage.appUrl);
    await page.addScriptTag({ url: new URL('native-sources.js', stage.appUrl).href, type: 'module' });
    await page.waitForFunction(() => !!window.nativeSources);
    await step('the installed app offers FanFox, WEBTOON, LelScan, Scan-Manga, SushiScan and Demonic Scans', async () => {
      assert.deepEqual(await page.evaluate(() => window.nativeSources.app.registry.all().map((site) => site.name)), ['FanFox', 'WEBTOON', 'LelScan', 'Scan-Manga', 'SushiScan', 'Demonic Scans']);
      await page.locator('.dock').getByRole('link', { name: 'Explorer' }).click();
      for (const name of ['FanFox', 'WEBTOON', 'LelScan', 'Scan-Manga', 'SushiScan', 'Demonic Scans']) await page.getByRole('button', { name, exact: true }).waitFor();
      await page.getByRole('button', { name: 'Scan-Manga', exact: true }).click();
      await page.locator('.grid .card').nth(1).waitFor();
      await settle(page);
      await runner.shot(page, '70-native-sources');
    });
    await step('Scan-Manga opens a series, its chapter list and script-built images', async () => {
      await page.locator('.grid .card', { hasText: scan.SERIES[0]!.title }).click();
      await page.locator('.series-title', { hasText: scan.SERIES[0]!.title }).waitFor();
      assert.equal(await page.locator('a.chapter').count(), 4);
      await page.locator('a.chapter').last().click();
      await page.waitForFunction(() => document.querySelector<HTMLImageElement>('.frame[data-index="0"] img')?.naturalWidth === 400);
      assert.equal(await page.locator('.part').first().locator('.frame').count(), 3);
      assert.match(await page.locator('.frame img').first().getAttribute('src') ?? '', /^blob:/);
    });
    await step('a long captured chapter can revisit its first page offline despite disk eviction', async () => {
      await page.evaluate(() => { window.nativeSources.captureCount = 140; });
      await page.goto(`${stage.appUrl}#/read?u=${encodeURIComponent(scan.chapterAddress(scan.SERIES[0]!, '3'))}`);
      await page.waitForFunction(() => document.querySelector<HTMLImageElement>('.frame[data-index="0"] img')?.naturalWidth === 400);
      assert.equal(await page.locator('.part').first().locator('.frame').count(), 140);
      for (let index = 0; index < 140; index += 2) {
        await page.evaluate((index) => document.querySelector(`.frame[data-index="${index}"]`)?.scrollIntoView(), index);
        await page.waitForFunction((index) => document.querySelector<HTMLImageElement>(`.frame[data-index="${index}"] img`)?.naturalWidth === 400, index);
      }
      assert.ok(await page.evaluate(() => window.nativeSources.revoked.length) > 0);
      assert.equal(await page.evaluate(async () => (await (await caches.open('jr-native-fixture-images')).keys()).length), 0);
      await page.evaluate(() => {
        window.nativeSources.online = false;
        document.querySelector('.frame[data-index="0"]')?.scrollIntoView();
      });
      await page.waitForFunction(() => document.querySelector<HTMLImageElement>('.frame[data-index="0"] img')?.naturalWidth === 400);
      await page.evaluate(() => { window.nativeSources.online = true; });
    });
    await step('a pasted SushiScan chapter resolves its series and reads the script-listed images', async () => {
      await page.goto(`${stage.appUrl}#/read?u=${encodeURIComponent(sushi.chapterAddress(sushi.LANTERN, '1'))}`);
      await page.waitForFunction(() => document.querySelector<HTMLImageElement>('.paged .single')?.naturalWidth === 400);
      assert.equal(await page.locator('.frame').count(), 0, 'a manga keeps its page mode');
      await page.keyboard.press('ArrowLeft');
      await page.waitForFunction(() => document.querySelector('.reader-count')?.textContent?.trim() === '2 / 3');
      await page.keyboard.press('Escape');
      await page.goto(`${stage.appUrl}#/`);
      await page.locator('.grid .card').nth(1).waitFor();
    });
  } finally { await context.close(); }
}
