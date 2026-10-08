import { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';
import { icon } from '../core/icons.ts';
import type { IconName } from '../core/icons.ts';

export interface EmptyStateOptions {
  readonly icon: IconName;
  readonly title: string;
  readonly text: string;
  readonly actions?: readonly HTMLElement[];
}

/** A screen with nothing to show yet, which says what to do about it. */
export class EmptyState extends Component {
  constructor(options: EmptyStateOptions) {
    super(
      h(
        'section',
        { class: 'empty' },
        h('div', { class: 'empty-art' }, icon(options.icon, 44)),
        h('h2', null, options.title),
        h('p', null, options.text),
        options.actions && options.actions.length > 0 ? h('div', { class: 'empty-actions' }, options.actions) : null,
      ),
    );
  }
}
