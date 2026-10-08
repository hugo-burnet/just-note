import { t } from '../i18n.js';
import { hashFor, openLink } from '../router.js';
import { resolve, sources } from '../sources/index.js';
import { library } from '../store.js';
import { cover, h, icon } from '../ui.js';

export function mount(root) {
  const input = h('input', {
    class: 'field',
    type: 'text',
    name: 'link',
    placeholder: t('home.placeholder'),
    inputmode: 'url',
    autocapitalize: 'off',
    autocomplete: 'off',
    spellcheck: false,
    'aria-label': t('home.pasteLabel'),
  });
  const form = h('form', {
    class: 'link-form',
    onsubmit: (event) => {
      event.preventDefault();
      if (input.value.trim()) openLink(input.value);
    },
  }, input, h('button', { class: 'btn btn-primary btn-square', type: 'submit', 'aria-label': t('home.open') }, icon('arrowRight')));

  // Pasting a link we can read opens it straight away.
  input.addEventListener('paste', () => setTimeout(() => resolve(input.value) && openLink(input.value)));

  const resume = h('div', { class: 'resume-slot' });
  const libraryEl = h('section', { class: 'library' });

  function renderLibrary() {
    const items = library.list();
    const last = items.find((series) => series.position);
    resume.replaceChildren(
      ...(last
        ? [h('a', { class: 'resume', href: hashFor.read(last.position.chapter) },
            cover(last.cover, last.title),
            h('span', { class: 'resume-text' },
              h('small', {}, t('home.continue')),
              h('strong', {}, last.title),
              h('span', { class: 'muted' }, last.position.title)),
            icon('play', 20))]
        : []),
    );
    libraryEl.replaceChildren(
      h('h2', { class: 'section-title' }, t('home.library')),
      items.length ? h('ul', { class: 'grid' }, ...items.map(card)) : h('p', { class: 'empty' }, t('home.empty')),
    );
  }

  function card(series) {
    return h('li', { class: 'card' },
      h('a', { class: 'card-link', href: hashFor.series(series.url) },
        cover(series.cover, series.title),
        h('span', { class: 'card-title' }, series.title),
        h('span', { class: 'card-sub' }, series.position ? series.position.title : t('home.notStarted'))),
      h('button', {
        class: 'card-remove icon-btn',
        type: 'button',
        'aria-label': `${t('home.remove')}: ${series.title}`,
        onclick: () => {
          if (!confirm(t('home.confirmRemove', { title: series.title }))) return;
          library.remove(series.url);
          renderLibrary();
        },
      }, icon('trash', 18)));
  }

  root.append(
    h('main', { class: 'page' },
      h('header', { class: 'home-head' },
        h('h1', { class: 'brand' }, t('app.name')),
        h('a', { class: 'icon-btn', href: hashFor.settings(), 'aria-label': t('home.settings') }, icon('settings'))),
      form,
      h('p', { class: 'hint' }, t('home.hint')),
      h('p', { class: 'hint' }, t('home.sources', { names: sources.map((source) => source.name).join(', ') })),
      h('div', { class: 'row' },
        ...sources.map((source) =>
          h('a', { class: 'btn', href: hashFor.browse(source.home) }, icon('compass', 18), t('home.browse', { name: source.name })))),
      resume,
      libraryEl),
  );
  renderLibrary();
}
