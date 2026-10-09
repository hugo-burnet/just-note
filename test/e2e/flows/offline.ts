import assert from 'node:assert/strict';
import { devices } from 'playwright';
import type { Context } from '../Context.ts';
import { FANFOX_SERIES } from '../PretendFanFox.ts';
import type {} from '../TestApp.ts';
import { addByLink, leaveReader, revealChrome, settle, waitCounter, waitShown } from './helpers.ts';

/** The installed app with its network cut: what was read, and what was downloaded, stays readable. */
export async function offline({ browser, stage, runner }: Context): Promise<void> {
  runner.heading('Offline: what was read, and what was downloaded');
  const installed = await browser.newContext({ ...devices['Pixel 7'], locale: 'en-US', colorScheme: 'dark' });
  const page = runner.watch(await installed.newPage());
  const { step, shot } = { step: runner.step.bind(runner), shot: runner.shot.bind(runner) };
  const cached = (name: string): Promise<string[]> =>
    page.evaluate(async (cache) => (await (await caches.open(cache)).keys()).map((request) => decodeURIComponent(request.url)), name);
  // FanFox opens as turned pages, right to left: the left arrow goes forward. Each page has to be drawn before the next is asked for.
  const readPages = async (count: number): Promise<void> => {
    await page.locator('.paged img.single').waitFor();
    for (let n = 1; n <= count; n++) {
      await waitShown(page, n);
      if (n < count) await page.keyboard.press('ArrowLeft');
    }
  };

  await step('read a chapter, so that it is kept', async () => {
    await page.goto(stage.appUrl);
    await page.getByRole('button', { name: 'Paste a link' }).click();
    await addByLink(page, FANFOX_SERIES);
    await page.locator('a.chapter', { hasText: 'Ch.001' }).click();
    await readPages(3);
    await leaveReader(page);
    await page.locator('.series-title').waitFor();
  });

  await step('its pictures were kept, under the addresses of the site', async () => {
    await page.waitForFunction(async () => (await (await caches.open('jr-img')).keys()).length >= 3);
    const kept = await cached('jr-img');
    assert.ok(kept.filter((url) => url.includes('/c001/')).length >= 3, kept.join('\n'));
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

  await step('a chapter never read is downloaded with its button, and its download says so', async () => {
    await page.getByRole('button', { name: /^Download Ch\.004/ }).click();
    await page.getByRole('button', { name: /^Ch\.004.*: downloaded, available offline$/ }).waitFor();
    const saved = await cached('jr-saved');
    assert.equal(saved.filter((url) => url.includes('/c004/') && url.includes('.png')).length, 5, saved.join('\n'));
    assert.ok(saved.some((url) => url.includes('saved/chapter:')), 'its list of pictures is kept with them');
    await page.locator('.offline-status', { hasText: '1 chapter offline' }).waitFor();
    await settle(page);
    await shot(page, '48-series-downloaded');
  });

  await step('the shelf marks a series with downloads, and one with chapters out since it was opened', async () => {
    // Two chapters came out since the series was last opened: as if it had had three when it was.
    await page.evaluate((url) => {
      const key = `jr:entry:${url}`;
      const entry = JSON.parse(localStorage.getItem(key) ?? '{}') as { chapterCount: number };
      localStorage.setItem(key, JSON.stringify({ ...entry, seenCount: entry.chapterCount - 2 }));
    }, FANFOX_SERIES);
    await page.goto(`${stage.appUrl}#/library`);
    await page.locator('.card .cover-new', { hasText: '2 new' }).waitFor();
    await page.locator('.card .cover-offline').waitFor();
    await settle(page);
    await shot(page, '49-library-new-and-offline');
    // Opening the series is seeing what is new.
    await page.locator('.card-link').first().click();
    await page.locator('.series-title').waitFor();
    await page.goBack();
    await page.locator('.card .cover-offline').waitFor();
    assert.equal(await page.locator('.card .cover-new').count(), 0);
    await page.locator('.card-link').first().click();
    await page.locator('.series-title').waitFor();
  });

  await step('offline: the app, the series and the chapter you read still open', async () => {
    await page.evaluate(() => (window.e2e.offline = true));
    await page.reload();
    await page.locator('.series-title').waitFor();
    assert.equal(await page.locator('a.chapter').count(), 5);
    await page.locator('a.chapter', { hasText: 'Ch.001' }).click();
    await readPages(3);
    await settle(page);
    await revealChrome(page);
    await leaveReader(page);
    await page.locator('.series-title').waitFor();
  });

  await step('offline: the chapter downloaded but never read opens, every page of it', async () => {
    await page.locator('a.chapter', { hasText: 'Ch.004' }).click();
    await readPages(5);
    await leaveReader(page);
    await page.locator('.series-title').waitFor();
  });

  await step('offline: a chapter that was never read says so instead of hanging', async () => {
    // Not Ch.002: reading Ch.001 to its end read it ahead.
    await page.locator('a.chapter', { hasText: /Ch\.003(?!\.5)/ }).click();
    await page.locator('.error-panel h2', { hasText: /offline|Couldn't reach/i }).waitFor();
    await settle(page);
    await shot(page, '50-offline');
    await page.evaluate(() => (window.e2e.offline = false));
  });

  await installed.close();
}
