import { imageSrc } from '../api.js';
import { loadChapter, loadSeries } from '../catalog.js';
import { t } from '../i18n.js';
import { back, hashFor, redirect, replace } from '../router.js';
import { resolve } from '../sources/index.js';
import { progress, settings } from '../store.js';
import { errorBox, h, icon, segmented, spinner, toast } from '../ui.js';

const clamp = (n, min, max) => Math.min(Math.max(n, min), max);

export function mount(root, { u }) {
  const target = resolve(u);
  if (target?.kind !== 'chapter') {
    redirect(hashFor.home());
    return;
  }
  const { source } = target;
  const disposers = [];
  let alive = true;

  const screen = h('div', { class: 'reader' });
  root.append(screen);
  load();

  async function load() {
    screen.replaceChildren(h('div', { class: 'reader-status' }, spinner(), t('reader.loading')));
    try {
      const [chapter, series] = await Promise.all([
        loadChapter(source, target.url),
        // Neighbouring chapters are a bonus: the chapter itself is the point.
        loadSeries(source, target.seriesUrl).catch(() => null),
      ]);
      if (alive) run({ screen, target, source, pages: chapter.pages, series, disposers, isAlive: () => alive });
    } catch (err) {
      if (!alive) return;
      screen.replaceChildren(
        h('div', { class: 'reader-status' },
          errorBox(err, { retry: load }),
          h('a', { class: 'btn', href: hashFor.series(target.seriesUrl) }, t('reader.backToList'))),
      );
    }
  }

  return () => {
    alive = false;
    for (const dispose of disposers.splice(0)) dispose();
  };
}

