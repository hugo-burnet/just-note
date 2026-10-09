import type { ReadingStyle } from './reader/ReadingStyle.ts';

export interface Chapter {
  readonly url: string;
  /** Stable name inside the series ("c012", "e7"): what "read" marks are kept under. */
  readonly key: string;
  readonly number: number;
  readonly title: string;
  readonly date: string;
}

export interface SeriesSummary {
  readonly url: string;
  readonly title: string;
  readonly cover: string | null;
}

export interface Series extends SeriesSummary {
  /** How this series is meant to be read, when the site says (a site that publishes manga and webtoons alike); else the site's own way. */
  readonly reading?: ReadingStyle;
  readonly author: string;
  readonly status: string;
  readonly genres: readonly string[];
  readonly description: string;
  /** Oldest first. */
  readonly chapters: readonly Chapter[];
}

export interface ChapterPages {
  /** Addresses of the images, in reading order. */
  readonly pages: readonly string[];
}

export type TargetKind = 'series' | 'chapter' | 'list';

/** What a link points at, in canonical form. */
export interface SourceTarget {
  readonly kind: TargetKind;
  readonly url: string;
  /** chapter only: its key, and the series it belongs to. */
  readonly key?: string;
  readonly seriesUrl?: string;
}
