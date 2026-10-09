# Just Read

Paste a link, read it here. The app becomes the reader of the site the link points
to: a library, your place in every series, reading as a scrolling column or page by
page, and what you already read stays available offline. Built for a phone first
(a PWA, or an Android app made with Capacitor that needs no proxy), and it does not look
like a website.

Sites it reads: **FanFox** (MangaFox), which publishes in English only; **WEBTOON**, in
English and French; and **LelScan**, French scans of a few dozen series. The app itself is
in English and French.

The language of the series is not the language of the app: WEBTOON opens its catalogue in
the language of the app, unless *Settings → Reading → Series language* says otherwise, and
Discover names the language it is showing. The text of a manga is part of its pictures, so
what a site publishes in English stays English whatever the settings say.

Each site is read the way it is meant to be: FanFox and LelScan as turned pages from right
to left, like a printed manga; WEBTOON as one long column. *Settings → Reading* (or the options
inside the reader) starts on **Auto**, which follows the site; choosing *Scroll*, *Pages*,
*Left to right* or *Right to left* overrides it for every site, and *Auto* gives the
decision back.

*Settings → Data* exports the library, current pages and finished chapters as a
versioned JSON file. Importing validates the whole file (up to 5 MiB) before merging:
newer progress wins, finished chapters are combined, and unrelated series stay.
The APK presents selectable JSON with a copy button; save the copied text as a `.json`
file to import it elsewhere. Backups exclude downloaded images and connection settings.

The library marks the chapters that came out since a series was last opened, filters its shelf and
Discover's results by genre (keep some, leave others out) and downloads chapters to read with no network: see
[LIBRARY.md](LIBRARY.md).

What is read is also kept (the reading cache), bounded by **128 MiB / 400 images** and
**16 MiB / 80 pages** on both web and native. Actual decoded bytes are counted; oldest
copies leave first. An answer larger than its budget stays readable online without
displacing other copies.

```
 phone / browser                                  a proxy you deploy               the site
┌─────────────────────────────┐   /api/html     ┌────────────────────────┐      ┌───────────────┐
│ app: screens ─ engine ─ web │ ──────────────► │ proxy/ (Worker or Node)│ ───► │ pages, images │
│ platform (storage, fetch)   │ ◄────────────── │ allowlist, Referer     │ ◄─── │               │
└─────────────────────────────┘   /api/img      └────────────────────────┘      └───────────────┘
 served by GitHub Pages (static)
```

Why a proxy: a browser may not read another site's pages (CORS), and image CDNs
refuse requests that do not carry the site's Referer. GitHub Pages only serves files,
so the proxy runs elsewhere (a Cloudflare Worker, or any Node host). It relays an
allowlist of hosts only, so it is not an open proxy. The installed app (the APK, below)
does not need it: it reads the sites from the phone itself.

It has to be *this* proxy. A public one found online (corsproxy.io and the like) will
not do: it speaks another protocol (the app asks for `/api/html` and `/api/img`), it does
not send the site's Referer, so the pages would come without their images, and whoever
runs it sees everything you read and can alter what you are shown.

## Status: read this first

- **Verified:** 440 unit tests, and an end-to-end run in a real Chromium against
  *pretend* FanFox, WEBTOON and LelScan sites served by the test itself (made-up
  titles, generated images). It covers a phone and a desktop screen, both themes, both
  languages, both reading modes, a link shared to the app, and the installed app
  offline with its servers switched off. The app and the proxy run on two different
  origins there, as they do on GitHub Pages with a Worker.
- **Regression checks:** two browser tabs keep each other's library and progress, and
  changes from another tab update the visible shelf. The native TypeScript reader is
  also exercised in Chromium: retries in both modes, nearby image loading, and a
  140-image chapter revisited offline after unused blob addresses have been released.
  Its native composition also lists all six sources and opens Scan-Manga and SushiScan
  against fixture pages, using the real native TypeScript transport and blob images.
  These checks do not replace running the APK on a phone.
- **Backups and layout:** browser download, invalid file rejection, restoration after
  reload, native JSON copying, byte budgets under concurrent writes, keyboard card
  actions, labelled navigation, and French settings at 320 px and on desktop.
- **Verified on a phone, by the author's report: the APK installs, and FanFox and WEBTOON
  read in it.** Both adapters were written from what is known of the sites and tested on
  synthetic pages shaped like them (the machine this was built on could not reach them).
