// End-to-end check of the real app in Chromium: the real Node server and proxy,
// with a pretend FanFox behind them (no network, made-up titles, generated images).
// Screenshots land in test-output/ for a human to look at.
//   npm run test:e2e        (needs Playwright's Chromium: npx playwright install chromium)
import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium, devices } from 'playwright';
import { createApiHandler } from '../server/handler.js';
import { createAppServer } from '../server/node.js';
import { fixture } from './helpers/dom.js';
import { pack } from './helpers/pack.js';

const OUT = new URL('../test-output/', import.meta.url);
const SERIES = 'https://fanfox.net/manga/moonlight_courier/';
const chapterUrl = (key) => `${SERIES}${key}/1.html`;
const PAGES = { c001: 3, c002: 4, 'v01/c003': 3, 'c003.5': 2, c004: 5 };
const CATALOG = [
  ['moonlight_courier', 'Moonlight Courier'],
  ['clockwork_garden', 'Clockwork Garden'],
  ['paper_lanterns', 'Paper Lanterns'],
];

// ---- the pretend site -------------------------------------------------------

const requests = [];
let images = [];
const seriesHtml = await fixture('fanfox-series.html');

const html = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
const listHtml = (items) =>
  `<!doctype html><ul>${items
    .map(([slug, title]) => `<li><a href="/manga/${slug}/" title="${title}"><img src="//fmcdn.mfcdn.net/store/manga/9999/cover.jpg" alt="${title}"></a></li>`)
    .join('')}</ul>`;
const inlineChapter = (key, count) =>
  `<!doctype html><script src="//static.fanfox.net/chapter_bar.js"></script><script>${pack(
    `var newImgs=[${Array.from({ length: count }, (_, i) => `'//fmcdn.mfcdn.net/store/manga/9999/${key}/${i + 1}.png?token=${i + 1}'`).join(',')}];`,
  )}</script>`;
const legacyChapter = '<!doctype html><script>var comicid = 9999; var chapterid = 777; var imagecount = 2;</script><input type="hidden" id="dm5_key" value="k">';
const legacyPage = (n) =>
  pack(`var pix="//fmcdn.mfcdn.net/store/manga/9999/c003.5";var pvalue=["/${n}.png?token=${n}","/${n + 1}.png?token=${n + 1}"];`);

async function pretendSite(url, init) {
  const u = new URL(url);
  requests.push({ url, referer: init.headers.referer });
  if (u.hostname === 'fmcdn.mfcdn.net') {
    const n = Number(/\/(\d+)\.png/.exec(u.pathname)?.[1] ?? 1);
    return new Response(images[(n - 1) % images.length], { headers: { 'content-type': 'image/png' } });
  }
  if (u.hostname !== 'fanfox.net') return html('not found', 404);
  if (u.pathname === '/' || u.pathname === '/directory/') return html(listHtml(CATALOG));
  if (u.pathname === '/search') {
    const wanted = (u.searchParams.get('title') ?? '').toLowerCase();
    return html(listHtml(CATALOG.filter(([, title]) => title.toLowerCase().includes(wanted))));
  }
  if (u.pathname === '/manga/forbidden_tale/') return html('nope', 403);
  if (u.pathname === '/manga/moonlight_courier/') return html(seriesHtml);
  if (u.pathname.endsWith('/c003.5/chapterfun.ashx')) return html(legacyPage(Number(u.searchParams.get('page'))));
  const chapter = /^\/manga\/moonlight_courier\/((?:v01\/)?c[\d.]+)\/1\.html$/.exec(u.pathname);
  if (chapter && PAGES[chapter[1]]) return html(chapter[1] === 'c003.5' ? legacyChapter : inlineChapter(chapter[1], PAGES[chapter[1]]));
  return html('not found', 404);
}

async function makeImages(browser, count) {
  const page = await browser.newPage({ viewport: { width: 400, height: 600 } });
  const out = [];
  for (let n = 1; n <= count; n++) {
    await page.setContent(
      `<body style="margin:0;display:grid;place-items:center;height:600px;background:hsl(${n * 47} 55% 82%);font:700 140px system-ui;color:#222">${n}</body>`,
    );
    out.push(await page.screenshot());
  }
  await page.close();
  return out;
}

// ---- a tiny runner ------------------------------------------------------------

const failures = [];
let current = null;

async function step(name, fn) {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failures.push(name);
    console.log(`  ✗ ${name}\n      ${String(err.message).split('\n').slice(0, 4).join('\n      ')}`);
    if (current) await current.screenshot({ path: new URL(`fail-${failures.length}.png`, OUT).pathname }).catch(() => {});
  }
}

