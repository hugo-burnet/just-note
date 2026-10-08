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

  await step('a result opens its series, and Back returns to the results', async () => {
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
    await page.getByRole('radio', { name: 'Français' }).click();
    await page.getByText('Langue', { exact: true }).waitFor();
    assert.equal(await dock('Réglages').count(), 1, 'the dock follows the language');
    assert.equal(await page.evaluate(() => document.documentElement.lang), 'fr');
    await settle(page);
    await shot(page, '33-settings-fr');
    await page.locator('.row', { hasText: 'Langue' }).getByRole('radio', { name: 'Auto' }).click();
    await page.getByText('Language', { exact: true }).waitFor();
  });

  await step('the proxy answers the connection test', async () => {
    await page.getByRole('button', { name: 'Test connection' }).click();
    await page.getByText('Connected', { exact: true }).waitFor();
  });

  await step('a proxy that does not answer is reported', async () => {
    const input = page.locator('input[aria-label="Proxy address"]');
    const original = await input.inputValue();
    await input.fill('http://127.0.0.1:1');
    await page.getByRole('button', { name: 'Test connection' }).click();
    await page.getByText("Can't reach the proxy").waitFor();
    await input.fill(original);
    await page.getByRole('button', { name: 'Test connection' }).click();
    await page.getByText('Connected', { exact: true }).waitFor();
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
    await page.locator('.reader .frame').first().waitFor();
    assert.equal(await page.evaluate(() => getComputedStyle(document.querySelector('.reader') as Element).colorScheme), 'dark');
    assert.equal(await page.locator('meta[name=theme-color]').getAttribute('content'), '#0b0c10');
    await settle(page);
    await shot(page, '37-reader-in-light-theme');
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
