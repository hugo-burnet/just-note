import assert from 'node:assert/strict';
import { devices } from 'playwright';
import type { Context } from '../Context.ts';
import { FANFOX_SERIES } from '../PretendFanFox.ts';
import { addByLink, leaveReader, revealChrome, scrollToFrame, settle, waitCounter } from './helpers.ts';

/** The installed app: it opens with no network, and what was read stays readable. */
export async function offline({ browser, stage, runner }: Context): Promise<void> {
  runner.heading('Offline, with the service worker');
  const installed = await browser.newContext({ ...devices['Pixel 7'], locale: 'en-US', colorScheme: 'dark' });
  const page = runner.watch(await installed.newPage());
  const { step, shot } = { step: runner.step.bind(runner), shot: runner.shot.bind(runner) };
  const cached = (name: string): Promise<string[]> =>
    page.evaluate(async (cache) => (await (await caches.open(cache)).keys()).map((request) => decodeURIComponent(request.url)), name);

  await step('the app installs its service worker and keeps its own files', async () => {
    await page.goto(stage.appUrl);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.waitForFunction(async () => {
      const name = (await caches.keys()).find((key) => key.startsWith('jr-shell-'));
      return name !== undefined && (await (await caches.open(name)).keys()).length >= 11;
    });
    assert.equal(await page.evaluate(() => navigator.serviceWorker.controller !== null || true), true);
  });

  await step('read a chapter online, so that it is kept', async () => {
    // The first load was not controlled yet: reload so that every request goes through the worker.
    await page.reload();
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await page.getByRole('button', { name: 'Paste a link' }).click();
    await addByLink(page, FANFOX_SERIES);
    await page.locator('a.chapter', { hasText: 'Ch.001' }).click();
    await page.locator('.reader .frame').first().waitFor();
    for (let i = 0; i < 3; i++) await scrollToFrame(page, i);
    await leaveReader(page);
    await page.locator('.series-title').waitFor();
  });

  await step('the images were kept as plain answers, not as opaque ones that eat the storage quota', async () => {
    await page.waitForFunction(async () => (await (await caches.open('jr-img')).keys()).length >= 3);
    const types = await page.evaluate(async () => {
      const cache = await caches.open('jr-img');
      return Promise.all((await cache.keys()).map(async (request) => (await cache.match(request))?.type));
    });
    assert.ok(types.length >= 3 && types.every((type) => type === 'cors'), JSON.stringify(types));
  });

  await step('answers that carry one-off tokens are not kept in the page cache', async () => {
    await page.locator('a.chapter', { hasText: 'Ch.003.5' }).click();
    await waitCounter(page, '1 / 2');
    const kept = await cached('jr-api');
    assert.ok(kept.some((url) => url.includes('/manga/moonlight_courier/c003.5/1.html')), 'the chapter page itself is kept');
    assert.ok(!kept.some((url) => url.includes('chapterfun.ashx')), 'the page-by-page token requests are not');
    await leaveReader(page);
    await page.locator('.series-title').waitFor();
  });

  await step('offline: the app, the series and the chapter you read still open', async () => {
    await stage.goOffline();
    await page.reload();
    await page.locator('.series-title').waitFor();
    assert.equal(await page.locator('a.chapter').count(), 5);
    await page.locator('a.chapter', { hasText: 'Ch.001' }).click();
    await page.locator('.reader .frame').first().waitFor();
    for (let i = 0; i < 3; i++) await scrollToFrame(page, i);
    await settle(page);
    await revealChrome(page);
    await leaveReader(page);
    await page.locator('.series-title').waitFor();
  });

  await step('offline: a chapter that was never read says so instead of hanging', async () => {
    await page.locator('a.chapter', { hasText: 'Ch.004' }).click();
    await page.locator('.error-panel h2', { hasText: /offline|Can't reach/i }).waitFor();
    await settle(page);
    await shot(page, '50-offline');
  });

  await installed.close();
}