const shot = (page, name) => page.screenshot({ path: new URL(`${name}.png`, OUT).pathname });
const counter = async (page) => (await page.locator('.reader-counter').innerText()).trim();
const waitCounter = (page, text) =>
  page.waitForFunction((expected) => document.querySelector('.reader-counter')?.textContent.trim() === expected, text);

// ---- run ------------------------------------------------------------------------

await mkdir(OUT, { recursive: true });
const server = createAppServer({ api: createApiHandler({ fetch: pretendSite }) });
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = `http://127.0.0.1:${server.address().port}`;
let serverUp = true;
// Playwright's setOffline() does not cut a service worker's own requests, so
// "offline" here means the server really goes away.
const stopServer = () =>
  new Promise((resolve) => {
    serverUp = false;
    server.close(() => resolve());
    server.closeAllConnections();
  });
const browser = await chromium.launch();
images = await makeImages(browser, 5);

const pageErrors = [];
const cspViolations = [];
function watch(page) {
  page.setDefaultTimeout(8000);
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error' && /Content Security Policy|Refused to/i.test(msg.text())) cspViolations.push(msg.text());
  });
}

console.log('\nreading, on a phone (no service worker)');
const phone = await browser.newContext({ ...devices['Pixel 7'], locale: 'en-US', serviceWorkers: 'block' });
const page = await phone.newPage();
current = page;
watch(page);

await step('home shows the link field and an empty library', async () => {
  await page.goto(`${base}/`);
  await page.locator('input[name=link]').waitFor();
  assert.equal(await page.title(), 'Just Read');
  assert.match(await page.locator('.empty').innerText(), /Nothing here yet/);
  await shot(page, '01-home-empty');
});

await step('a pasted series link opens the series page', async () => {
  await page.locator('input[name=link]').fill(SERIES);
  await page.keyboard.press('Enter');
  await page.locator('.series-title').waitFor();
  assert.equal(await page.locator('.series-title').innerText(), 'Moonlight Courier');
  assert.equal(await page.locator('a.chapter').count(), 5);
  const titles = await page.locator('a.chapter .chapter-title').allInnerTexts();
  assert.deepEqual(titles.slice(0, 2), ['Ch.004 The Last Lantern', 'Ch.003.5 Extra'], 'newest first by default');
  await page.waitForFunction(() => document.querySelector('.series-cover img')?.naturalWidth > 0);
  const cover = requests.find((r) => r.url.includes('cover.jpg'));
  assert.equal(cover.referer, 'https://fanfox.net/', 'images are fetched with the site as Referer');
  await shot(page, '02-series');
});

await step('a chapter opens in scroll mode and its images load', async () => {
  await page.locator('a.chapter', { hasText: 'Ch.002' }).click();
  await page.locator('.reader .frame').first().waitFor();
  assert.equal(await page.locator('.reader .frame').count(), 4);
  await page.waitForFunction(() => document.querySelector('.reader .frame img').naturalWidth > 0);
  assert.equal(await counter(page), '1 / 4');
  await shot(page, '03-reader-scroll');
});

await step('the counter follows the scroll', async () => {
  await page.evaluate(() => document.querySelectorAll('.reader .frame')[2].scrollIntoView());
  await waitCounter(page, '3 / 4');
});

