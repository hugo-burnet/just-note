import assert from 'node:assert/strict';
import type { Context } from '../Context.ts';
import { FANFOX_SERIES } from '../PretendFanFox.ts';
import { SERIES_URL } from '../PretendWebtoon.ts';
import { addByLink, settle } from './helpers.ts';

/** The same app on a wide screen: it is a phone app, so it should stay a column in the middle, not stretch. */
export async function onDesktop({ browser, stage, runner }: Context): Promise<void> {
  runner.heading('On a desktop screen');
  const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', colorScheme: 'dark', serviceWorkers: 'block' });
  const page = runner.watch(await desktop.newPage());
  const { step, shot } = { step: runner.step.bind(runner), shot: runner.shot.bind(runner) };
  const centred = async (selector: string, widest: number): Promise<void> => {
    await settle(page); // a screen slides in: measured too soon it is still on its way
    const box = await page.locator(selector).first().boundingBox();
    assert.ok(box && box.width <= widest && Math.abs(box.x + box.width / 2 - 640) < 2, `${selector}: ${JSON.stringify(box)}`);
  };

  await step('the library is a grid in the middle of the screen', async () => {
    await page.goto(stage.appUrl);
    await page.getByRole('button', { name: 'Paste a link' }).click();
    await addByLink(page, FANFOX_SERIES);
    await page.locator('.series-title').waitFor();
    await page.goto(`${stage.appUrl}#/`);
    await page.getByRole('button', { name: 'Add a series' }).click();
    await addByLink(page, SERIES_URL);
    await page.locator('.series-title').waitFor();
    await page.goto(`${stage.appUrl}#/`);
    await page.locator('.grid .card').nth(1).waitFor();
    await centred('.view-library .wrap', 928);
    await shot(page, '40-desktop-library');
  });

  await step('a series keeps to its column', async () => {
    await page.locator('.grid .card').first().click();
    await page.locator('.series-title').waitFor();
    await centred('.view-series .wrap:last-child', 928);
    await shot(page, '41-desktop-series');
  });

  await step('the pages of a chapter stay a readable width, in the middle', async () => {
    await page.locator('a.chapter').last().click();
    await page.locator('.reader .frame img').first().waitFor();
    await centred('.strip', 832);
    await shot(page, '42-desktop-reader');
  });

  await step('the keyboard reads: space moves down, escape leaves', async () => {
    const top = (): Promise<number> => page.evaluate(() => document.querySelector('.stage')?.scrollTop ?? 0);
    await page.keyboard.press('Space');
    await page.waitForFunction(() => (document.querySelector('.stage')?.scrollTop ?? 0) > 100);
    assert.ok((await top()) > 100);
    await page.keyboard.press('Escape');
    await page.locator('.series-title').waitFor();
  });

  await step('a manga opens as pages: one, in the middle, that fits the screen', async () => {
    await page.goto(`${stage.appUrl}#/`);
    await page.locator('.card', { hasText: 'Moonlight Courier' }).click();
    await page.locator('.series-title').waitFor();
    await page.locator('a.chapter').last().click();
    await page.locator('.paged img.single').waitFor();
    await settle(page);
    const box = await page.locator('.paged img.single').boundingBox();
    assert.ok(box && box.height <= 800 && Math.abs(box.x + box.width / 2 - 640) < 2, JSON.stringify(box));
    await shot(page, '43-desktop-pages');
  });

  await desktop.close();
}
