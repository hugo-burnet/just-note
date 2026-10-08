import type { Chapter } from '../../model.ts';
import type { DomDocument } from '../../ports.ts';
import { mapLimit } from '../../text.ts';
import { WebtoonSeriesParser } from './WebtoonSeriesParser.ts';
import { WebtoonUrls } from './WebtoonUrls.ts';

const MAX_PAGES = 200;
const FETCHES_IN_FLIGHT = 4;

const range = (from: number, to: number): number[] => Array.from({ length: Math.max(0, to - from + 1) }, (_, i) => from + i);

export type DocumentLoader = (url: string) => Promise<{ readonly doc: DomDocument }>;

/**
 * WEBTOON lists ten episodes a page, so a whole series takes several requests.
 * The paginator only shows a window of page links: keep going until a page no
 * longer reveals a higher one.
 */
export class WebtoonEpisodes {
  private readonly parser: WebtoonSeriesParser;
  private readonly load: DocumentLoader;

  constructor(parser: WebtoonSeriesParser, load: DocumentLoader) {
    this.parser = parser;
    this.load = load;
  }

  async collect(first: DomDocument, seriesUrl: string): Promise<Chapter[]> {
    const all = new Map<number, Chapter>();
    const add = (doc: DomDocument): void => {
      for (const episode of this.parser.episodes(doc, seriesUrl)) all.set(episode.number, episode);
    };
    add(first);

    let known = 1;
    let reach = Math.max(1, ...this.parser.pageNumbers(first, seriesUrl));
    while (known < reach && known < MAX_PAGES) {
      const pages = range(known + 1, Math.min(reach, MAX_PAGES));
      known = pages.at(-1) ?? known;
      const loaded = await mapLimit(pages, FETCHES_IN_FLIGHT, (page) => this.load(WebtoonUrls.listPage(seriesUrl, page)));
      for (const { doc } of loaded) {
        add(doc);
        reach = Math.max(reach, ...this.parser.pageNumbers(doc, seriesUrl));
      }
    }
    return [...all.values()].sort((a, b) => a.number - b.number);
  }
}
