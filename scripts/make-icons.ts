// Renders public/icons/icon.svg into the PNG sizes the manifest and iOS expect.
//   npm run icons        (needs Playwright's Chromium: npx playwright install chromium)
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

interface Target {
  readonly file: string;
  readonly size: number;
  readonly svg: string;
  /** Rounded icons sit on a transparent square; the others are cropped by the system and fill it. */
  readonly transparent: boolean;
}

const directory = new URL('../public/icons/', import.meta.url);
const rounded = await readFile(new URL('icon.svg', directory), 'utf8');
const square = rounded.replace('rx="112"', 'rx="0"');

const targets: readonly Target[] = [
  { file: 'icon-192.png', size: 192, svg: rounded, transparent: true },
  { file: 'icon-512.png', size: 512, svg: rounded, transparent: true },
  { file: 'icon-maskable-512.png', size: 512, svg: square, transparent: false },
  { file: 'apple-touch-icon.png', size: 180, svg: square, transparent: false },
];

const browser = await chromium.launch();
try {
  for (const { file, size, svg, transparent } of targets) {
    const page = await browser.newPage({ viewport: { width: size, height: size } });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
    await writeFile(new URL(file, directory), await page.screenshot({ omitBackground: transparent }));
    await page.close();
    console.log('wrote', file);
  }
} finally {
  await browser.close();
}
