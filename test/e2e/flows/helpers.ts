import type { Page } from 'playwright';

/** The reader's page counter ("3 / 4"). Read from the text: the controls may be out of sight. */
export const counter = (page: Page): Promise<string> => page.locator('.reader-count').evaluate((el) => el.textContent?.trim() ?? '');

export const waitCounter = (page: Page, text: string): Promise<unknown> =>
  page.waitForFunction((expected) => document.querySelector('.reader-count')?.textContent?.trim() === expected, text);

/** Brings the reader's controls back, if they have gone, with a click in the middle of the screen. */
export async function revealChrome(page: Page): Promise<void> {
  if ((await page.locator('.chrome').getAttribute('data-visible')) !== 'false') return;
  const size = page.viewportSize() ?? { width: 400, height: 800 };
  await page.mouse.click(size.width / 2, size.height / 2);
  await page.locator('.chrome[data-visible="true"]').waitFor();
}

/** Leaves the reader with its back button. */
export async function leaveReader(page: Page): Promise<void> {
  await revealChrome(page);
  await page.locator('.chrome').getByRole('button', { name: 'Back' }).click();
}

/** Scrolls the nth image of a chapter read in a column to the top, and waits for it to be drawn. */
export async function scrollToFrame(page: Page, index: number): Promise<void> {
  await page.evaluate((i) => document.querySelectorAll('.reader .frame')[i]?.scrollIntoView(), index);
  await page.waitForFunction((i) => (document.querySelectorAll<HTMLImageElement>('.reader .frame img')[i]?.naturalWidth ?? 0) > 0, index);
}

/** Opens the "add by link" sheet from the library and submits `link` in it. */
export async function addByLink(page: Page, link: string): Promise<void> {
  await page.locator('input[name=link]').fill(link);
  await page.keyboard.press('Enter');
}

export const encoded = (url: string): string => encodeURIComponent(url);

/** Lets the screen finish arriving (a push, a sheet, a label growing) before it is photographed or tapped. */
export const settle = (page: Page): Promise<void> => page.waitForTimeout(500);

/** Closes the sheet with Escape and waits until it has really gone: while it closes, keys still belong to it. */
export async function dismissSheet(page: Page): Promise<void> {
  await page.keyboard.press('Escape');
  await page.locator('.sheet-host').waitFor({ state: 'detached' });
}
