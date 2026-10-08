# Just Read

Paste a link, read it here. A small PWA that turns a manga-site link into a clean
reader: library, reading progress, scroll or page-by-page reading, and what you
already read stays available offline. The interface is in English and French.

```
 phone / browser            this repo                          the site
┌──────────────────┐      ┌───────────────────┐      ┌─────────────────────┐
│  PWA  (public/)  │ ───► │  proxy  (server/) │ ───► │  pages and images   │
│  + site adapters │ ◄─── │  allowlist,       │ ◄─── │                     │
└──────────────────┘      │  Referer, caps    │      └─────────────────────┘
                          └───────────────────┘
```

Why a proxy: a browser is not allowed to read another site's pages (CORS), and
image CDNs refuse requests that do not carry the site's Referer. The proxy only
relays an allowlist of hosts, so it is not an open proxy.

## Status: read this first

- **Verified:** 66 unit tests, and 25 end-to-end steps in a real Chromium (phone and
  desktop screens, dark theme, share link, service worker, offline with the server
  switched off) against a *pretend* site served by the test itself.
- **Not verified: the FanFox adapter against the real site.** It was written from
  what is known of the site's structure and tested on synthetic pages shaped like it
  (see `test/fixtures/` and `test/fanfox.test.js`); the machine it was built on could
  not reach the site. Expect the first real run to need an adjustment. When a page
  cannot be read, the error screen has a **Copy details** button: paste its content
  to get the adapter fixed.
- If the image host of the site is not in the allowlist, the app says *Blocked
  address* and names the host. Add it with `PROXY_EXTRA_HOSTS` (see below).
- Chapters whose page list is built from one-off token requests (the
  `chapterfun.ashx` layout) cannot be reopened offline; the others can.

## Run it

```sh
npm start                 # http://127.0.0.1:8787, this machine only
```

The server has no runtime dependency: Node 22 is enough (`npm install` is only
needed for the tests).

To use it as an installed app on a phone it must be served over **HTTPS**:

- quick try: run it on your computer and expose it with a tunnel
  (`cloudflared tunnel --url http://localhost:8787`, ngrok, …);
- for good: host it anywhere that runs Node (Render, Fly.io, Railway, a VPS…).
  Build step: none. Start command: `npm start`. When the platform sets `PORT`, the
  server listens on every interface by itself.

Then open the address on the phone and use the browser's *Install app* / *Add to
Home Screen*. On Android, once installed, **Share → Just Read** from the browser
opens a link directly. (iOS has no share target: paste the link, the app opens it as
soon as it is pasted.)

| Variable | Effect |
| --- | --- |
| `PORT`, `HOST` | where to listen (default `127.0.0.1:8787`; `0.0.0.0` when `PORT` is set) |
| `PROXY_EXTRA_HOSTS` | more hosts the proxy may reach, e.g. `cdn.example.com,img.example.net` |
| `CORS_ORIGIN` | only if the app is hosted on another address than the proxy; also fill in *Proxy address* in the app's Settings |

## Using it

- **Paste a link** to a series, a chapter, or a listing/search page of a supported
  site. *Browse* and *Search* work on the site itself.
- **Library:** every series you open is kept, with the chapter and page you stopped
  at, and the chapters you finished. *Continue reading* is one tap from the home page.
- **Reader:** *Scroll* (webtoon style) or *Pages* (tap the edges, swipe, arrow keys;
  left-to-right or right-to-left). Slider, previous/next chapter, the next chapter is
  prepared while you read.
- Everything is stored in the browser (`localStorage`); nothing is kept server-side.

## Adding a site

1. Write `public/js/sources/<site>.js` shaped like `fanfox.js` (the contract is at
   the top of `public/js/sources/index.js`: recognise a link, read a series, read a
   chapter, read a listing).
2. Register it in `public/js/sources/index.js`.
3. Add its hosts, and its image CDNs, to `server/hosts.js`.
4. Add the new file to `SHELL_FILES` in `public/sw.js` (a test fails until you do).
5. Test it on small fixtures like the ones in `test/fixtures/`.

Prefer URLs and `<meta>` tags to CSS class names when reading a page: they survive
redesigns better.

## Tests

```sh
npm test            # unit tests: proxy, adapters, unpacker, texts, PWA files
npm run test:e2e    # real Chromium (npx playwright install chromium); screenshots in test-output/
npm run icons       # regenerate the PNG icons from public/icons/icon.svg
```

## Layout

```
public/             the PWA, served as is (no build step)
  js/sources/       one adapter per site, plus the packed-script decoder
  js/views/         home, series, browse, reader, settings
  sw.js             offline shell, page cache, capped image cache
server/handler.js   the proxy, written with the Fetch API only (portable)
server/node.js      serves public/ and mounts the proxy
server/hosts.js     the allowlist
test/               unit tests, fixtures, end-to-end run
```

## Safety notes

- The proxy relays only allowlisted hosts (redirects included), only over https,
  raster images only, with size and time limits. Pages it relays are served as
  `text/plain`.
- The app never executes code from a site and never inserts a site's markup into the
  page: it reads text and attributes and builds its own elements (a test enforces it),
  under a strict Content-Security-Policy.
- Just Read keeps no manga on its server: it displays what the sites you point it at
  serve, subject to their terms and to the law where you live.
