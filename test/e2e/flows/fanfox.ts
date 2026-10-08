import assert from 'node:assert/strict';
import { devices } from 'playwright';
import type { Context } from '../Context.ts';
import { FANFOX_SERIES, fanfoxChapter } from '../PretendFanFox.ts';
import { addByLink, chooseReading, counter, dismissSheet, leaveReader, openReadingOptions, revealChrome, scrollToFrame, settle, waitCounter, waitShown } from './helpers.ts';

/** Reading a series of FanFox on a phone: from the empty shelf to a finished chapter. */
export async function readFanFox({ browser, stage, web, runner }: Context): Promise<void> {
  runner.heading('FanFox, on a phone');
  const phone = await browser.newContext({ ...devices['Pixel 7'], locale: 'en-US', colorScheme: 'dark', serviceWorkers: 'block' });
  const page = runner.watch(await phone.newPage());
  const { step, shot } = { step: runner.step.bind(runner), shot: runner.shot.bind(runner) };

  await step('the shelf starts empty, and the dock is there', async () => {
    await page.goto(stage.appUrl);
    await page.locator('.empty').waitFor();
    assert.equal(await page.title(), 'Just Read');
    assert.match(await page.locator('.empty').innerText(), /Your shelf is empty/);
    assert.equal(await page.locator('nav.dock').getAttribute('data-visible'), 'true');
    await settle(page);
    await shot(page, '01-library-empty');
  });

  await step('"Paste a link" opens the sheet; a link opens the series', async () => {
    await page.getByRole('button', { name: 'Paste a link' }).click();
    await page.locator('input[name=link]').waitFor();
    await settle(page);
    await shot(page, '02-add-sheet');
    await addByLink(page, FANFOX_SERIES);
    await page.locator('.series-title').waitFor();
    assert.equal(await page.locator('.series-title').innerText(), 'Moonlight Courier');
    assert.equal(await page.locator('a.chapter').count(), 5);
    assert.equal(await page.locator('nav.dock').getAttribute('data-visible'), 'false');
  });

  await step('chapters come newest first; the cover is fetched with the site as Referer', async () => {
    const titles = await page.locator('a.chapter .chapter-title').allInnerTexts();
    assert.deepEqual(titles.slice(0, 2), ['Ch.004 The Last Lantern', 'Ch.003.5 Extra']);
    await page.waitForFunction(() => (document.querySelector<HTMLImageElement>('.series-cover img')?.naturalWidth ?? 0) > 0);
    assert.equal(web.hitsFor('cover.jpg')[0]?.referer, 'https://fanfox.net/');
    assert.match(await page.locator('.view-series .btn-primary').innerText(), /Start reading/);
    await settle(page);
    await shot(page, '03-series');
  });

  await step('a chapter opens as pages, the way a manga is read; its images load', async () => {
    await page.locator('a.chapter', { hasText: 'Ch.002' }).click();
    await page.locator('.paged img.single').waitFor();
    await waitShown(page, 1);
    assert.equal(await page.locator('.reader .frame').count(), 0, 'not a column');
    assert.equal(await counter(page), '1 / 4');
    assert.equal(await page.locator('nav.dock').getAttribute('data-visible'), 'false');
    await settle(page);
    await shot(page, '04-reader-pages');
  });

  await step('pages run from right to left: the left arrow goes forward', async () => {
    await page.keyboard.press('ArrowLeft');
    await waitCounter(page, '2 / 4');
    await page.keyboard.press('ArrowLeft');
    await waitCounter(page, '3 / 4');
    await waitShown(page, 3);
  });

  await step('the controls leave by themselves, and come back with a tap in the middle', async () => {
    await page.waitForSelector('.chrome[data-visible="false"]', { state: 'attached' });
    await revealChrome(page);
    await settle(page);
    await shot(page, '05-reader-controls');
  });

  await step('leaving keeps the place: the series offers to continue', async () => {
    await leaveReader(page);
    await page.locator('.series-title').waitFor();
    assert.match(await page.locator('.view-series .btn-primary').innerText(), /Continue · Ch\.002/);
    assert.equal(await page.locator('a.chapter[aria-current="true"]').count(), 1);
  });

  await step('the library remembers the series and the position', async () => {
    await page.goto(`${stage.appUrl}#/`);
    await page.reload();
    await page.locator('.card-title').first().waitFor();
    assert.equal(await page.locator('.card-title').first().innerText(), 'Moonlight Courier');
    assert.match(await page.locator('.continue').innerText(), /continue reading/i);
    assert.match(await page.locator('.continue').innerText(), /Ch\.002 · Page 3/);
    await settle(page);
    await shot(page, '06-library');
  });

  await step('"Continue reading" restores the page; Back returns where we came from', async () => {
    await page.locator('.continue').click();
    await waitCounter(page, '3 / 4');
    await leaveReader(page);
    await page.locator('.view-library').waitFor();
  });

  await step('the options start on Auto; Scroll makes a column of the chapter, on the page being read', async () => {
    await page.locator('.card').first().click();
    await page.locator('a.chapter', { hasText: 'Ch.002' }).click();
    await waitCounter(page, '3 / 4');
    await openReadingOptions(page);
    for (const group of ['Mode', 'Direction'] as const) {
      await page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: 'Auto', exact: true, checked: true }).waitFor();
    }
    await settle(page);
    await shot(page, '07-reader-options');
    await chooseReading(page, 'Mode', 'Scroll');
    await dismissSheet(page);
    await page.locator('.reader .frame').first().waitFor();
    assert.equal(await page.locator('.reader .frame').count(), 4);
    await waitCounter(page, '3 / 4');
    await scrollToFrame(page, 2);
    await settle(page);
    await shot(page, '08-reader-scroll');
  });

  await step('in the column the counter follows the scroll', async () => {
    await scrollToFrame(page, 1);
    await waitCounter(page, '2 / 4');
  });

  await step('Auto gives the choice back to the site: pages again, on the page that was being read', async () => {
    await openReadingOptions(page);
    await chooseReading(page, 'Mode', 'Auto');
    await dismissSheet(page);
    await page.locator('.paged img.single').waitFor();
    assert.equal(await page.locator('.reader .frame').count(), 0);
    await waitCounter(page, '2 / 4');
    await waitShown(page, 2);
    await shot(page, '09-reader-pages-again');
  });

  await step('tapping an edge turns the page (the left one is forward when reading right to left)', async () => {
    await page.touchscreen.tap(20, 400);
    await waitCounter(page, '3 / 4');
    await page.touchscreen.tap(20, 400);
    await waitCounter(page, '4 / 4');
    await page.touchscreen.tap(390, 400);
    await waitCounter(page, '3 / 4');
    await page.touchscreen.tap(20, 400);
    await waitCounter(page, '4 / 4');
  });

  await step('past the last page the next chapter opens, without growing the history', async () => {
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.querySelector('.reader-title strong')?.textContent === 'Vol.01 Ch.003');
    assert.equal(await counter(page), '1 / 3');
  });

  await step('Left to right turns the keys around, whatever the site', async () => {
    await openReadingOptions(page);
    await chooseReading(page, 'Direction', 'Left to right');
    await dismissSheet(page);
    await page.keyboard.press('ArrowRight');
    await waitCounter(page, '2 / 3');
    await page.keyboard.press('ArrowLeft');
    await waitCounter(page, '1 / 3');
    await leaveReader(page);
    await page.locator('.series-title').waitFor();
    assert.match(page.url(), /#\/series/);
  });

  await step('the chapter that was finished is ticked', async () => {
    const read = await page.locator('a.chapter[data-read="true"] .chapter-title').allInnerTexts();
    assert.deepEqual(read, ['Ch.002']);
  });

  await step('a link shared to the app opens straight away (and the older page layout works)', async () => {
    const shared = `Great read ${fanfoxChapter('c003.5')} enjoy`;
    await page.goto(`${stage.appUrl}?text=${encodeURIComponent(shared)}&title=Moonlight`);
    await waitCounter(page, '1 / 2');
    assert.match(page.url(), /#\/read\?u=/);
    assert.doesNotMatch(page.url(), /\?text=/);
    await page.locator('.paged img.single').waitFor();
    const asked = web.hitsFor('chapterfun.ashx');
    assert.equal(asked.length, 2);
    assert.ok(asked.every((hit) => hit.referer === fanfoxChapter('c003.5')), 'the chapter page is the Referer of chapterfun.ashx');
  });

  await step('an unsupported link is refused politely', async () => {
    await page.goto(`${stage.appUrl}#/`);
    await page.reload();
    await page.getByRole('button', { name: 'Add a series' }).click();
    await addByLink(page, 'https://example.com/manga/x/');
    await page.locator('.toast', { hasText: "isn't supported" }).waitFor();
    assert.doesNotMatch(page.url(), /#\/(series|read)/);
  });

  await phone.close();
}
