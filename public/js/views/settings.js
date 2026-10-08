import { checkProxy } from '../api.js';
import { t } from '../i18n.js';
import { back, hashFor } from '../router.js';
import { library, settings } from '../store.js';
import { h, segmented, toast, topbar } from '../ui.js';

// Image and page copies kept by the service worker (see public/sw.js).
const CONTENT_CACHES = ['jr-img', 'jr-api'];

export function mount(root) {
  render();

  // Rebuilt from scratch when the language changes, so every label follows.
  function render() {
    const current = settings.get();
    document.title = `${t('settings.title')} · ${t('app.name')}`;

    const proxyStatus = h('p', { class: 'muted', role: 'status' });
    const proxy = h('input', {
      class: 'field',
      type: 'text',
      value: current.proxyBase,
      placeholder: 'https://…',
      inputmode: 'url',
      autocapitalize: 'off',
      autocomplete: 'off',
      spellcheck: false,
      'aria-label': t('settings.proxy'),
    });
    proxy.addEventListener('change', () => settings.set({ proxyBase: proxy.value.trim() }));

    const row = (label, control, hint) =>
      h('div', { class: 'setting' }, h('span', { class: 'setting-label' }, label), control, hint && h('p', { class: 'hint' }, hint));

    root.replaceChildren(
      topbar(t('settings.title'), { onBack: () => back(hashFor.home()) }),
      h('main', { class: 'page' },
        row(t('settings.language'), segmented(
          [['auto', t('settings.auto')], ['en', 'English'], ['fr', 'Français']],
          current.lang,
          (lang) => {
            settings.set({ lang });
            render();
          },
          t('settings.language'),
        )),
        row(t('settings.theme'), segmented(
          [['auto', t('settings.auto')], ['dark', t('settings.dark')], ['light', t('settings.light')]],
          current.theme,
          (theme) => settings.set({ theme }),
          t('settings.theme'),
        )),
        row(t('reader.mode'), segmented(
          [['scroll', t('reader.scroll')], ['paged', t('reader.paged')]],
          current.mode,
          (mode) => settings.set({ mode }),
          t('reader.mode'),
        )),
        row(t('reader.direction'), segmented(
          [['ltr', t('reader.ltr')], ['rtl', t('reader.rtl')]],
          current.rtl ? 'rtl' : 'ltr',
          (direction) => settings.set({ rtl: direction === 'rtl' }),
          t('reader.direction'),
        )),
        row(t('settings.proxy'), proxy, t('settings.proxyHint')),
        h('div', { class: 'row' },
          h('button', {
            class: 'btn',
            type: 'button',
            onclick: async () => {
              settings.set({ proxyBase: proxy.value.trim() });
              proxyStatus.textContent = (await checkProxy()) ? t('settings.proxyOk') : t('settings.proxyFail');
            },
          }, t('settings.testProxy')),
          proxyStatus),
        h('div', { class: 'row' },
          h('button', { class: 'btn', type: 'button', onclick: clearCache }, t('settings.clearCache')),
          h('button', { class: 'btn btn-danger', type: 'button', onclick: clearLibrary }, t('settings.clearLibrary'))),
        h('p', { class: 'hint' }, t('settings.privacy'))),
    );
  }

  async function clearCache() {
    if ('caches' in window) await Promise.all(CONTENT_CACHES.map((name) => caches.delete(name)));
    toast(t('settings.cacheCleared'));
  }

  function clearLibrary() {
    if (!confirm(t('settings.confirmClear'))) return;
    library.clear();
    toast(t('settings.libraryCleared'));
  }
}