function run({ screen, target, source, pages, series, disposers, isAlive }) {
  const { seriesUrl } = target;
  const chapters = series?.chapters ?? [];
  const index = chapters.findIndex((chapter) => chapter.url === target.url);
  const prevChapter = index > 0 ? chapters[index - 1] : null;
  const nextChapter = index >= 0 ? (chapters[index + 1] ?? null) : null;
  const chapterTitle = chapters[index]?.title ?? target.key;
  document.title = `${series?.title ?? ''} ${chapterTitle} · ${t('app.name')}`.trim();

  const saved = progress.get(seriesUrl);
  let page = saved?.chapter === target.url ? clamp(saved.page, 0, pages.length - 1) : 0;
  let { mode, rtl } = settings.get();
  let frames = [];
  let observer = null;
  let pagedBox = null;
  let pagedImage = null;
  let showToken = 0;
  let prefetched = false;
  let saveTimer = 0;

  // ---- chrome (top bar, bottom bar, options) --------------------------------

  const counter = h('span', { class: 'reader-counter' });
  const slider = h('input', {
    type: 'range',
    min: 1,
    max: pages.length,
    step: 1,
    value: page + 1,
    'aria-label': t('reader.page'),
    oninput: () => goTo(Number(slider.value) - 1),
  });

  function chapterLink(chapter, iconName, label) {
    return h('a', {
      class: `icon-btn${chapter ? '' : ' disabled'}`,
      href: chapter ? hashFor.read(chapter.url) : null,
      'aria-label': label,
      'aria-disabled': chapter ? null : 'true',
      onclick: (event) => {
        event.preventDefault();
        if (chapter) replace(hashFor.read(chapter.url));
      },
    }, icon(iconName));
  }

  const optionsButton = h('button', {
    class: 'icon-btn',
    type: 'button',
    'aria-label': t('reader.options'),
    'aria-expanded': 'false',
    onclick: () => setSheet(sheet.hidden),
  }, icon('settings'));

  const sheet = h('div', { class: 'sheet', hidden: true, role: 'dialog', 'aria-label': t('reader.options') },
    h('div', { class: 'sheet-row' },
      h('span', {}, t('reader.mode')),
      segmented([['scroll', t('reader.scroll')], ['paged', t('reader.paged')]], mode, changeMode, t('reader.mode'))),
    h('div', { class: 'sheet-row only-paged' },
      h('span', {}, t('reader.direction')),
      segmented([['ltr', t('reader.ltr')], ['rtl', t('reader.rtl')]], rtl ? 'rtl' : 'ltr', (value) => changeDirection(value === 'rtl'), t('reader.direction'))));
  sheet.dataset.mode = mode;

  const stage = h('div', { class: 'stage' });
  const top = h('header', { class: 'chrome chrome-top' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('reader.back'), onclick: () => back(hashFor.series(seriesUrl)) }, icon('chevronLeft')),
    h('div', { class: 'reader-title' }, h('strong', {}, series?.title ?? ''), h('span', {}, chapterTitle)),
    counter);
  const bottom = h('footer', { class: 'chrome chrome-bottom' },
    chapterLink(prevChapter, 'chevronLeft', t('reader.prev')),
    slider,
    chapterLink(nextChapter, 'chevronRight', t('reader.next')),
    optionsButton);
  screen.replaceChildren(stage, top, bottom, sheet);

  function setSheet(open) {
    sheet.hidden = !open;
    optionsButton.setAttribute('aria-expanded', String(open));
  }

  function setChromeHidden(hidden) {
    screen.classList.toggle('chrome-hidden', hidden);
    if (hidden) setSheet(false);
  }

  const toggleChrome = () => setChromeHidden(!screen.classList.contains('chrome-hidden'));

  function updateCounter() {
    counter.textContent = `${page + 1} / ${pages.length}`;
    slider.value = page + 1;
  }

  // ---- position -----------------------------------------------------------

  function save() {
    clearTimeout(saveTimer);
    progress.set(seriesUrl, { chapter: target.url, key: target.key, title: chapterTitle, page });
  }

  function afterPageChange() {
    updateCounter();
    clearTimeout(saveTimer);
    saveTimer = setTimeout(save, 500);
    if (page >= pages.length - 1) progress.markRead(seriesUrl, target.key);
    if (!prefetched && nextChapter && page >= pages.length * 0.6) prefetch();
  }

  function setPage(next) {
    if (next === page) return;
    page = next;
    afterPageChange();
  }

  // Warm the next chapter while this one is being read.
  function prefetch() {
    prefetched = true;
    loadChapter(source, nextChapter.url)
      .then(({ pages: upcoming }) => {
        if (isAlive()) new Image().src = imageSrc(upcoming[0]);
      })
      .catch(() => {});
  }

  function goTo(i) {
    const to = clamp(i, 0, pages.length - 1);
    if (mode === 'paged') showPaged(to);
    else frames[to]?.scrollIntoView({ block: 'start' });
  }

  function step(delta) {
    const to = page + delta;
    if (to >= pages.length) {
      if (nextChapter) replace(hashFor.read(nextChapter.url));
      else toast(t('reader.last'));
    } else if (to < 0) {
      if (prevChapter) replace(hashFor.read(prevChapter.url));
    } else {
      showPaged(to);
    }
  }

  // ---- scroll mode ----------------------------------------------------------

  function makeFrame(src, i) {
    const img = h('img', { alt: '', decoding: 'async', loading: 'lazy', draggable: false });
    const box = h('div', { class: 'frame loading', dataset: { index: i } }, img);
    let attempt = 0;
    const load = () => {
      box.classList.remove('failed');
      box.classList.add('loading');
      img.src = imageSrc(src) + (attempt ? `&r=${attempt}` : '');
    };
    img.addEventListener('load', () => box.classList.remove('loading'));
    img.addEventListener('error', () => {
      box.classList.remove('loading');
      box.classList.add('failed');
    });
    box.append(h('button', { class: 'btn retry', type: 'button', onclick: () => { attempt++; load(); } }, t('reader.retryImage')));
    load();
    return box;
  }

  function endPanel() {
    return h('section', { class: 'end' },
      h('p', {}, t('reader.end', { chapter: chapterTitle })),
      nextChapter
        ? h('a', { class: 'btn btn-primary', href: hashFor.read(nextChapter.url), onclick: (event) => { event.preventDefault(); replace(hashFor.read(nextChapter.url)); } }, t('reader.next'), icon('arrowRight', 18))
        : h('p', { class: 'muted' }, t('reader.last')),
      h('a', { class: 'btn', href: hashFor.series(seriesUrl) }, t('reader.backToList')));
  }

  function renderScroll() {
    frames = pages.map(makeFrame);
    stage.className = 'stage stage-scroll';
    stage.replaceChildren(h('div', { class: 'strip' }, ...frames, endPanel()));

    // The page being read is the one crossing a thin band in the middle of the screen.
    observer = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) setPage(Number(entry.target.dataset.index));
    }, { root: stage, rootMargin: '-45% 0px -45% 0px' });

    const startPage = page;
    requestAnimationFrame(() => {
      frames[startPage]?.scrollIntoView({ block: 'start' });
      // Observe only once we are where we left off, or the first frame wins.
      if (observer) for (const frame of frames) observer.observe(frame);
    });
  }

  // ---- paged mode -----------------------------------------------------------

  async function showPaged(to, retry = false) {
    const token = ++showToken;
    const moved = to !== page;
    page = clamp(to, 0, pages.length - 1);
    if (moved) afterPageChange();
    else updateCounter();

    pagedBox.classList.remove('failed');
    pagedBox.classList.add('busy');
    const src = imageSrc(pages[page]) + (retry ? `&r=${Date.now()}` : '');
    // Keep showing the previous page until the next one is ready to paint.
    const probe = new Image();
    probe.src = src;
    try {
      await probe.decode();
    } catch {
      // The <img> below reports the failure.
    }
    if (token !== showToken) return;
    pagedImage.src = src;
    for (const i of [page + 1, page + 2, page - 1]) if (pages[i]) new Image().src = imageSrc(pages[i]);
  }

  function onPagedTap(event) {
    if (event.target.closest('button')) return;
    const x = event.clientX / window.innerWidth;
    const forward = rtl ? x < 0.3 : x > 0.7;
    const backward = rtl ? x > 0.7 : x < 0.3;
    if (forward) step(1);
    else if (backward) step(-1);
    else toggleChrome();
  }

  function renderPaged() {
    pagedImage = h('img', { class: 'single', alt: '', draggable: false, decoding: 'async' });
    pagedImage.addEventListener('load', () => pagedBox.classList.remove('busy'));
    pagedImage.addEventListener('error', () => {
      pagedBox.classList.remove('busy');
      pagedBox.classList.add('failed');
    });
    pagedBox = h('div', { class: 'paged' },
      pagedImage,
      h('button', { class: 'btn retry', type: 'button', onclick: () => showPaged(page, true) }, t('reader.retryImage')));
    stage.className = 'stage stage-paged';
    stage.replaceChildren(pagedBox);

    pagedBox.addEventListener('click', onPagedTap);
    let touchStart = null;
    pagedBox.addEventListener('touchstart', (event) => {
      touchStart = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    }, { passive: true });
    pagedBox.addEventListener('touchend', (event) => {
      const zoomed = (window.visualViewport?.scale ?? 1) > 1.05;
      if (!touchStart || zoomed) return;
      const touch = event.changedTouches[0];
      const dx = touch.clientX - touchStart.x;
      const dy = touch.clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step((rtl ? dx > 0 : dx < 0) ? 1 : -1);
    }, { passive: true });

    showPaged(page);
  }

  // ---- modes ------------------------------------------------------------------

  function render() {
    observer?.disconnect();
    observer = null;
    showToken++; // a pending decode must not paint into the new view
    slider.dir = mode === 'paged' && rtl ? 'rtl' : 'ltr';
    if (mode === 'paged') renderPaged();
    else renderScroll();
    updateCounter();
  }

  function changeMode(value) {
    if (value === mode) return;
    mode = value;
    settings.set({ mode });
    sheet.dataset.mode = mode;
    render();
  }

  function changeDirection(value) {
    rtl = value;
    settings.set({ rtl });
    slider.dir = mode === 'paged' && rtl ? 'rtl' : 'ltr';
  }

  // ---- events -----------------------------------------------------------------

  function onKey(event) {
    if (event.target instanceof HTMLInputElement || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'Escape') {
      back(hashFor.series(seriesUrl));
      return;
    }
    if (mode !== 'paged') return;
    const forward = { ArrowRight: !rtl, ArrowLeft: rtl, ArrowDown: true, PageDown: true, ' ': true }[event.key];
    const backward = { ArrowLeft: !rtl, ArrowRight: rtl, ArrowUp: true, PageUp: true }[event.key];
    if (forward || backward) {
      event.preventDefault();
      step(forward ? 1 : -1);
    }
  }

  const onHidden = () => {
    if (document.visibilityState === 'hidden') save();
  };
  const hideOnGesture = () => setChromeHidden(true);

  stage.addEventListener('click', (event) => {
    if (mode === 'scroll' && !event.target.closest('a, button')) toggleChrome();
  });
  stage.addEventListener('touchmove', hideOnGesture, { passive: true });
  stage.addEventListener('wheel', hideOnGesture, { passive: true });
  document.addEventListener('keydown', onKey);
  document.addEventListener('visibilitychange', onHidden);
  window.addEventListener('pagehide', save);
  disposers.push(() => {
    observer?.disconnect();
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onHidden);
    window.removeEventListener('pagehide', save);
    save(); // leaving the chapter keeps the place
  });

  render();
  afterPageChange();
}
