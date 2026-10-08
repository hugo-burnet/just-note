# Just Read

Paste a link, read it here. The app becomes the reader of the site the link points
to: a library, your place in every series, reading as a scrolling column or page by
page, and what you already read stays available offline. Built for a phone first
(a PWA today, an APK with Capacitor later), and it does not look like a website.

Sites it reads: **FanFox** (MangaFox) and **WEBTOON**. English and French.

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
allowlist of hosts only, so it is not an open proxy. A native build will not need it.

It has to be *this* proxy. A public one found online (corsproxy.io and the like) will
not do: it speaks another protocol (the app asks for `/api/html` and `/api/img`), it does
not send the site's Referer, so the pages would come without their images, and whoever
runs it sees everything you read and can alter what you are shown.

## Status: read this first

- **Verified:** 130 unit tests, and an end-to-end run in a real Chromium against
  *pretend* FanFox and WEBTOON sites served by the test itself (made-up titles,
  generated images). It covers a phone and a desktop screen, both themes, both
  languages, both reading modes, a link shared to the app, and the installed app
  offline with its servers switched off. The app and the proxy run on two different
  origins there, as they do on GitHub Pages with a Worker.
- **Not verified: the two adapters against the real sites.** They were written from
  what is known of the sites and tested on synthetic pages shaped like them (the
  machine this was built on could not reach either site). Expect the first real run
  to need an adjustment. When a page cannot be read, the error screen has a
  **Copy details** button: paste its content to get the adapter fixed.
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
     `proxy/` changes; or
   - run `npx wrangler login` and `npx wrangler deploy`; or
   - in the Cloudflare dashboard: *Workers & Pages → Create → Import a repository*, pick
     this repository, name the Worker `just-read-proxy` (it must match `wrangler.toml`)
     and keep the default deploy command.
3. **Settings → Secrets and variables → Actions → Variables:** add `PROXY_URL` with the
   address of that Worker. It becomes the default *Proxy address* of the app (users can
   change it in Settings).
4. Push to the default branch. `.github/workflows/pages.yml` checks, builds and
   publishes; other branches only run `ci.yml`.

On the phone: open the page, then *Install app* / *Add to Home Screen*. On Android,
**Share → Just Read** from the browser then opens a link directly (iOS has no share
target: paste the link instead).

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
src/platform/   what the machine provides: the web's (localStorage, fetch through the proxy)
src/ui/         screens and components, written as classes, with no framework
src/sw/         the service worker: strategy classes, built next to the app
proxy/          the proxy, written with the Fetch API only: runs on Node and on Workers
scripts/        Vite plugins (service worker, security policy, dev proxy), icons
test/           unit tests, fixtures, the end-to-end run
```

- **A pure engine.** `src/engine` touches no DOM, no network and no storage. It is given
  three ports (`Transport`, `HtmlParser`, `KeyValueStore`, see `src/engine/ports.ts`);
  a test fails if any engine file mentions a browser or Node global. That is what lets
  the same engine run in the browser now and inside Capacitor later.
- **A platform seam.** `src/platform/Platform.ts` is everything the app takes from the
  machine. `WebPlatform` is the browser's. Nothing else changes for a native build.
- **Object-oriented, small.** Classes with one job each; no hand-written file is longer
  than 300 lines (a test enforces it, `package-lock.json` aside).
- **Strict by default.** TypeScript in strict mode, with only syntax that can be erased
  (so Node runs it as it is). The page runs under a strict Content-Security-Policy: no
  inline script or style (see `DESIGN.md`).

### Adding a site

1. Write a `Source` subclass in `src/engine/source/<site>/` (recognise a link, read a
   series, a listing, a chapter). Look at `webtoon/` for a small one.
2. Register it in `src/ui/App.ts`.
3. Add its hosts, and those of its image CDNs, to `proxy/sites.ts`.
4. Test it on small fixtures, like `test/engine/WebtoonSource.test.ts`.

Prefer URLs and `<meta>` tags to CSS class names when reading a page: they survive
redesigns better.

### The APK, later

The app is ready for Capacitor: the build is relative (`base: './'`), the screens use
hash addresses, and the engine only knows ports. What is left is a `NativePlatform`
(`CapacitorHttp` for pages and images, so no proxy), a `main.native.ts` that builds
the app on it without registering the service worker, and `npx cap add android`.

## Tests

```sh
npm run check        # types (app and worker) and the 130 unit tests
npm run test:e2e     # real Chromium (npx playwright install chromium); screenshots in test-output/
npm run test:e2e -- webtoon     # one flow: fanfox, webtoon, browse, desktop, offline
npm run icons        # regenerate the PNG icons from public/icons/icon.svg
```

## Safety notes

- The proxy relays only allowlisted hosts (redirects included), only over https, raster
  images only, with size and time limits. Pages it relays are served as `text/plain`.
- The app never executes code from a site and never inserts a site's markup into the
  page: it reads text and attributes and builds its own elements, under a strict
  Content-Security-Policy (`proxy/ContentPolicy.ts`, sent as a header by the Node entry and
  put in the page by the build for hosts that cannot send headers).
- Your library and progress live in the browser only. Just Read keeps no manga on any
  server: it displays what the sites you point it at serve, subject to their terms and to
  the law where you live.
