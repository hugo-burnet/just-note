import { loadSeries } from '../catalog.js';
import { t, tn } from '../i18n.js';
import { back, hashFor, redirect } from '../router.js';
import { resolve } from '../sources/index.js';
import { library, progress, settings } from '../store.js';
import { cover, errorBox, h, icon, spinner, topbar } from '../ui.js';

export function mount(root, { u }) {
  const target = resolve(u);
  if (target?.kind !== 'series') {
    redirect(hashFor.home());
    return;
  }
  const { source, url } = target;
  let alive = true;

  const bar = topbar('', {
    onBack: () => back(hashFor.home()),
    actions: [h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('series.refresh'), onclick: () => load(true) }, icon('refresh'))],
  });
  const body = h('main', { class: 'page' });
  root.append(bar, body);
  load();

  async function load(fresh = false) {
    body.replaceChildren(h('div', { class: 'center' }, spinner()));
    try {
      const series = await loadSeries(source, url, { fresh });
      if (alive) render(series);
    } catch (err) {
      if (alive) body.replaceChildren(errorBox(err, { retry: () => load(true) }));
    }
  }

  function render(series) {
    document.title = `${series.title} · ${t('app.name')}`;
    bar.querySelector('.topbar-title').textContent = series.title;

    const position = progress.get(url);
    const resumeAt = position && series.chapters.find((chapter) => chapter.url === position.chapter);
    const startAt = resumeAt ?? series.chapters[0];

    body.replaceChildren(
      h('section', { class: 'series-head' },
        h('div', { class: 'series-cover' }, cover(series.cover, series.title)),
        h('div', { class: 'series-info' },
          h('h2', { class: 'series-title' }, series.title),
          series.author && h('p', { class: 'muted' }, series.author),
          h('p', { class: 'chips' },
            series.status && h('span', { class: 'chip chip-accent' }, series.status),
            ...(series.genres ?? []).map((genre) => h('span', { class: 'chip' }, genre))))),
      series.description && description(series.description),
      h('div', { class: 'actions' },
        h('a', { class: 'btn btn-primary', href: hashFor.read(startAt.url) },
          icon('play', 18),
          h('span', { class: 'ellipsis' }, resumeAt ? t('series.resume', { chapter: resumeAt.title }) : t('series.start'))),
        h('button', { class: 'btn', type: 'button', onclick: () => removeSeries(series) }, icon('trash', 18), t('series.remove'))),
      chapterList(series, position),
    );
  }

  function description(text) {
    const paragraph = h('p', { class: 'desc clamped' }, text);
    const toggle = h('button', { class: 'link-btn', type: 'button', hidden: true }, t('series.more'));
    toggle.addEventListener('click', () => {
      const open = paragraph.classList.toggle('clamped') === false;
      toggle.textContent = open ? t('series.less') : t('series.more');
    });
    // Only offer "more" when the text really is cut off.
    requestAnimationFrame(() => {
      toggle.hidden = paragraph.scrollHeight <= paragraph.clientHeight + 1;
    });
    return h('div', { class: 'desc-wrap' }, paragraph, toggle);
  }

  function chapterList(series, position) {
    const list = h('ul', { class: 'chapters' });
    const sort = h('button', {
      class: 'btn btn-ghost',
      type: 'button',
      onclick: () => {
        settings.set({ chapterOrder: settings.get().chapterOrder === 'desc' ? 'asc' : 'desc' });
        fill();
      },
    });

    function row(chapter) {
      const read = progress.isRead(url, chapter.key);
      return h('li', {},
        h('a', {
          class: `chapter${read ? ' read' : ''}`,
          href: hashFor.read(chapter.url),
          'aria-current': position?.chapter === chapter.url ? 'true' : null,
        },
        h('span', { class: 'chapter-title' }, chapter.title),
        chapter.date && h('span', { class: 'chapter-date' }, chapter.date),
        read && h('span', { class: 'chapter-check', role: 'img', 'aria-label': t('series.read') }, icon('check', 18))));
    }

    function fill() {
      const newestFirst = settings.get().chapterOrder === 'desc';
      sort.replaceChildren(icon('sort', 18), newestFirst ? t('series.newestFirst') : t('series.oldestFirst'));
      list.replaceChildren(...(newestFirst ? [...series.chapters].reverse() : series.chapters).map(row));
    }
    fill();

    return h('section', { class: 'chapter-section' },
      h('div', { class: 'list-head' }, h('h2', { class: 'section-title' }, tn('series.chapters', series.chapters.length)), sort),
      list);
  }

  function removeSeries(series) {
    if (!confirm(t('home.confirmRemove', { title: series.title }))) return;
    library.remove(url);
    back(hashFor.home());
  }

  return () => {
    alive = false;
  };
}
