import type { AppContext } from '../core/AppContext.ts';
import { h } from '../core/dom.ts';
import { icon } from '../core/icons.ts';
import { Sheet } from './Sheet.ts';

/**
 * "Add by link": the heart of the app. Paste a link (or let the clipboard
 * button do it) and the series or chapter it points to opens.
 */
export function openLinkSheet(app: AppContext, parent: HTMLElement): Sheet {
  const t = app.i18n.t.bind(app.i18n);
  const names = app.registry.all().map((source) => source.name).join(', ');

  const input = h('input', {
    class: 'field',
    type: 'text',
    name: 'link',
    placeholder: t('link.placeholder'),
    inputmode: 'url',
    autocapitalize: 'off',
    autocomplete: 'off',
    autocorrect: 'off',
    spellcheck: 'false',
    'aria-label': t('link.title'),
  });
  const submit = (): void => {
    if (input.value.trim() && app.openLink(input.value)) void sheet.close();
  };
  const paste = h('button', { class: 'btn btn-soft btn-block pressable', type: 'button' }, icon('paste', 20), h('span', { class: 'label' }, t('link.paste')));
  const open = h('button', { class: 'btn btn-primary btn-block pressable', type: 'button' }, h('span', { class: 'label' }, t('link.open')), icon('arrowRight', 20));

  const sheet = new Sheet(parent, {
    title: t('link.title'),
    text: t('link.subtitle'),
    body: h('form', { class: 'stack', onsubmit: (event) => { event.preventDefault(); submit(); } }, input, h('p', { class: 'source-list' }, t('link.sources', { sources: names }))),
    actions: h('div', { class: 'sheet-actions' }, open, paste),
  });
  open.addEventListener('click', submit);
  paste.addEventListener('click', async () => {
    const text = await app.clipboard.readText();
    if (!text || !app.registry.resolve(text)) {
      app.toasts.show(t('link.nothingToPaste'));
      return;
    }
    input.value = text;
    submit();
  });
  return sheet;
}
