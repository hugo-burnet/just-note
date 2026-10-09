import type { ChapterRef } from '../../../engine/index.ts';
import { h } from '../../core/dom.ts';
import { icon } from '../../core/icons.ts';
import type { I18n } from '../../i18n/I18n.ts';

export interface EndCardOptions {
  readonly i18n: I18n;
  readonly chapter: ChapterRef;
  readonly next: ChapterRef | null;
  onward(next: ChapterRef): void;
  toChapters(): void;
}

/**
 * What closes a scrolled chapter: where to go next, or the news that there is
 * nothing after. Once the next chapter follows in the column (`data-state` set to
 * `joined`), it is only a divider that names it.
 */
export function endCard({ i18n, chapter, next, onward, toChapters }: EndCardOptions): HTMLElement {
  const chapters = h('button', { class: 'btn btn-block pressable', type: 'button', onclick: toChapters }, i18n.t('reader.toChapters'));
  const forward = next
    ? h('button', { class: 'btn btn-primary btn-block pressable', type: 'button', onclick: () => onward(next) }, h('span', { class: 'label' }, next.title), icon('arrowRight', 20))
    : null;
  return h(
    'section',
    { class: 'end-card' },
    h('h2', null, i18n.t('reader.finished', { chapter: chapter.title })),
    h('p', { class: 'muted' }, i18n.t(next ? 'reader.nextUp' : 'reader.upToDate')),
    next ? h('p', { class: 'end-next' }, next.title) : null,
    forward,
    chapters,
  );
}
