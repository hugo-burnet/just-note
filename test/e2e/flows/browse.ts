import assert from 'node:assert/strict';
import { devices } from 'playwright';
import type { Context } from '../Context.ts';
import { FANFOX_SERIES } from '../PretendFanFox.ts';
import { addByLink, encoded, settle } from './helpers.ts';

/** Finding things, failing well, and the settings: the parts of the app around reading. */
export async function browseAndSettings({ browser, stage, runner }: Context): Promise<void> {
  runner.heading('Discover, errors and settings, on a phone');
  const phone = await browser.newContext({ ...devices['Pixel 7'], locale: 'en-US', colorScheme: 'dark', serviceWorkers: 'block' });
  const page = runner.watch(await phone.newPage());
  const { step, shot } = { step: runner.step.bind(runner), shot: runner.shot.bind(runner) };
  const dock = (name: string) => page.locator(`nav.dock a[aria-label="${name}"]`);

  await step('a proxy address saved by a version that had one is forgotten, and the rest stays', async () => {
    await page.goto(stage.appUrl);
    await page.evaluate(() => localStorage.setItem('jr:settings', JSON.stringify({ proxyBase: 'https://proxy.example', theme: 'dark' })));
    await page.goto(`${stage.appUrl}#/discover`);
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.grid .card').length === 3);
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
    assert.equal(await page.locator('input[aria-label="Proxy address"]').count(), 0);
  });

  await step('Discover lists what the source shows; searching narrows it down', async () => {
    await page.goto(stage.appUrl);
    await dock('Discover').click();
    await page.waitForFunction(() => location.hash.startsWith('#/discover') && document.querySelectorAll('.grid .card').length === 3);
    assert.equal(await page.locator('nav.dock').getAttribute('data-visible'), 'true');
    await settle(page);
    await shot(page, '30-discover');
    await page.locator('input[type=search]').fill('moon');
    await page.keyboard.press('Enter');
    await page.locator('.section-title', { hasText: 'Results for “moon”' }).waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.grid .card').length === 1);
    await settle(page);
    await shot(page, '31-search');
  });

  await step('Discover filters its results by genre, read from the pages of the series when asked for', async () => {
    await page.goto(`${stage.appUrl}#/discover`);
    await page.waitForFunction(() => document.querySelectorAll('.grid .card').length === 3);
    const visible = (): Promise<number> => page.locator('.grid .card:not([hidden])').count();
    await page.getByRole('button', { name: 'Filter by genre' }).click();
    // Only Moonlight Courier has a page on the pretend site: its genres are the only ones known.
    await page.locator('.genre-chip', { hasText: 'Adventure' }).waitFor();
    await page.locator('.genre-chip', { hasText: 'Adventure' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.grid .card:not([hidden])').length === 1);
    assert.equal(await page.locator('.grid .card:not([hidden]) .card-title').innerText(), 'Moonlight Courier');
    await settle(page);
    await shot(page, '30b-discover-genres');
    // Left out: it is hidden, and the series whose genres could not be read stay.
    await page.locator('.genre-chip', { hasText: 'Adventure' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.grid .card:not([hidden])').length === 2);
    // Remembered: the results are filtered again at once when Discover opens again.
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.grid .card').length === 3 && document.querySelectorAll('.grid .card:not([hidden])').length === 2);
    await page.getByRole('button', { name: 'Show all' }).click();
    assert.equal(await visible(), 3);
    assert.equal(await page.getByRole('button', { name: 'Filter by genre' }).isVisible(), false, 'the genres are known: no need to ask again');
  });

  await step('each site of Discover has its own genres: one kept on a site does not hide the results of another', async () => {
    await page.locator('.genre-chip', { hasText: 'Adventure' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.grid .card:not([hidden])').length === 1);
    await page.locator('.chip-button', { hasText: 'WEBTOON' }).click();
    await page.waitForFunction(() => location.hash.includes('src=webtoon') && document.querySelectorAll('.grid .card').length > 0);
    assert.equal(await page.locator('.grid .card[hidden]').count(), 0);
    assert.equal(await page.getByRole('button', { name: 'Show all' }).count(), 0);
    // LelScan's pages say no genres: nothing to filter by.
    await page.locator('.chip-button', { hasText: 'LelScan' }).click();
    await page.waitForFunction(() => location.hash.includes('src=lelscan') && document.querySelectorAll('.grid .card').length > 0);
    assert.equal(await page.getByRole('button', { name: 'Filter by genre' }).count(), 0);
    // Back on FanFox, its genre is still kept.
    await page.locator('.chip-button', { hasText: 'FanFox' }).click();
    await page.waitForFunction(() => location.hash.includes('src=fanfox') && document.querySelectorAll('.grid .card:not([hidden])').length === 1);
    await page.getByRole('button', { name: 'Show all' }).click();
  });

  await step('a result opens its series, and Back returns to the results', async () => {
    await page.locator('input[type=search]').fill('moon');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('.grid .card').length === 1);
    await page.locator('.grid .card').first().click();
    await page.locator('.series-title').waitFor();
    await page.goBack();
    await page.locator('.section-title', { hasText: 'Results for “moon”' }).waitFor();
  });

  await step('a link pasted in the search field is opened, not searched', async () => {
    await page.locator('input[type=search]').fill(FANFOX_SERIES);
    await page.keyboard.press('Enter');
    await page.locator('.series-title').waitFor();
  });

  await step('a refusal from the site shows a clear error with copyable details', async () => {
    await page.goto(`${stage.appUrl}#/series?u=${encoded('https://fanfox.net/manga/forbidden_tale/')}`);
    await page.locator('.error-panel').waitFor();
    assert.match(await page.locator('.error-panel h2').innerText(), /refused/);
    assert.match((await page.locator('.error-panel pre').textContent()) ?? '', /"upstreamStatus": 403/);
    assert.equal(await page.getByRole('button', { name: 'Retry' }).count(), 1);
    await settle(page);
    await shot(page, '32-error');
  });

  await step('settings: switching language rewrites the interface, and back', async () => {
    await page.goto(`${stage.appUrl}#/settings`);
    await page.getByRole('radiogroup', { name: 'Language', exact: true }).getByRole('radio', { name: 'Français' }).click();
    await page.getByText('Langue', { exact: true }).waitFor();
    assert.equal(await dock('Réglages').count(), 1, 'the dock follows the language');
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'fr');
    await settle(page);
    await shot(page, '33-settings-fr');
    await page.getByRole('radiogroup', { name: 'Langue', exact: true }).getByRole('radio', { name: 'Auto' }).click();
    await page.getByText('Language', { exact: true }).waitFor();
  });

  await step('settings: reading starts on Auto, a choice is kept, and an older version\'s yes or no is carried over', async () => {
    const chosen = (group: 'Mode' | 'Direction', label: string) =>
      page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: label, exact: true, checked: true });
    const pick = (group: 'Mode' | 'Direction', label: string) =>
      page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: label, exact: true }).click();
    await chosen('Mode', 'Auto').waitFor();
    await chosen('Direction', 'Auto').waitFor();
    await pick('Mode', 'Pages');
    await page.reload();
    await chosen('Mode', 'Pages').waitFor();

    // Before the direction could be left to the site it was saved as a yes or no.
    await page.evaluate(() => localStorage.setItem('jr:settings', JSON.stringify({ rtl: true, mode: 'scroll' })));
    await page.reload();
    await chosen('Mode', 'Scroll').waitFor();
    await chosen('Direction', 'Right to left').waitFor();
    await settle(page);
    await shot(page, '38-settings-reading');

    await pick('Mode', 'Auto');
    await pick('Direction', 'Auto');
    await page.reload();
    await chosen('Mode', 'Auto').waitFor();
    await chosen('Direction', 'Auto').waitFor();
  });

  await step('the light theme applies, and is kept after a reload', async () => {
    await page.getByRole('radio', { name: 'Light' }).click();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'light');
    assert.equal(await page.locator('meta[name=theme-color]').getAttribute('content'), '#f8f4ec');
    await settle(page);
    await shot(page, '34-settings-light');
    await page.goto(stage.appUrl);
    await page.reload();
    await page.locator('.view-library').waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'light');
    await settle(page);
    await shot(page, '35-library-light');
  });

  await step('the library follows what was opened, in the light theme too', async () => {
    assert.equal(await page.locator('.card-title').first().innerText(), 'Moonlight Courier');
    await page.getByRole('button', { name: 'Add a series' }).click();
    await addByLink(page, FANFOX_SERIES);
    await page.locator('.series-title').waitFor();
    await settle(page);
    await shot(page, '36-series-light');
  });

  await step('the reader stays dark in the light theme', async () => {
    await page.locator('a.chapter', { hasText: 'Ch.001' }).click();
    await page.locator('.paged img.single').waitFor();
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.reader') as Element).colorScheme), 'dark');
    assert.equal(await page.locator('meta[name=theme-color]').getAttribute('content'), '#0b0c10');
    await settle(page);
    await shot(page, '37-reader-in-light-theme');
  });

  await step('the shelf is filtered by genre: a tap keeps one, a second leaves it out, and the choice is kept', async () => {
    // Three more series, as the library keeps them once their pages were read (just now: nothing to check).
    await page.evaluate(() => {
      const shelf: Array<[string, string[]]> = [['Ember Road', ['Action', 'Romance']], ['Quiet Harbour', ['Romance', 'Slice of Life']], ['Iron Sky', ['Action', 'Sci-Fi']]];
      shelf.forEach(([title, genres], index) => {
        const url = `https://fanfox.net/manga/${title.toLowerCase().replace(/ /g, '_')}/`;
        localStorage.setItem(`jr:entry:${url}`, JSON.stringify({ url, title, cover: null, genres, chapterCount: 3, seenCount: 3, checkedAt: Date.now(), addedAt: index, updatedAt: index, generation: 'initial' }));
      });
    });
    await page.goto(`${stage.appUrl}#/library`);
    await page.reload();
    const titles = (): Promise<string[]> => page.locator('.shelf .card-title').allInnerTexts();
    await page.locator('.genre-bar').waitFor();
    await page.locator('.genre-chip', { hasText: 'Action' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.shelf .card').length === 2);
    assert.deepEqual((await titles()).sort(), ['Ember Road', 'Iron Sky']);
    await page.locator('.genre-chip', { hasText: 'Romance' }).click();
    assert.deepEqual(await titles(), ['Ember Road']);
    await page.locator('.genre-chip', { hasText: 'Romance' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.shelf .card').length === 1);
    assert.deepEqual(await titles(), ['Iron Sky']);
    assert.equal(await page.locator('.genre-chip[data-choice="exclude"]').innerText().then((text) => text.includes('Romance')), true);
    await settle(page);
    await shot(page, '39-library-genres');
    // Kept from one start to the next, until "Show all".
    await page.reload();
    await page.waitForFunction(() => document.querySelectorAll('.shelf .card').length === 1);
    await page.getByRole('button', { name: 'Show all' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.shelf .card').length === 4);
  });

  await step('tapping a genre at the end of the shelf\'s row leaves the row where it was, and the genre focused', async () => {
    await page.evaluate(() => {
      const genres = ['Mystery', 'Horror', 'Comedy', 'Drama', 'Fantasy', 'Historical', 'Isekai', 'Martial Arts', 'Mecha', 'Sports', 'Thriller'];
      const url = 'https://fanfox.net/manga/many_genres/';
      localStorage.setItem(`jr:entry:${url}`, JSON.stringify({ url, title: 'Many Genres', cover: null, genres, chapterCount: 3, seenCount: 3, checkedAt: Date.now(), addedAt: 9, updatedAt: 9, generation: 'initial' }));
    });
    await page.reload();
    await page.locator('.genre-bar').waitFor();
    const scrolled = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>('.genre-bar')!;
      bar.scrollLeft = bar.scrollWidth;
      return bar.scrollLeft;
    });
    assert.ok(scrolled > 0, 'the row is wider than the phone');
    await page.locator('.genre-chip', { hasText: 'Thriller' }).click();
    await page.waitForFunction(() => document.querySelectorAll('.shelf .card').length === 1);
    // The genre tapped is still in sight (the row was scrolled back to its start before).
    const inSight = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>('.genre-bar')!.getBoundingClientRect();
      const chip = [...document.querySelectorAll('.genre-chip')].find((one) => one.textContent?.includes('Thriller'))!.getBoundingClientRect();
      return chip.left >= bar.left && chip.right <= bar.right;
    });
    assert.equal(inSight, true);
    assert.equal(await page.evaluate(() => document.activeElement?.textContent?.includes('Thriller')), true);
    await page.getByRole('button', { name: 'Show all' }).click();
  });

  await step('the erase button asks first, then empties the library', async () => {
    await page.goto(`${stage.appUrl}#/settings`);
    await page.getByRole('button', { name: 'Erase library and progress' }).click();
    await page.locator('.sheet').getByRole('button', { name: 'Cancel' }).click();
    await page.locator('.sheet-host').waitFor({ state: 'detached' });
    await page.getByRole('button', { name: 'Erase library and progress' }).click();
    await page.locator('.sheet').getByRole('button', { name: 'Erase library and progress' }).click();
    await page.locator('.toast', { hasText: 'Library erased' }).waitFor();
    await dock('Library').click();
    await page.locator('.empty').waitFor();
  });

  await phone.close();
}
