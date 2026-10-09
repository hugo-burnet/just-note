# Design notes

The brief: it must look like an app, not like a website, and it must survive the move to
an APK. These are the decisions behind what is on screen, so that the next screen follows
them. The screenshots of every screen are produced by `npm run test:e2e`
(`test-output/`).

## Ink and paper

A reader is used at night, in bed, on a phone. So: **dark by default** (a light theme
exists and follows the system), a near-black with a hint of blue, warm off-white text, and
**one accent**, a persimmon orange, for what can be done next (play, continue, open).
Everything else is shades of the same ink.

- Colours are OKLCH, so that steps of lightness look even. A hex block under
  `@supports not (color: oklch(0 0 0))` covers old web views.
- Type: **Bricolage Grotesque** for titles (tight, a little characterful), **Instrument
  Sans** for the interface. Both are variable fonts, self-hosted (no request to a font
  service, nothing to block offline), with their licences next to them in
  `src/assets/fonts/`.
- A faint paper grain over the dark areas keeps them from looking like a flat
  rectangle. It costs one fixed layer and no request.
- The scale is small and used strictly: spacing `--s-1…7`, type `--fs-xs…3xl`, radii
  `--r-s…xl`, `--r-pill`. New CSS uses the tokens, not numbers.

## What makes it feel like an app

- **A floating dock** instead of a header menu: three labelled tabs, with an orange
  highlight on the active one. It steps aside when the keyboard is up and on pushed
  screens (a series, the reader).
- **Large titles that collapse** (as on iOS): the big title scrolls away and a small one
  takes its place in a bar that frosts once content slides under it. Root screens add a
  short subtitle and a quiet brand line to make their purpose clear.
- **A readable shelf:** two columns even on a small phone, rounded cover cards with
  visible reading counts, and a separate keyboard-accessible action button. Desktop
  adds columns within the same readable width. Settings use two columns on wide screens.
- **One row of sites:** in Explorer the sources are a single line of chips that scrolls
  sideways rather than wrapping onto a second line, runs to the screen edges and fades
  there (a cut-off chip says there is more); the site being browsed is scrolled into view.
- **Data stays understandable:** the backup panel explains how imports merge progress,
  reports errors inline, and keeps the erase action apart from export and import.
- **Screens that move like screens**: a pushed screen slides in from the right, and going
  back brings the previous one in from the left; tabs cross-fade. The router numbers its
  history entries to know which way it is going, and Back never leaves the app by
  accident.
- **Bottom sheets** for anything modal: "add by link", confirmations, reading options.
  Drag down, tap outside or press Escape to close.
- **Pressable**: everything that can be pressed gives a little under the finger.
- **Selection is off** except in places where text is worth copying (error details).
- **No scrollbars**, safe-area insets everywhere (notches, the home indicator), 44 px
  touch targets, `prefers-reduced-motion` honoured.

## The cover lights the page

A series page takes its colour from its cover: the image is sampled (24×24 pixels, as a
mean of hues in OKLab where each pixel weighs as much as it is colourful, so the greys,
blacks and whites of a page do not decide) and the result replaces the accent on that
page, under a blurred, enlarged copy of the cover. The same series therefore looks
green on one shelf and purple on another, and the library's "continue reading" card
carries the same glow. When a cover cannot be read (no CORS, no image) the page simply
keeps the app's accent.

## The reader

The reader is the product, so it is the most restrained screen.

- **Always dark**, whatever the theme (white pages, dark frame), and the status bar
  follows. The sheets that open over it wear the dark palette too.
- **The page gets the whole screen.** Controls are two soft shades and a pill, they show
  for a moment when a chapter opens, hide when you scroll or pinch, and come back with a
  tap in the middle.
- **Two modes.** *Scroll* is a column, as webtoons want it: the page being read is the
  one crossing a thin band in the middle of the screen. The column does not stop at the
  end of a chapter: as the end comes near, the next chapter is put under it, behind a
  short divider that names it, and scrolling carries on into it (the title, the counter,
  the address and the saved place follow). The latest chapter ends with a card
  saying you are up to date. *Pages* is a book: tap an edge, swipe or use the arrow keys;
  the next page is decoded before it replaces the current one, so nothing flashes.
- **Direction** (left to right or right to left) only exists for turned pages. A column
  always reads downwards, and its slider always runs from the left.
- **Each site is read the way it is meant to be.** A source says how its content is read
  (`Source.reading`): FanFox and LelScan are turned pages from right to left, like the
  printed manga they come from; WEBTOON is one long column. *Auto*, the default for both the mode and the
  direction, follows the site. Choosing *Scroll*, *Pages*, *Left to right* or *Right to
  left* overrides it on every site, and *Auto* gives the decision back. A choice made in
  the reading options applies at once, on the page being read (the page is kept when a
  chapter turns from pages into a column and back). The settings of the first versions
  stored the direction as a yes or no; it is read as a choice of direction.
- **Your place is kept** without writing at every scroll event: after a pause, when the
  page is hidden, and when you leave. A chapter left on its last page counts as finished
  and is read again from the start; one left anywhere else resumes where you stopped.

## States are screens too

Empty shelves, loading, failures and the offline state have the same care as the happy
path: skeletons shaped like the content they stand for, an error panel that says in plain
words what happened and what to try, with *Copy details* for the cases that need a fix
in an adapter.

## Constraints that shaped the code

- **A strict Content-Security-Policy**: `style-src 'self'`, so no `style=""` attribute and
  no inline `<style>`. Values that change at run time (a tint, a progress bar, a slider
  fill) go through CSS custom properties set with the CSSOM, and the stylesheet does the
  rest.
- **No third-party markup in the page.** Screens are built with `h()` (`src/ui/core/dom.ts`),
  which creates elements and sets text; there is no `innerHTML` anywhere.
- **No framework.** Screens are classes with an owner of listeners and timers
  (`Component`), so leaving a screen never leaves anything running. The whole app is
  built with Vite, and Capacitor puts the result in the APK.
- **It runs in a WebView**: relative asset paths, hash addresses, and what is kept offline
  is kept by the app itself (the WebView's Cache API).
