# Just Read

Paste a link, read it here. The app becomes the reader of the site the link points
to: a library, your place in every series, reading as a scrolling column or page by
page, what you already read stays available offline, and chapters can be downloaded
for a journey with no network. An Android app made with Capacitor, built for a phone,
and it does not look like a website.

Sites it reads: **FanFox** (MangaFox), which publishes in English only; **WEBTOON**, in
English and French; **LelScan**, French scans of a few dozen series; **Scan-Manga** and
**SushiScan**, in French; and **Demonic Scans**, in English. The app itself is in English
and French.

The app reads the sites from the phone itself (`src/platform/native/`): the phone's own
network stack has no CORS to obey and may send the Referer that image servers want, and a
WebView of the app passes the anti-bot check some sites have. There is no server of
Just Read anywhere.

The language of the series is not the language of the app: WEBTOON opens its catalogue in
the language of the app, unless *Settings → Reading → Series language* says otherwise, and
Discover names the language it is showing. The text of a manga is part of its pictures, so
what a site publishes in English stays English whatever the settings say.

Each site is read the way it is meant to be: FanFox and LelScan as turned pages from right
to left, like a printed manga; WEBTOON as one long column. *Settings → Reading* (or the options
inside the reader) starts on **Auto**, which follows the site; choosing *Scroll*, *Pages*,
*Left to right* or *Right to left* overrides it for every site, and *Auto* gives the
decision back.

*Settings → Data* exports the library, current pages and finished chapters as versioned
JSON, shown with a copy button (save the copied text as a `.json` file to import it
elsewhere). Importing validates the whole file (up to 5 MiB) before merging: newer
progress wins, finished chapters are combined, and unrelated series stay. Backups exclude
downloaded images.

The library marks the chapters that came out since a series was last opened, filters its shelf and
Discover's results by genre (keep some, leave others out) and downloads chapters to read with no network: see
[LIBRARY.md](LIBRARY.md).

What is read is also kept (the reading cache), bounded by **128 MiB / 400 images** and
**16 MiB / 80 pages**. Actual decoded bytes are counted; oldest copies leave first. An
answer larger than its budget stays readable online without displacing other copies.

## Install it

`.github/workflows/apk.yml` builds the APK whenever the app changes and publishes the default
branch as the pre-release **apk-latest**. Other branches produce an artifact for testing; they
cannot replace the public APK. On a phone, open
`https://github.com/hugo-burnet/just-note/releases/download/apk-latest/just-read.apk`: the file
downloads as it is, and Android asks once to allow installs from the browser. Every build is
signed with the same key and numbered after the run, so a newer APK installs over an older one
and keeps the library. That key is `android/app/debug.keystore`, public on purpose: this is an
app you install yourself, not a store release.

On a computer, with Node 22.18 or later, JDK 21 and the Android SDK:

```sh
npm install
npm run build        # the app's files, in dist/
npm run apk          # build, copy into android/, and make the APK
```

## Status: read this first

- **Verified:** the unit tests, and an end-to-end run in a real Chromium of the very files that
  go in the APK, with what they would ask of the phone's network answered by *pretend* FanFox,
  WEBTOON and LelScan sites (made-up titles, generated images; see *Tests*). It covers a phone
  and a desktop screen, both themes, both languages, both reading modes, and the network cut.
- **Regression checks:** two instances of the app keep each other's library and progress, and
  changes from another one update the visible shelf. The native TypeScript reader is
  also exercised in Chromium: retries in both modes, nearby image loading, and a
  140-image chapter revisited offline after unused blob addresses have been released.
  Its native composition also lists all six sources and opens Scan-Manga and SushiScan
  against fixture pages, using the real native TypeScript transport and blob images.
  These checks do not replace running the APK on a phone.
- **Backups and layout:** the backup shown to be copied, invalid file rejection, restoration
  after reload, byte budgets under concurrent writes, keyboard card
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
- Some sites check their visitors with an anti-bot challenge (Cloudflare's *Just a moment…*), which only a
  real browser passes. Scan-Manga and SushiScan are two (their mobile sites too). The app asks from the
  phone, but it runs no JavaScript for that, so a check turns it away: there, a WebView of the app passes the
  check (see [NATIVE.md](NATIVE.md)), and *Settings → Diagnostic* copies a report of what the site sends,
  which is what a module is written from.
- **SushiScan** was written from four phone reports (the home page, a series, a chapter, a search): the phone's
  own network is answered 200 with no check, a series is `/catalogue/<name>/` with its chapters in
  `#chapterlist`, a chapter is `/<name>-chapitre-<n>/` and its reader is given the pictures in a script
  (`"images":[…]`, on `c.sushiscan.net`), and the way back to its series is the one link to `/catalogue/<name>/`
  in it. A series says what it is (manga, manhua…), which sets how it is read (`Series.reading`). On a phone, by the
  author's report: the search and the covers work, a series page gives its title, author, genres and synopsis, its
  volumes are listed (they are in a list of their own, which is read since), and a volume's page finds its 193
  pictures. **But the pictures themselves were not shown** (each frame said *Retry*): the phone could not have them
  from `c.sushiscan.net`, for a reason the next report, which says it, is to give.
- **Filtering Discover by genre** reads the first page of each result (its cover and genres, never its chapters)
  and is checked in Chromium and on pretend pages shaped like each site's, series with chapters and without.
  **Not verified on a phone**: what each real site's series page says of its genres (the machine this was written
  on could not reach them). If a site's results do not all get their genres, the app says how many could not be
  read, with *Try again*; and *Settings → Diagnostic* on a series page of that site has a section
  (*the first mention of a genre*) that shows where the page lists them. See [LIBRARY.md](LIBRARY.md).