await step('leaving the reader keeps the place; the series page offers to continue', async () => {
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('.series-title').waitFor();
  assert.match(page.url(), /#\/series/);
  assert.match(await page.locator('.actions .btn-primary').innerText(), /Continue · Ch\.002/);
  assert.equal(await page.locator('a.chapter[aria-current="true"]').count(), 1);
});

await step('the library remembers the series and the position', async () => {
  await page.goto(`${base}/`);
  await page.reload();
  await page.locator('.card-title').first().waitFor();
  assert.equal(await page.locator('.card-title').first().innerText(), 'Moonlight Courier');
  assert.match(await page.locator('.card-sub').first().innerText(), /Ch\.002/);
  assert.match(await page.locator('.resume').innerText(), /continue reading/i);
  await shot(page, '05-home-library');
});

await step('"continue reading" restores the page, Back returns where we came from', async () => {
  await page.locator('.resume').click();
  await waitCounter(page, '3 / 4');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('.library').waitFor();
});

await step('paged mode keeps the page and reads right to left', async () => {
  await page.locator('.card-link').first().click();
  await page.locator('a.chapter', { hasText: 'Ch.002' }).click();
  await waitCounter(page, '3 / 4');
  await page.getByRole('button', { name: 'Reading options' }).click();
  await page.getByRole('radio', { name: 'Pages' }).click();
  await page.locator('.paged img.single').waitFor();
  await page.waitForFunction(() => document.querySelector('.paged img.single').naturalWidth > 0);
  assert.equal(await counter(page), '3 / 4');
  await shot(page, '04-reader-paged');
  await page.keyboard.press('ArrowLeft');
  await waitCounter(page, '4 / 4');
});

await step('tapping the edges turns pages (left edge is forward in right-to-left)', async () => {
  await page.keyboard.press('ArrowRight');
  await waitCounter(page, '3 / 4');
  await page.touchscreen.tap(20, 400);
  await waitCounter(page, '4 / 4');
});

await step('past the last page the next chapter opens, without growing the history', async () => {
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => document.querySelector('.reader-title span')?.textContent === 'Vol.01 Ch.003');
  assert.equal(await counter(page), '1 / 3');
  await page.getByRole('button', { name: 'Back' }).click();
  await page.locator('.series-title').waitFor();
  assert.match(page.url(), /#\/series/, 'Back goes to the series, not to the chapter just finished');
});

await step('a finished chapter is marked as read', async () => {
  const read = await page.locator('a.chapter.read .chapter-title').allInnerTexts();
  assert.deepEqual(read, ['Ch.002']);
});

await step('a link shared to the app opens straight away (and the other page layout works)', async () => {
  const shared = `Great read ${chapterUrl('c003.5')} enjoy`;
  await page.goto(`${base}/?text=${encodeURIComponent(shared)}&title=Moonlight`);
  await waitCounter(page, '1 / 2');
  assert.match(page.url(), /#\/read\?u=/);
  assert.doesNotMatch(page.url(), /\?text=/);
  // The reading mode chosen earlier (pages) is remembered.
  await page.locator('.paged img.single').waitFor();
  const asked = requests.filter((r) => r.url.includes('chapterfun.ashx'));
  assert.equal(asked.length, 2);
  assert.ok(asked.every((r) => r.referer === chapterUrl('c003.5')), 'the chapter page is the Referer of chapterfun.ashx');
});

await step('an unsupported link is refused politely', async () => {
  await page.goto(`${base}/#/`);
  await page.reload();
  await page.locator('input[name=link]').fill('https://example.com/manga/x/');
  await page.keyboard.press('Enter');
  await page.locator('.toast', { hasText: "isn't supported" }).waitFor();
  assert.doesNotMatch(page.url(), /#\/(series|read)/);
});

await step('browsing the site lists series; searching narrows them down', async () => {
  await page.getByRole('link', { name: 'Browse FanFox' }).click();
  await page.waitForFunction(() => location.hash.startsWith('#/browse') && document.querySelectorAll('.grid .card').length === 3);
  await page.locator('input[type=search]').fill('moon');
  await page.keyboard.press('Enter');
  await page.locator('.topbar-title', { hasText: 'Results for “moon”' }).waitFor();
  await page.waitForFunction(() => document.querySelectorAll('.grid .card').length === 1);
  await shot(page, '08-browse');
  await page.locator('.grid .card-link').first().click();
  await page.locator('.series-title').waitFor();
});

await step('a refusal from the site shows a clear error with copyable details', async () => {
  await page.goto(`${base}/#/series?u=${encodeURIComponent('https://fanfox.net/manga/forbidden_tale/')}`);
  await page.locator('.error-box').waitFor();
  assert.match(await page.locator('.error-box h2').innerText(), /refused/);
  assert.match(await page.locator('.error-box pre').textContent(), /"upstreamStatus": 403/);
  assert.equal(await page.getByRole('button', { name: 'Retry' }).count(), 1);
  await shot(page, '06-error');
});

await step('settings: switching language rewrites the interface, and back', async () => {
  await page.goto(`${base}/#/settings`);
  await page.getByRole('radio', { name: 'Français' }).click();
  await page.getByText('Langue', { exact: true }).waitFor();
  await shot(page, '07-settings-fr');
  await page.getByRole('radio', { name: 'Auto' }).first().click();
  await page.getByText('Language', { exact: true }).waitFor();
});

await step('the proxy answers the connection test', async () => {
  await page.getByRole('button', { name: 'Test connection' }).click();
  await page.getByText('Connected.').waitFor();
});

await step('settings: the dark theme applies, and is kept after a reload', async () => {
  await page.getByRole('radio', { name: 'Dark' }).click();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  assert.equal(await page.evaluate(() => getComputedStyle(document.body).backgroundColor), 'rgb(15, 17, 20)');
  await page.goto(`${base}/`);
  await page.reload();
  await page.locator('.library').waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dataset.theme), 'dark');
  await shot(page, '10-home-dark');
});

await phone.close();

console.log('\nreading, on a desktop screen');
const desktop = await browser.newContext({ viewport: { width: 1280, height: 800 }, locale: 'en-US', serviceWorkers: 'block' });
const wide = await desktop.newPage();
current = wide;
watch(wide);

await step('the layout stays centred and readable on a wide screen', async () => {
  await wide.goto(`${base}/#/series?u=${encodeURIComponent(SERIES)}`);
  await wide.locator('.series-title').waitFor();
  const content = await wide.locator('main.page').boundingBox();
  assert.ok(content.width <= 920 && Math.abs(content.x + content.width / 2 - 640) < 2, JSON.stringify(content));
  await shot(wide, '11-desktop-series');
  await wide.locator('a.chapter', { hasText: 'Ch.001' }).click();
  await wide.locator('.reader .frame img').first().waitFor();
  const strip = await wide.locator('.strip').boundingBox();
  assert.ok(strip.width <= 900 && Math.abs(strip.x + strip.width / 2 - 640) < 2, JSON.stringify(strip));
  await shot(wide, '12-desktop-reader');
});

await desktop.close();

console.log('\noffline, with the service worker');
const installed = await browser.newContext({ ...devices['Pixel 7'], locale: 'en-US' });
const offlinePage = await installed.newPage();
current = offlinePage;
watch(offlinePage);

await step('the app installs its service worker and caches its files', async () => {
  await offlinePage.goto(`${base}/`);
  await offlinePage.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await offlinePage.waitForFunction(async () => {
    if (!(await caches.keys()).includes('jr-shell-v1')) return false;
    return (await (await caches.open('jr-shell-v1')).keys()).length >= 20;
  });
});

await step('read a chapter online so that it is kept', async () => {
  await offlinePage.locator('input[name=link]').fill(SERIES);
  await offlinePage.keyboard.press('Enter');
  await offlinePage.locator('a.chapter', { hasText: 'Ch.001' }).click();
  await offlinePage.locator('.reader .frame').first().waitFor();
  for (let i = 0; i < 3; i++) {
    await offlinePage.evaluate((index) => document.querySelectorAll('.reader .frame')[index].scrollIntoView(), i);
    await offlinePage.waitForFunction((index) => document.querySelectorAll('.reader .frame img')[index].naturalWidth > 0, i);
  }
  await offlinePage.getByRole('button', { name: 'Back' }).click();
  await offlinePage.locator('.series-title').waitFor();
});

await step('answers that carry one-off tokens are not kept in the page cache', async () => {
  await offlinePage.locator('a.chapter', { hasText: 'Ch.003.5' }).click();
  await waitCounter(offlinePage, '1 / 2');
  const kept = await offlinePage.evaluate(async () =>
    (await (await caches.open('jr-api')).keys()).map((request) => decodeURIComponent(request.url)),
  );
  assert.ok(kept.some((url) => url.includes('/manga/moonlight_courier/c003.5/1.html')), 'the chapter page itself is kept');
  assert.ok(!kept.some((url) => url.includes('chapterfun.ashx')), 'the page-by-page token requests are not');
  await offlinePage.getByRole('button', { name: 'Back' }).click();
  await offlinePage.locator('.series-title').waitFor();
});

await step('offline: the app, the series and the chapter you read still open', async () => {
  await stopServer();
  await offlinePage.reload();
  await offlinePage.locator('.series-title').waitFor();
  assert.equal(await offlinePage.locator('a.chapter').count(), 5);
  await offlinePage.locator('a.chapter', { hasText: 'Ch.001' }).click();
  await offlinePage.locator('.reader .frame').first().waitFor();
  for (let i = 0; i < 3; i++) {
    await offlinePage.evaluate((index) => document.querySelectorAll('.reader .frame')[index].scrollIntoView(), i);
    await offlinePage.waitForFunction((index) => document.querySelectorAll('.reader .frame img')[index].naturalWidth > 0, i);
  }
  await offlinePage.getByRole('button', { name: 'Back' }).click();
  await offlinePage.locator('.series-title').waitFor();
});

await step('offline: a chapter that was never read says so instead of hanging', async () => {
  await offlinePage.locator('a.chapter', { hasText: 'Ch.004' }).click();
  await offlinePage.locator('.error-box h2', { hasText: /You're offline|Can't reach/ }).waitFor();
  await shot(offlinePage, '09-offline');
});

await installed.close();
await browser.close();
if (serverUp) await stopServer();

if (pageErrors.length) failures.push(`uncaught page errors: ${pageErrors.join(' | ')}`);
if (cspViolations.length) failures.push(`CSP violations: ${cspViolations.join(' | ')}`);

console.log(failures.length ? `\n${failures.length} problem(s):\n - ${failures.join('\n - ')}` : '\nAll good. Screenshots are in test-output/.');
process.exit(failures.length ? 1 : 0);
