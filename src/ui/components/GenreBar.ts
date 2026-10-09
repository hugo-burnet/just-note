import type { GenreFilter, ShelfGenre, WithGenres } from '../../engine/index.ts';
import { Component } from '../core/Component.ts';
import { h } from '../core/dom.ts';
import { icon } from '../core/icons.ts';
import type { I18n } from '../i18n/I18n.ts';

export interface GenreBarOptions {
  readonly i18n: I18n;
  readonly filter: GenreFilter;
  /** The choice changed: what is shown is to be filtered again. */
  readonly onChange: () => void;
}

/**
 * The genres of what is shown, the commonest first, in one row that scrolls. A tap keeps a genre (only what has
 * it), a second leaves it out (what has it is hidden), a third lets it go; "Show all" lets every one go.
 */
export class GenreBar extends Component {
  private readonly options: GenreBarOptions;
  private readonly chips = new Map<HTMLElement, ShelfGenre>();

  constructor(options: GenreBarOptions) {
    super(h('div', { class: 'chips chips-scroll genre-bar', role: 'group', 'aria-label': options.i18n.t('library.genres') }));
    this.options = options;
    // One listener for every chip, which paint() draws again.
    this.listen(this.root, 'click', (event) => {
      const chip = (event.target as Element | null)?.closest<HTMLElement>('.chip-button');
      if (!chip) return;
      const genre = this.chips.get(chip);
      if (genre) options.filter.cycle(genre.key);
      else if (chip.classList.contains('genre-reset')) options.filter.clear();
      else return;
      options.onChange();
    });
  }

  /** Draws the genres of `items`; the row stays where it was scrolled to. Hidden when none of them says its genres. */
  paint(items: readonly WithGenres[]): void {
    const { i18n, filter } = this.options;
    const scrolled = this.root.scrollLeft;
    const genres = filter.genres(items);
    this.chips.clear();
    this.root.hidden = genres.length === 0;
    const reset = filter.active ? h('button', { class: 'chip chip-button genre-reset pressable', type: 'button' }, icon('close', 14), i18n.t('library.genresClear')) : null;
    this.root.replaceChildren(...(reset ? [reset] : []), ...genres.map((genre) => this.chip(genre)));
    this.root.scrollLeft = scrolled;
  }

  private chip(genre: ShelfGenre): HTMLElement {
    const { i18n } = this.options;
    const state = i18n.t(genre.choice === 'include' ? 'library.genreKept' : genre.choice === 'exclude' ? 'library.genreLeftOut' : 'library.genreAny');
    const chip = h(
      'button',
      {
        class: 'chip chip-button genre-chip pressable',
        type: 'button',
        'data-choice': genre.choice,
        'aria-pressed': genre.choice === 'none' ? 'false' : 'true',
        'aria-label': `${genre.name}, ${genre.count}, ${state}`,
      },
      genre.choice === 'include' ? icon('check', 14) : genre.choice === 'exclude' ? icon('close', 14) : null,
      h('span', { class: 'genre-name' }, genre.name),
      h('span', { class: 'genre-count', 'aria-hidden': 'true' }, String(genre.count)),
    );
    this.chips.set(chip, genre);
    return chip;
  }
}