- **Not verified: LelScan on the real site.** It was written from its real pages, which the
  *Probe* workflow fetched (the series list, a series, chapters, a decimal chapter, images),
  but no chapter of it has been reported through the app. When a page cannot be read, the
  error screen has a **Copy details** button: paste its content to get the adapter fixed.
- **Verified on a phone, by the author's report: Settings → Diagnostic on Scan-Manga.** The WebView
  (`PageFetcherPlugin.java`) passes its Cloudflare check; the phone's own network, sent the cookie and
  the User-Agent the WebView earned, is then answered 200 (so the WebView is needed once, not for each
  page); and the script that scrolls a chapter took its 22 pictures, valid JPEGs, from the page.
  Also in the app: the Scan-Manga lists, a series page (title, author, genre, synopsis, chapters), and a
  chapter link pasted into the library. Its lists only have thumbnails of 130 pixels (a crop of the cover):
  as a card comes into view the app asks for the cover on the page of its series, three at a time, keeps it
  and swaps it in (`Source.betterCovers`, `Catalog.cover`); that part is **not verified on a phone**.
  **Not verified: reading a chapter in the reader** (through the WebView, behind a spinner), the clearance
  the WebView already held being reused, and how long a chapter takes to open. (A manga chapter was turned
  away by an earlier build: its hidden pager numbers as many elements as the chapter has pictures, which
  the module no longer counts.)
