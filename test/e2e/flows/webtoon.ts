import assert from 'node:assert/strict';
import { devices } from 'playwright';
import type { Context } from '../Context.ts';
import { EPISODE_COUNT, episodeUrl, SERIES_URL } from '../PretendWebtoon.ts';
import { addByLink, chooseReading, counter, dismissSheet, leaveReader, openReadingOptions, settle, waitCounter, waitShown } from './helpers.ts';

/** Reading WEBTOON: a series whose list of episodes comes in pages, and episodes read as one long column. */
export async function readWebtoon({ browser, stage, web, runner }: Context): Promise<void> {
  runner.heading('WEBTOON, on a phone');
  const phone = await browser.newContext({ ...devices['Pixel 7'], locale: 'en-US', colorScheme: 'dark', serviceWorkers: 'block' });
  const page = runner.watch(await phone.newPage());
  const { step, shot } = { step: runner.step.bind(runner), shot: runner.shot.bind(runner) };

  await step('a series link opens the series, whose episodes were collected from every page of the list', async () => {
    await page.goto(stage.appUrl);
    await page.getByRole('button', { name: 'Paste a link' }).click();
    await addByLink(page, SERIES_URL);
    await page.locator('.series-title').waitFor();
    assert.equal(await page.locator('.series-title').innerText(), 'Lantern Keeper');
    assert.equal(await page.locator('a.chapter').count(), EPISODE_COUNT);
    assert.equal(web.hitsFor('lantern-keeper/list').length, 3, 'three pages of the list were read');
    assert.match(await page.locator('.series-author').innerText(), /Mira Oduya/);
    const first = await page.locator('a.chapter .chapter-title').first().innerText();
    assert.match(first, /^Episode 12/, 'newest first');
    await page.waitForFunction(() => (document.querySelector<HTMLImageElement>('.series-cover img')?.naturalWidth ?? 0) > 0);
    assert.equal(web.hitsFor('thumbnail/cover.jpg')[0]?.referer, 'https://www.webtoons.com/');
    await settle(page);
    await shot(page, '20-webtoon-series');
  });

  await step('an episode opens as a column of images, fetched from their real address', async () => {
    await page.locator('a.chapter', { hasText: /^\s*1\s*Episode 1:/ }).click();
    await page.locator('.reader .frame').first().waitFor();
    assert.equal(await page.locator('.reader .part').first().locator('.frame').count(), 4);
    await page.waitForFunction(() => (document.querySelector<HTMLImageElement>('.reader .frame img')?.naturalWidth ?? 0) > 0);
    assert.equal(web.hitsFor('bg_transparency').length, 0, 'the blank placeholder is never fetched');
    assert.equal(web.hitsFor('ep1/1.jpg')[0]?.referer, 'https://www.webtoons.com/');
    assert.equal(await counter(page), '1 / 4');
    await settle(page);
    await shot(page, '21-webtoon-reader');
  });

  await step('a column reads downwards, and its slider runs left to right', async () => {
    assert.equal(await page.locator('.slider').getAttribute('dir'), 'ltr');
  });

  await step('a column reads downwards even when the user asks for right to left', async () => {
    await openReadingOptions(page);
    await chooseReading(page, 'Direction', 'Right to left');
    await dismissSheet(page);
    assert.equal(await page.locator('.reader .part').first().locator('.frame').count(), 4, 'still a column');
    assert.equal(await page.locator('.slider').getAttribute('dir'), 'ltr');
  });

  await step('the user can still ask for pages: the episode becomes a book, and the direction is theirs', async () => {
    await openReadingOptions(page);
    await chooseReading(page, 'Mode', 'Pages');
    await dismissSheet(page);
    await page.locator('.paged img.single').waitFor();
    await waitShown(page, 1);
    assert.equal(await page.locator('.reader .frame').count(), 0);
    assert.equal(await page.locator('.slider').getAttribute('dir'), 'rtl');
    await page.keyboard.press('ArrowLeft');
    await waitCounter(page, '2 / 4');
    await waitShown(page, 2);
  });

  await step('Auto gives both choices back to the site: a column again, on the same page', async () => {
    await openReadingOptions(page);
    await chooseReading(page, 'Mode', 'Auto');
    await chooseReading(page, 'Direction', 'Auto');
    await dismissSheet(page);
    await page.locator('.reader .frame').first().waitFor();
    assert.equal(await page.locator('.slider').getAttribute('dir'), 'ltr');
    await waitCounter(page, '2 / 4');
  });

  await step('at the end of an episode the next one follows in the column, and scrolling goes on into it', async () => {
    // To the end of the episode, not of the column: the next one may already be under it.
    await page.evaluate(() => document.querySelector('.reader .end-card')?.scrollIntoView({ block: 'center' }));
    await page.locator('.end-card[data-state="joined"]').first().waitFor();
    const divider = page.locator('.end-card').first();
    assert.match(await divider.locator('h2').innerText(), /You finished Episode 1/);
    assert.match(await divider.locator('.end-next').innerText(), /^Episode 2/);
    await divider.evaluate((card) => card.scrollIntoView({ block: 'center' }));
    await settle(page);
    await shot(page, '22-webtoon-end');
    await page.evaluate(() => document.querySelectorAll('.reader .part')[1]?.querySelector('.frame')?.scrollIntoView());
    await page.waitForFunction(() => document.querySelector('.reader-title strong')?.textContent?.startsWith('Episode 2') === true);
    await waitCounter(page, '1 / 4');
    assert.equal(decodeURIComponent(new URL(page.url()).hash.replace(/^#\/read\?u=/, '')), episodeUrl(2), 'the address follows the episode');
    assert.match(await page.title(), /^Episode 2/);
  });

  await step('the episode that was finished is ticked, and Back leaves the series, not the previous episode', async () => {
    await leaveReader(page);
    await page.locator('.series-title').waitFor();
    assert.match(page.url(), /#\/series/);
    const read = await page.locator('a.chapter[data-read="true"] .chapter-title').allInnerTexts();
    assert.equal(read.length, 1);
    assert.match(read[0] ?? '', /^Episode 1:/);
  });

  await step('WEBTOON is browsable and searchable from Discover', async () => {
    await page.locator('nav.dock').waitFor({ state: 'attached' });
    await page.goto(`${stage.appUrl}#/discover?src=webtoon`);
    await page.waitForFunction(() => document.querySelectorAll('.grid .card').length === 3);
    assert.equal(await page.locator('.chip[aria-pressed="true"]').innerText(), 'WEBTOON');
    assert.match(await page.locator('.section-title').innerText(), /WEBTOON · English/i, 'the catalogue says which language it is in');
    await page.locator('input[type=search]').fill('moons');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.grid .card').length === 1);
    assert.equal(await page.locator('.grid .card-title').innerText(), 'Paper Moons');
  });

  await step('with the app in French, WEBTOON opens its French catalogue, and says so', async () => {
    await page.goto(`${stage.appUrl}#/settings`);
    await page.getByRole('radiogroup', { name: 'Language', exact: true }).getByRole('radio', { name: 'Français' }).click();
    await page.goto(`${stage.appUrl}#/discover?src=webtoon`);
    await page.waitForFunction(() => document.querySelectorAll('.grid .card').length === 2);
    assert.deepEqual(await page.locator('.grid .card-title').allInnerTexts(), ['Lune de Papier', 'Sel et Tonnerre']);
    assert.match(await page.locator('.section-title').innerText(), /WEBTOON · Français/i);
    await settle(page);
    await shot(page, '23-webtoon-francais');
    await page.locator('input[type=search]').fill('lune');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.grid .card').length === 1);
    assert.equal(await page.locator('.grid .card-title').innerText(), 'Lune de Papier');
    assert.equal(web.hitsFor('/fr/search?keyword=lune').length, 1, 'the search went to the French catalogue');
  });

  await step('the language of the series can be chosen apart from the app\'s; a site with no French says it is English', async () => {
    await page.goto(`${stage.appUrl}#/settings`);
    await page.getByRole('radiogroup', { name: 'Langue des séries', exact: true }).getByRole('radio', { name: 'English' }).click();
    await page.goto(`${stage.appUrl}#/discover?src=webtoon`);
    await page.waitForFunction(() => document.querySelectorAll('.grid .card').length === 3);
    assert.match(await page.locator('.section-title').innerText(), /WEBTOON · English/i);

    await page.goto(`${stage.appUrl}#/settings`);
    await page.getByRole('radiogroup', { name: 'Langue des séries', exact: true }).getByRole('radio', { name: 'Français' }).click();
    await page.goto(`${stage.appUrl}#/discover?src=fanfox`);
    await page.waitForFunction(() => document.querySelectorAll('.grid .card').length === 3);
    assert.match(await page.locator('.section-title').innerText(), /FanFox · English/i, 'FanFox has no French: its own language is used, and shown');
  });

  await phone.close();
}
