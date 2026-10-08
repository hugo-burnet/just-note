import { loadList } from '../catalog.js';
import { t } from '../i18n.js';
import { back, go, hashFor, redirect } from '../router.js';
import { resolve } from '../sources/index.js';
import { cover, errorBox, h, icon, spinner, topbar } from '../ui.js';

export function mount(root, { u, q = '' }) {
  const target = resolve(u);
  if (target?.kind !== 'list') {
    redirect(hashFor.home());
    return;
  }
  const { source, url } = target;
  let alive = true;

  const input = h('input', {
    class: 'field',
    type: 'search',
    value: q,
    placeholder: t('browse.search', { name: source.name }),
    enterkeyhint: 'search',
    autocomplete: 'off',
    'aria-label': t('browse.search', { name: source.name }),
  });
  const form = h('form', {
    class: 'link-form',
    onsubmit: (event) => {
      event.preventDefault();
      const text = input.value.trim();
      go(text ? hashFor.browse(source.searchUrl(text), text) : hashFor.browse(source.home));
    },
  }, input, h('button', { class: 'btn btn-primary btn-square', type: 'submit', 'aria-label': t('browse.go') }, icon('search')));

  const title = q ? t('browse.results', { q }) : source.name;
  document.title = `${title} · ${t('app.name')}`;
  const results = h('div', { class: 'results' }, h('div', { class: 'center' }, spinner()));
  root.append(topbar(title, { onBack: () => back(hashFor.home()) }), h('main', { class: 'page' }, form, results));
  load();

  async function load() {
    try {
      const items = await loadList(source, url);
      if (!alive) return;
      results.replaceChildren(
        items.length
          ? h('ul', { class: 'grid' }, ...items.map((item) =>
              h('li', { class: 'card' },
                h('a', { class: 'card-link', href: hashFor.series(item.url) },
                  cover(item.cover, item.title),
                  h('span', { class: 'card-title' }, item.title)))))
          : h('p', { class: 'empty' }, t('browse.empty')),
      );
    } catch (err) {
      if (alive) results.replaceChildren(errorBox(err, { retry: load }));
    }
  }

  return () => {
    alive = false;
  };
}