- **Downloads and new chapters** are checked in Chromium (see *Tests*): a chapter never read is
  downloaded with its button, the network is cut, and every page of it opens; the shelf
  marks the series as downloaded and with new chapters. **Not verified on a phone**: there the
  pictures are kept in the WebView's Cache API, and a Scan-Manga chapter is downloaded the
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
- If an image host is missing from a site's module the app says *Blocked address* and
  names the host: add it to the hosts of that module (`src/engine/source/<site>/module.ts`).
- Chapters whose page list is built from one-off token requests (an older FanFox
  layout) cannot be reopened offline; the others can.

## How it is built

```
src/engine/     the pure engine: sources, catalog, library, settings, reading logic
src/platform/   what the phone provides: its own network and WebView (native/), the WebView's storage and parser (webview/)
src/ui/         screens and components, written as classes, with no framework
android/        the Capacitor project of the APK
scripts/        the Vite plugin that puts the security policy in the page
test/           unit tests, fixtures, the end-to-end run
```

- **A pure engine.** `src/engine` touches no DOM, no network and no storage. It is given
  three ports (`Transport`, `HtmlParser`, `KeyValueStore`, see `src/engine/ports.ts`);
  a test fails if any engine file mentions a browser or Node global.
- **A platform seam.** `src/platform/Platform.ts` is everything the app takes from the
  phone. `NativePlatform` is the phone's; the tests give the app fakes, and the engine and
  the screens do not notice.
- **Object-oriented, small.** Classes with one job each; no hand-written file is longer
  than 300 lines (a test enforces it, `package-lock.json` aside).
- **Strict by default.** TypeScript in strict mode, with only syntax that can be erased
  (so Node runs it as it is). The page runs under a strict Content-Security-Policy: no
  inline script or style (see `DESIGN.md`).

### Adding a site

Every site is a module, and one list (`src/engine/sites.ts`) gives the app both its
sources and the hosts it may reach (with the Referer each wants), so a site cannot have a
source and be out of reach.

1. Check that the site can be read at all: run the **Probe** workflow (Actions tab →
   *Run workflow*, one address per line). It fetches the pages from GitHub's machines and
   prints them in its log. A site that answers `403` with *Just a moment…* checks its
   visitors with an anti-bot challenge, which the probe cannot pass: look at it from the
   phone instead, with *Settings → Diagnostic*, which passes it in a WebView.
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
   read, and that the app may reach everything it reads. Then test its parsing on small
   fixtures, like `test/engine/WebtoonSource.test.ts`.

Prefer URLs and `<meta>` tags to CSS class names when reading a page: they survive
redesigns better.

### The APK

The app reads sites through the phone's network and uses a WebView for human checks and
script-built chapter images. See [NATIVE.md](NATIVE.md) for rendering, diagnostics and
offline storage.

## Tests

```sh
npm run check        # types and the unit tests
npm run test:e2e     # real Chromium (npx playwright install chromium); screenshots in test-output/
npm run test:e2e -- webtoon     # one flow: fanfox, webtoon, lelscan, browse, desktop, offline
npm run test:e2e -- regressions # shared storage and native image regressions
npm run test:e2e -- backup      # backups, byte budgets and responsive layout
npm run test:e2e -- native-sources # the six sources, and pictures captured by a WebView
```

The end-to-end run builds the app as for the APK and serves it from one origin, as Capacitor
does (`test/e2e/Stage.ts`), composed as `src/main.ts` composes it but over a pretend network
(`test/e2e/TestApp.ts`): what the app would ask of the phone goes to the stage, which has the
pretend sites answer. Cutting that network is how the offline flow is run.

## Safety notes

- Library details, reading positions and finished chapters are stored separately, so
  one tab cannot replace another tab's whole library. Existing data is migrated on
  first use; its old storage records remain as a recovery copy until the library is
  cleared. If storage is full, online reading still works and this session keeps its
  unsaved library changes in memory.

- The app reaches only the hosts of the sites it reads (redirects included, see
  `src/platform/native/HostPolicy.ts`), only over https, raster images only, with size and
  time limits.
- The app never executes code from a site and never inserts a site's markup into the
  page: it reads text and attributes and builds its own elements, under a strict
  Content-Security-Policy, put in the page by the build (`scripts/vite/securityPolicy.ts`).
- Your library and progress live on the phone only. Just Read keeps no manga on any
  server: it displays what the sites you point it at serve, subject to their terms and to
  the law where you live.
