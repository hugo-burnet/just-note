import type { Locator, Page } from 'playwright';

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

/**
 * Presses a button of the reader's controls, bringing them back first. The controls leave by
 * themselves a moment after a chapter opens: one that is looked at just before that and
 * clicked just after finds nothing to press. Then they are brought back and it is tried again
 * (they leave that way only once).
 */
export async function pressChrome(page: Page, name: string): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    await revealChrome(page);
    try {
      await page.locator('.chrome').getByRole('button', { name }).click({ timeout: 2000 });
      return;
    } catch (error) {
      if (attempt === 3) throw error;
    }
  }
}

/** Leaves the reader with its back button (`label` is its name in the language of the app). */
export const leaveReader = (page: Page, label = 'Back'): Promise<void> => pressChrome(page, label);

/** Scrolls the nth image of a chapter read in a column to the top, and waits for it to be drawn. */
export async function scrollToFrame(page: Page, index: number): Promise<void> {
  await page.evaluate((i) => document.querySelectorAll('.reader .frame')[i]?.scrollIntoView(), index);
  await page.waitForFunction((i) => (document.querySelectorAll<HTMLImageElement>('.reader .frame img')[i]?.naturalWidth ?? 0) > 0, index);
}

/** Waits until the page shown in turned-page mode is the nth image of the chapter, and drawn. */
/**
 * Waits for the n-th picture of a chapter to be the one on screen. The app shows pictures as blob: addresses,
 * which do not say which picture they are: the picture does, by its colour (see Pictures.ts, where picture n of a
 * site starts at the hue of the site plus n × 47°, and the sites start at 20°, 120° and 200°).
 */
export const waitShown = async (page: Page, n: number): Promise<unknown> => {
  try { return await page.waitForFunction((wanted) => {
    const image = document.querySelector<HTMLImageElement>('.paged img.single');
    if (!image || !image.complete || image.naturalWidth === 0) return false;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const pen = canvas.getContext('2d');
    if (!pen) return false;
    pen.drawImage(image, 0, 0, 1, 1, 0, 0, 1, 1);
    const [r = 0, g = 0, b = 0] = pen.getImageData(0, 0, 1, 1).data;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max === min) return false;
    const d = max - min;
    const hue = (max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4) * 60;
    const start = (((hue - (((wanted - 1) % 5) + 1) * 47) % 360) + 360) % 360;
    return [20, 120, 200].some((site) => Math.min(Math.abs(start - site), 360 - Math.abs(start - site)) < 3);
  }, n); } catch (error) {
    const state = await page.locator('.paged img.single').evaluate((el) => ({ src: (el as HTMLImageElement).currentSrc, width: (el as HTMLImageElement).naturalWidth }));
    throw new Error(`Page ${n} did not appear: ${JSON.stringify(state)}`, { cause: error });
  }
};

/** Opens the reading options from the reader's controls. */
export async function openReadingOptions(page: Page): Promise<void> {
  await pressChrome(page, 'Reading options');
  await page.locator('.reader-options').waitFor();
}

/** Picks `label` in the group `group` of the reading options. */
export const chooseReading = (page: Page, group: 'Mode' | 'Direction', label: string): Promise<void> =>
  page.getByRole('radiogroup', { name: group }).getByRole('radio', { name: label, exact: true }).click();

/**
 * The field of the "add by link" sheet that is open. A sheet that has just been closed takes 300 ms to
 * go, and another may be opened meanwhile: only the one that is open is meant.
 */
export const linkField = (page: Page): Locator => page.locator('.sheet-host[data-open="true"] input[name=link]');

/** Submits `link` in the "add by link" sheet, which is open. */
export async function addByLink(page: Page, link: string): Promise<void> {
  await linkField(page).fill(link);
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
