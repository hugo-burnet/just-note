import assert from 'node:assert/strict';
import { devices } from 'playwright';
import type { Context } from '../Context.ts';

/**
 * What happens to someone who already has the app when a new version is deployed.
 * GitHub Pages lets the browser keep a page for ten minutes, so the service worker
 * has to ask the server instead of trusting that copy.
 */
export async function update({ browser, stage, runner }: Context): Promise<void> {
  runner.heading('A new deployment, while the old page is still fresh in the browser');
  const installed = await browser.newContext({ ...devices['Pixel 7'], locale: 'en-US', colorScheme: 'dark' });
  const page = runner.watch(await installed.newPage());
  const settings = `${stage.appUrl}#/settings`;
  const shownVersion = async (): Promise<string> => (await page.getByText(/^Just Read e2e-\d+$/).textContent()) ?? '';

  await runner.step('the first version is installed, and the worker controls the page', async () => {
    await page.goto(settings);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    assert.equal(await shownVersion(), 'Just Read e2e-1');
  });

  await runner.step('after a new deployment, the next load already shows the new version', async () => {
    stage.redeploy('e2e-2');
    // Opening the app again is a plain navigation, not a reload: a reload makes the browser check with the server anyway.
    await page.goto('about:blank');
    await page.goto(settings);
    await page.getByText(/^Just Read e2e-\d+$/).waitFor();
    assert.equal(await shownVersion(), 'Just Read e2e-2');
  });

  await runner.step('and the app keeps working once the new worker has taken over', async () => {
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
    await page.waitForFunction(async () => {
      const names = await caches.keys();
      return names.filter((name) => name.startsWith('jr-shell-')).length === 1;
    });
    await page.reload();
    assert.equal(await shownVersion(), 'Just Read e2e-2');
    await page.locator('nav.dock').waitFor();
  });

  await installed.close();
}
