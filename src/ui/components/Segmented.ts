import { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';

export interface Choice<T extends string> {
  readonly value: T;
  readonly label: string;
}

export interface SegmentedOptions<T extends string> {
  readonly label: string;
  readonly choices: readonly Choice<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}

/** A choice between a few values. The pill slides to the one that is selected. */
export class Segmented<T extends string> extends Component {
  private readonly values: readonly T[];
  private readonly buttons: HTMLButtonElement[];

  constructor(options: SegmentedOptions<T>) {
    super(h('div', { class: 'segmented', role: 'radiogroup', 'aria-label': options.label }));
    this.values = options.choices.map((choice) => choice.value);
    this.root.style.setProperty('--count', String(options.choices.length));
    this.root.append(h('span', { class: 'seg-thumb', 'aria-hidden': 'true' }));
    this.buttons = options.choices.map((choice) => {
      const button = h('button', { class: 'seg-option', type: 'button', role: 'radio' }, choice.label);
      this.listen(button, 'click', () => {
        this.select(choice.value);
        options.onChange(choice.value);
      });
      this.root.append(button);
      return button;
    });
    this.select(options.value);
  }

  select(value: T): void {
    const index = Math.max(0, this.values.indexOf(value));
    this.root.style.setProperty('--index', String(index));
    this.buttons.forEach((button, i) => button.setAttribute('aria-checked', String(i === index)));
  }
}
