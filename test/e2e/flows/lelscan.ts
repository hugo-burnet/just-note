import assert from 'node:assert/strict';
import { devices } from 'playwright';
import { chapterAddress, GARDEN, LELSCAN, SERIES, seriesAddress } from '../../pretend/lelscanPages.ts';
import type { Context } from '../Context.ts';
import { numberIn } from '../Pictures.ts';
import { addByLink, counter, leaveReader, settle, waitCounter, waitShown } from './helpers.ts';

/** Reading LelScan, French scans: a listing with no search of its own, and a chapter that is one page of HTML per image. */
export async function readLelScan({ browser, stage, web, runner }: Context): Promise<void> {
  runner.heading('LelScan, in French, on a phone');
  const phone = await browser.newContext({ ...devices['Pixel 7'], locale: 'fr-FR', colorScheme: 'dark', serviceWorkers: 'block' });
  const page = runner.watch(await phone.newPage());
  const { step, shot } = { step: runner.step.bind(runner), shot: runner.shot.bind(runner) };
  // The page being shown is the one whose file is named, and it is drawn.
  // The pretend site draws the picture its file names ("…/02.jpg" is picture 2, "00.jpg" picture 1): see Pictures.ts.
  const shown = (file: string): Promise<unknown> => waitShown(page, Math.max(1, numberIn(file)));

  await step('Explorer lists the series of the site with their covers, and says the catalogue is in French', async () => {
    await page.goto(`${stage.appUrl}#/discover?src=lelscan`);
    await page.waitForFunction(() => document.querySelectorAll('.grid .card').length === 3);
    assert.deepEqual(await page.locator('.grid .card-title').allInnerTexts(), SERIES.map((series) => series.title));
    assert.match(await page.locator('.section-title').innerText(), /LelScan · Français/i);
    await page.waitForFunction(() => (document.querySelector<HTMLImageElement>('.grid .card img')?.naturalWidth ?? 0) > 0);
    assert.equal(web.hitsFor('thumb_cover.jpg')[0]?.referer, `${LELSCAN}/`, 'the covers are fetched with the site as Referer');
    await settle(page);
    await shot(page, '60-lelscan-explorer');
  });

  await step('a search is answered from that list, accents or not, and never sent to the site', async () => {
    await page.locator('input[type=search]').fill('marees');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.grid .card').length === 1);
    assert.equal(await page.locator('.grid .card-title').innerText(), 'Lanterne des Marées');
    assert.equal(web.hitsFor('lelscans.net/?q').length, 0);
  });

  await step('a series opens with its chapters, newest first, a half chapter in its place', async () => {
    await page.locator('.grid .card').first().click();
    await page.locator('.series-title').waitFor();
    assert.equal(await page.locator('.series-title').innerText(), 'Lanterne des Marées');
    assert.deepEqual(await page.locator('a.chapter .chapter-title').allInnerTexts(), ['Chapitre 3', 'Chapitre 2.5', 'Chapitre 2', 'Chapitre 1']);
    await page.waitForFunction(() => (document.querySelector<HTMLImageElement>('.series-cover img')?.naturalWidth ?? 0) > 0);
    await settle(page);
    await shot(page, '61-lelscan-series');
  });

  await step('a chapter opens as turned pages, right to left, each page with its own image', async () => {
    await page.locator('a.chapter', { hasText: 'Chapitre 1' }).click();
    await page.locator('.paged img.single').waitFor();
    await shown('/1/00.jpg');
    assert.equal(await counter(page), '1 / 4');
    for (const [n, file] of [[2, '/1/01.jpg'], [3, '/1/02.jpg'], [4, '/1/03.jpg']] as const) {
      await page.keyboard.press('ArrowLeft');
      await waitCounter(page, `${n} / 4`);
      await shown(file);
    }
    await settle(page);
    await shot(page, '62-lelscan-reader');
  });

  await step('every page of the chapter was read once, the first one only once, and the images asked for with the Referer', async () => {
    const read = web.hits.map((hit) => new URL(hit.url).pathname).filter((path) => /^\/scan-lanterne-des-marees\/1(\/\d+)?$/.test(path));
    assert.deepEqual(read.sort(), ['/scan-lanterne-des-marees/1', '/scan-lanterne-des-marees/1/2', '/scan-lanterne-des-marees/1/3', '/scan-lanterne-des-marees/1/4']);
    const images = web.hitsFor('/mangas/lanterne-des-marees/1/');
    assert.ok(images.length >= 4 && images.every((hit) => hit.referer === `${LELSCAN}/`), JSON.stringify(images));
  });

  await step('past the last page the next chapter opens', async () => {
    await page.keyboard.press('ArrowLeft');
    await page.waitForFunction(() => document.querySelector('.reader-title strong')?.textContent === 'Chapitre 2');
    assert.equal(await counter(page), '1 / 3');
    await leaveReader(page, 'Retour');
    await page.locator('.series-title').waitFor();
    assert.match(await page.locator('.view-series .btn-primary').innerText(), /Reprendre · Chapitre 2/);
  });

  await step('a pasted link opens the right thing, whatever its spelling, and the sheet knows the site', async () => {
    await page.goto(`${stage.appUrl}#/`);
    await page.getByRole('button', { name: 'Ajouter une série' }).click();
    await page.getByText(/Compatible avec .*LelScan/).waitFor();
    await addByLink(page, seriesAddress(GARDEN));
    await page.locator('.series-title').waitFor();
    assert.equal(await page.locator('.series-title').innerText(), "Jardin d'Horloge");
    assert.equal(await page.locator('a.chapter').count(), 2);

    await page.goto(`${stage.appUrl}#/`);
    await page.getByRole('button', { name: 'Ajouter une série' }).click();
    await addByLink(page, chapterAddress(GARDEN, '2', 2));
    await waitCounter(page, '1 / 2');
    await shown('/2/1.jpg');
  });

  await phone.close();
}
