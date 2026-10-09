import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { buildSync } from 'esbuild';
import type { Context } from '../Context.ts';
import type {} from '../RegressionApp.ts';
import { FANFOX_SERIES } from '../PretendFanFox.ts';
import { settle } from './helpers.ts';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

export async function backupAndDesign({ browser, stage, runner }: Context): Promise<void> {
  runner.heading('Backups, byte budgets and responsive design');
  buildSync({ absWorkingDir: ROOT, entryPoints: ['test/e2e/RegressionApp.ts'], outfile: 'test-output/site/regressions.js', bundle: true, format: 'esm', target: 'es2022' });
  const context = await browser.newContext({ viewport: { width: 393, height: 852 }, locale: 'en-US', colorScheme: 'dark', serviceWorkers: 'block', acceptDownloads: true });
  const page = runner.watch(await context.newPage());
  const step = runner.step.bind(runner);
  let raw = '';
  try {
    await page.goto(stage.appUrl);
    await page.addScriptTag({ url: new URL('regressions.js', stage.appUrl).href, type: 'module' });
    await page.waitForFunction(() => !!window.regression);
    await page.evaluate((url) => {
      const library = window.regression.library;
      // Its genres known, as for any series read since they are kept: it is not read again behind the test's back.
      library.save({ url, title: 'Moonlight Courier', cover: null, chapters: [1, 2, 3], genres: ['Adventure'] });
      library.setPosition(url, { chapter: `${url}v01/c002/1.html`, key: 'c002', title: 'Chapter 2', page: 7 });
      library.markRead(url, 'c001');
    }, FANFOX_SERIES);
    await page.goto(`${stage.appUrl}#/settings`);
    await step('export downloads a portable file with progress and finished chapters', async () => {
      const downloaded = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Export library', exact: true }).click();
      const download = await downloaded;
      assert.match(download.suggestedFilename(), /^just-read-\d{4}-\d{2}-\d{2}\.json$/);
      raw = await readFile((await download.path())!, 'utf8');
      const data = JSON.parse(raw);
      assert.equal(data.entries[0].position.page, 7);
      assert.deepEqual(data.entries[0].finished, ['c001']);
      assert.deepEqual(data.entries[0].genres, ['Adventure']);
    });
    await step('invalid imports leave the library intact and report the error inline', async () => {
      await page.locator('input[type=file]').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{') });
      await page.locator('.backup-status[data-error=true]').waitFor();
      assert.equal(await page.evaluate(() => window.regression.library.list().length), 1);
    });
    await step('import restores an erased library and still persists after reloading', async () => {
      await page.getByRole('button', { name: 'Erase library and progress', exact: true }).click();
      await page.locator('.sheet').getByRole('button', { name: 'Erase library and progress', exact: true }).click();
      await page.locator('.sheet-host').waitFor({ state: 'detached' });
      await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(raw) });
      await page.locator('.backup-status', { hasText: '1 series imported' }).waitFor();
      await page.goto(`${stage.appUrl}#/`);
      await page.reload();
      await page.locator('.continue', { hasText: 'Chapter 2 · Page 8' }).waitFor();
      await page.getByText('1 / 3 read', { exact: true }).waitFor();
      await settle(page);
      await runner.shot(page, '60-library-redesign');
    });
    await step('card actions work with the keyboard and all navigation labels remain visible', async () => {
      const menu = page.getByRole('button', { name: 'Actions for Moonlight Courier' });
      await menu.focus();
      await page.keyboard.press('Enter');
      await page.locator('.sheet').getByRole('button', { name: 'Cancel' }).click();
      await page.locator('.sheet-host').waitFor({ state: 'detached' });
      for (const name of ['Library', 'Discover', 'Settings']) {
        const label = page.locator('.dock-label > span', { hasText: name });
        assert.equal(await label.evaluate((el) => getComputedStyle(el).opacity), '1');
      }
    });
    await step('French layouts fit a small phone in both themes and settings form two desktop columns', async () => {
      await page.goto(`${stage.appUrl}#/settings`);
      await page.getByRole('radiogroup', { name: 'Language', exact: true }).getByRole('radio', { name: 'Français' }).click();
      await page.setViewportSize({ width: 320, height: 740 });
      for (const theme of ['Sombre', 'Clair']) {
        await page.getByRole('radio', { name: theme }).click();
        await settle(page);
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        await page.getByRole('button', { name: 'Importer la bibliothèque', exact: true }).scrollIntoViewIfNeeded();
        const box = await page.locator('.backup-panel').boundingBox();
        assert.ok(box && box.x >= 0 && box.x + box.width <= 320);
      }
      await runner.shot(page, '61-settings-small-light');
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.evaluate(() => scrollTo(0, 0));
      await settle(page);
      const groups = page.locator('.settings-layout > section');
      const left = await groups.nth(0).boundingBox(), right = await groups.nth(1).boundingBox();
      assert.ok(left && right && Math.abs(left.y - right.y) < 2 && right.x > left.x + left.width);
      await runner.shot(page, '62-settings-desktop');
    });
    await step('web and native CacheStorage obey byte budgets under concurrent downloads', async () => {
      await page.addScriptTag({ url: new URL('regressions.js', stage.appUrl).href, type: 'module' });
      await page.waitForFunction(() => !!window.regression);
      for (const kind of ['native', 'worker'] as const) {
        const result = await page.evaluate((kind) => window.regression.cacheBudget(kind), kind);
        assert.deepEqual(result.keys.map((key) => new URL(key).pathname), ['/budget/b', '/budget/c']);
        assert.equal(result.bytes, 8);
        assert.equal(result.readable, '3333');
        assert.equal(result.original, '3333');
      }
    });
    await step('the native export presents selectable JSON and copies the same backup', async () => {
      await page.evaluate(() => window.regression.showNativeBackup());
      await page.getByRole('button', { name: 'Export library', exact: true }).click();
      const contents = await page.locator('.backup-text').inputValue();
      assert.equal(JSON.parse(contents).entries[0].position.page, 7);
      await page.getByRole('button', { name: 'Copy backup', exact: true }).click();
      assert.equal(await page.evaluate(() => window.regression.copied), contents);
    });
  } finally { await context.close(); }
}
