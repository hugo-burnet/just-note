import assert from 'node:assert/strict';
import { buildSync } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { devices } from 'playwright';
import type { Page } from 'playwright';
import type { Context } from '../Context.ts';
import type {} from '../RegressionApp.ts';
import { FANFOX_SERIES } from '../PretendFanFox.ts';
import { counter, openReadingOptions, waitCounter, waitShown } from './helpers.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const loadHarness = async (page: Page, appUrl: string): Promise<void> => {
  await page.addScriptTag({ url: new URL('regressions.js', appUrl).href, type: 'module' });
  await page.waitForFunction(() => !!window.regression);
};

/** Regression checks for shared browser storage and the native reader's real blob images. */
export async function regressions({ browser, stage, runner }: Context): Promise<void> {
  runner.heading('Shared storage and native image regressions');
  buildSync({ absWorkingDir: ROOT, entryPoints: ['test/e2e/RegressionApp.ts'], outfile: 'test-output/site/regressions.js', bundle: true, format: 'esm', target: 'es2022' });
  const context = await browser.newContext({ ...devices['Pixel 7'], locale: 'en-US', serviceWorkers: 'block' });
  const first = runner.watch(await context.newPage());
  const second = runner.watch(await context.newPage());
  const step = runner.step.bind(runner);
  try {
    for (const page of [first, second]) {
      await page.goto(stage.appUrl);
      await page.locator('.empty').waitFor();
      await loadHarness(page, stage.appUrl);
    }
    await step('two tabs preserve both series, progress and finished chapters, without reloading', async () => {
      await first.evaluate(() => {
        const url = 'https://fanfox.net/manga/alpha/';
        const library = window.regression.library;
        library.save({ url, title: 'Alpha', cover: null });
        library.setPosition(url, { chapter: `${url}c001/1.html`, key: 'c001', title: 'Chapter 1', page: 10 });
        library.markRead(url, 'c000');
      });
      await first.goto(`${stage.appUrl}#/settings`);
      await first.goto(`${stage.appUrl}#/`);
      await first.locator('.card-title', { hasText: 'Alpha' }).waitFor();
      await second.evaluate(() => window.regression.library.save({ url: 'https://fanfox.net/manga/beta/', title: 'Beta', cover: null }));
      await first.locator('.card-title', { hasText: 'Beta' }).waitFor();
      await second.goto(`${stage.appUrl}#/settings`);
      await second.goto(`${stage.appUrl}#/`);
      await second.locator('.card-title', { hasText: 'Alpha' }).waitFor();
      await second.locator('.card-title', { hasText: 'Beta' }).waitFor();
      const saved = await second.evaluate(() => ({ position: window.regression.library.position('https://fanfox.net/manga/alpha/'), read: window.regression.library.readCount('https://fanfox.net/manga/alpha/') }));
      assert.equal(saved.position?.page, 10);
      assert.equal(saved.read, 1);
    });
    await step('a library cleared in another tab disappears from the visible shelf', async () => {
      await second.evaluate(() => window.regression.library.clear());
      await first.locator('.empty').waitFor();
      assert.equal(await first.locator('.card-title').count(), 0);
    });
    await second.close();
    await step('a new sheet replaces the closing sheet and keeps only one link form', async () => {
      await first.getByRole('button', { name: 'Paste a link' }).click();
      await first.locator('.sheet-host[data-open=true]').waitFor();
      await first.keyboard.press('Escape');
      await first.getByRole('button', { name: 'Paste a link' }).click();
      assert.equal(await first.locator('input[name=link]').count(), 1);
      await first.locator('.sheet-host[data-open=true]').waitFor();
      await first.keyboard.press('Escape');
      await first.locator('.sheet-host').waitFor({ state: 'detached' });
    });
    await first.route('https://fmcdn.mfcdn.net/**', (route) => route.abort());
    await step('closing reading options releases keyboard navigation before the animation ends', async () => {
      await first.goto(`${stage.appUrl}#/read?u=${encodeURIComponent(`${FANFOX_SERIES}c001/1.html`)}`);
      await waitShown(first, 1);
      await openReadingOptions(first);
      await first.keyboard.press('ArrowLeft');
      assert.equal(await counter(first), '1 / 3');
      await first.keyboard.press('Escape');
      await first.keyboard.press('ArrowLeft');
      await waitCounter(first, '2 / 3');
      await first.locator('.sheet-host').waitFor({ state: 'detached' });
    });
    await step('native paged retry displays the recovered image using its exact blob address', async () => {
      await first.evaluate(() => {
        window.regression.online = false;
        window.regression.openNative('paged', 4);
      });
      await first.locator('.paged[data-state=failed]').waitFor();
      await first.evaluate(() => { window.regression.online = true; });
      await first.getByRole('button', { name: 'Retry image' }).click();
      await first.waitForFunction(() => document.querySelector<HTMLImageElement>('.single')?.naturalWidth === 400);
      assert.match(await first.locator('.single').getAttribute('src') ?? '', /^blob:/);
      assert.doesNotMatch(await first.locator('.single').getAttribute('src') ?? '', /\?r=/);
    });
    await step('native scroll retry also recovers after a network failure', async () => {
      await first.evaluate(() => {
        window.regression.online = false;
        window.regression.openNative('scroll', 4);
      });
      await first.locator('.frame[data-index="0"][data-state=failed]').waitFor();
      await first.evaluate(() => { window.regression.online = true; });
      await first.locator('.frame[data-index="0"] .retry').click();
      await first.waitForFunction(() => document.querySelector<HTMLImageElement>('.frame[data-index="0"] img')?.naturalWidth === 400);
    });
    await step('a long native chapter downloads nearby images and keeps its first page readable', async () => {
      await first.evaluate(() => window.regression.openNative('scroll', 140));
      await first.waitForFunction(() => document.querySelector<HTMLImageElement>('.frame[data-index="0"] img')?.naturalWidth === 400);
      assert.ok(await first.evaluate(() => window.regression.downloads) < 20, 'faraway images must not be downloaded on opening');
      for (let index = 0; index < 140; index += 2) {
        await first.evaluate((at) => window.regression.reader?.goTo(at), index);
        await first.waitForFunction((at) => document.querySelector<HTMLImageElement>(`.frame[data-index="${at}"] img`)?.naturalWidth === 400, index);
      }
      assert.ok(await first.evaluate(() => window.regression.revoked.length) > 0, 'unused images must be released past the cache limit');
      await first.evaluate(() => {
        window.regression.online = false;
        window.regression.reader?.goTo(0);
      });
      await first.waitForFunction(() => document.querySelector<HTMLImageElement>('.frame[data-index="0"] img')?.naturalWidth === 400);
      assert.equal(await first.locator('.frame[data-index="0"]').getAttribute('data-state'), 'ready');
    });
  } finally {
    await context.close();
  }
}