- Some sites cannot be read from a web app at all: the ones that check their visitors
  with an anti-bot challenge (Cloudflare's *Just a moment…*) answer the proxy with a page
  that only a real browser can pass. Scan-Manga and SushiScan are two (their mobile
  sites too). The APK asks from the phone, but it runs no JavaScript either, so a check
  turns it away the same way: there, a WebView of the app passes the check (see *The APK*),
  and *Settings → Diagnostic* copies a report of what the site sends, which is what a module
  is written from. Scan-Manga and SushiScan have a module for the APK (they are not offered in the browser).
- **SushiScan** was written from four phone reports (the home page, a series, a chapter, a search): the phone's
  own network is answered 200 with no check, a series is `/catalogue/<name>/` with its chapters in
  `#chapterlist`, a chapter is `/<name>-chapitre-<n>/` and its reader is given the pictures in a script
  (`"images":[…]`, on `c.sushiscan.net`), and the way back to its series is the one link to `/catalogue/<name>/`
  in it. A series says what it is (manga, manhua…), which sets how it is read (`Series.reading`). On a phone, by the
  author's report: the search and the covers work, a series page gives its title, author, genres and synopsis, its
  volumes are listed (they are in a list of their own, which is read since), and a volume's page finds its 193
  pictures. **But the pictures themselves were not shown** (each frame said *Retry*): the phone could not have them
  from `c.sushiscan.net`, for a reason the next report, which says it, is to give.
- **Downloads and new chapters** are checked in Chromium on the web build: a chapter never read is
  downloaded with its button, the network is switched off, and every page of it opens; the shelf
  marks the series as downloaded and with new chapters. **Not verified on a phone**: in the APK the
  same code keeps the pictures in the WebView's Cache API, and a Scan-Manga chapter is downloaded the
  way the reader reads one ahead (its WebView, behind the app); Android may pause the app in the
  background, which pauses a download.
- **Not verified: Demonic Scans** (`demonicscans.org`, English, mostly manhwa, read as a column). The machine
  it was written on could not reach the site: it follows what the readers that already read it look for (Mihon's
  and Kotatsu's modules for it, which agree), and is tested on pages shaped the same way. The latest updates are
  `/lastupdates.php` (the cards with a `toffee-badge` are advertisements, left out), a search is
  `/search.php?manga=…`, a series is `/manga/<Name>` with its chapters as `#chapters-list a.chplinks`, a chapter
  is `/title/<Name>/chapter/<n>/…` with its pictures as `img.imgholder`, and the way back to its series is its
  link to `/manga/<Name>`. **Where the pictures are served from is not known**: only `demonicscans.org` is
  allowed; if they come from another host, the reader says *Blocked address* and names it, which is the host
  to add to its module.
- LelScan has no search of its own: searching filters its list of series. A chapter takes
  one request per page (the images are not named alike from one series to the next), so a
  long chapter takes a few seconds to open.
- If an image host is missing from the allowlist the app says *Blocked address* and
  names the host; add it with `PROXY_EXTRA_HOSTS`.
- Chapters whose page list is built from one-off token requests (an older FanFox
  layout) cannot be reopened offline; the others can.

## Run it

```sh
npm install
npm run dev          # the app with hot reload, and the proxy built in: http://localhost:5173
npm run build        # the static app, in dist/
npm run preview      # look at that build (it has no proxy: see below)
STATIC_DIR=dist npm start    # app + proxy in one Node process: http://127.0.0.1:8787
```

Node 22.18 or later: it runs the TypeScript of the proxy and the tests directly, there
is nothing to compile for them. Only the app goes through Vite.

## Publish it on GitHub Pages

1. **Settings → Pages → Source: GitHub Actions.**
2. **Deploy the proxy**, once. In `wrangler.toml`, set `CORS_ORIGIN` to the origin Pages
   serves the app from (no path, for example `https://you.github.io`), then either:
   - with nothing installed (works from a phone): make a Cloudflare API token from the
     *Edit Cloudflare Workers* template (dash.cloudflare.com/profile/api-tokens) and add it
     to the repository as the secret `CLOUDFLARE_API_TOKEN`; then run the *Proxy* workflow
     from the Actions tab. `.github/workflows/proxy.yml` also redeploys the Worker whenever
     `proxy/` or `src/engine/` changes on the default branch (the list of sites there is what
     the Worker may reach, so adding a site means deploying it again); or
   - run `npx wrangler login` and `npx wrangler deploy`; or
   - in the Cloudflare dashboard: *Workers & Pages → Create → Import a repository*, pick
     this repository, name the Worker `just-read-proxy` (it must match `wrangler.toml`)
     and keep the default deploy command.
3. **Settings → Secrets and variables → Actions → Variables:** add `PROXY_URL` with the
   address of that Worker. It becomes the default *Proxy address* of the app (users can
   change it in Settings).
4. Push to the default branch (`main`). `.github/workflows/pages.yml` checks, builds and
   publishes; other branches only run `ci.yml` (and `apk.yml`, which builds the Android app).

On the phone: open the page, then *Install app* / *Add to Home Screen*. On Android,
**Share → Just Read** from the browser then opens a link directly (iOS has no share
target: paste the link instead).

**The APK (Android).** `.github/workflows/apk.yml` builds it whenever the app changes and
publishes the default branch as the pre-release **apk-latest**. Other branches produce
an artifact for testing; they cannot replace the public APK. On a phone, open
`https://github.com/hugo-burnet/just-note/releases/download/apk-latest/just-read.apk`: the file
downloads as it is, and Android asks once to allow installs from the browser. Every build is
signed with the same key and numbered after the run, so a newer APK installs over an older one
and keeps the library. That key is `android/app/debug.keystore`, public on purpose: this is an
app you install yourself, not a store release. On a computer, with JDK 21 and the Android
SDK: `npm run apk`.

Prefer one machine for everything? `STATIC_DIR=dist npm start` serves the app and the
proxy together, and the proxy address stays empty (same address).

| Variable | Effect |
| --- | --- |
| `VITE_PROXY_URL` | build time: the default proxy address built into the app |
| `PORT`, `HOST` | Node entry: where to listen (default `127.0.0.1:8787`, `0.0.0.0` when `PORT` is set) |
| `STATIC_DIR` | Node entry: also serve this folder (the built app) |
| `PROXY_EXTRA_HOSTS` | more hosts the proxy may reach: `cdn.example.com,webtoon:img.example.net` |
| `CORS_ORIGIN` | the origin allowed to call the proxy from a browser, when the app lives elsewhere |

## How it is built

```
src/engine/     the pure engine: sources, catalog, library, settings, reading logic
src/platform/   what the machine provides: the web's (fetch through the proxy), the installed app's (the phone's own network)
src/ui/         screens and components, written as classes, with no framework
src/sw/         the service worker: strategy classes, built next to the app
proxy/          the proxy, written with the Fetch API only: runs on Node and on Workers
android/        the Capacitor project of the APK
scripts/        Vite plugins (service worker, security policy, dev proxy), icons
test/           unit tests, fixtures, the end-to-end run
```

- **A pure engine.** `src/engine` touches no DOM, no network and no storage. It is given
  three ports (`Transport`, `HtmlParser`, `KeyValueStore`, see `src/engine/ports.ts`);
  a test fails if any engine file mentions a browser or Node global. That is what lets
  the same engine run in the browser and inside Capacitor.
- **A platform seam.** `src/platform/Platform.ts` is everything the app takes from the
  machine. `WebPlatform` is the browser's and `NativePlatform` the installed app's; the
  engine and the screens do not know which one they run on.
- **Object-oriented, small.** Classes with one job each; no hand-written file is longer
  than 300 lines (a test enforces it, `package-lock.json` aside).
- **Strict by default.** TypeScript in strict mode, with only syntax that can be erased
  (so Node runs it as it is). The page runs under a strict Content-Security-Policy: no
  inline script or style (see `DESIGN.md`).

### Adding a site

Every site is a module, and one list (`src/engine/sites.ts`) feeds both the app (which
makes its sources from it) and the proxy (which takes its allowlist and Referers from
it), so a site cannot be readable in one and refused by the other.

1. Check that the site can be read at all: run the **Probe** workflow (Actions tab →
   *Run workflow*, one address per line). It fetches the pages the way the proxy does and
   prints them in its log. A site that answers `403` with *Just a moment…* checks its
   visitors with an anti-bot challenge, which neither the proxy nor the probe can pass:
   it cannot be read from the web app.
   (Scan-Manga is behind such a check, and it is read in the APK: `nativeOnly` in its module.)
2. Write a `Source` subclass in `src/engine/source/<site>/` (recognise a link, read a
   series, a listing, a chapter). Look at `webtoon/` for a small one. It also says how
   its content is meant to be read, which is what *Auto* stands for in the settings:
   `readonly reading = { mode: 'paged', rtl: true }` for a manga (turned pages, right to
   left), `{ mode: 'scroll', rtl: false }` for a webtoon (one column). It also lists the
   languages the site publishes in, its default first (`readonly languages = ['en']`), and
   gives its home and search addresses for each of them (`homeIn`, `searchIn`).
3. Describe the site in `src/engine/source/<site>/module.ts`: its id and name, its
   hosts (pages **and** image servers), the Referer its image servers expect, and how to
   make the source. See `webtoon/module.ts`.
4. List the module in `src/engine/sites.ts`.
5. Add one entry for it to `SAMPLES` in `test/engine/sites.test.ts` (a series link and a
   chapter link). The conformance tests then check that its links are recognised in one
   canonical form, that it claims nothing that is not its own, that it says how it is
   read, and that the proxy allows everything it reads. Then test its parsing on small
   fixtures, like `test/engine/WebtoonSource.test.ts`.

Prefer URLs and `<meta>` tags to CSS class names when reading a page: they survive
redesigns better.

### The APK

The native platform reads sites through the phone's network and uses a WebView for
human checks and script-built chapter images. Scan-Manga and SushiScan are available
in the APK. See [NATIVE.md](NATIVE.md) for rendering, diagnostics and offline storage.

## Tests

```sh
npm run check        # types (app and worker) and the 440 unit tests
npm run test:e2e     # real Chromium (npx playwright install chromium); screenshots in test-output/
npm run test:e2e -- webtoon     # one flow: fanfox, webtoon, browse, desktop, offline
npm run test:e2e -- regressions # shared storage and native image regressions
npm run test:e2e -- backup      # backups, byte budgets and responsive layout
npm run test:e2e -- native-sources # native composition, six sources and captured images
npm run icons        # regenerate the PNG icons from public/icons/icon.svg
```

## Safety notes

- Library details, reading positions and finished chapters are stored separately, so
  one tab cannot replace another tab's whole library. Existing data is migrated on
  first use; its old storage records remain as a recovery copy until the library is
  cleared. If storage is full, online reading still works and this session keeps its
  unsaved library changes in memory.

- The proxy relays only allowlisted hosts (redirects included), only over https, raster
  images only, with size and time limits. Pages it relays are served as `text/plain`. The
  installed app applies the same rules to what it fetches itself.
- The app never executes code from a site and never inserts a site's markup into the
  page: it reads text and attributes and builds its own elements, under a strict
  Content-Security-Policy (`proxy/ContentPolicy.ts`, sent as a header by the Node entry and
  put in the page by the build for hosts that cannot send headers).
- Your library and progress live in the browser only. Just Read keeps no manga on any
  server: it displays what the sites you point it at serve, subject to their terms and to
  the law where you live.
