import { ReaderSession } from '../../../engine/index.ts';
import type { ChapterRef } from '../../../engine/index.ts';

/** A chapter and its pages, as far as the reader has opened it. */
export interface Part {
  readonly chapter: ChapterRef;
  readonly pages: readonly string[];
}

/** The chapters of a series in reading order, and the pages of those the reader has opened. */
export class ReadingOrder {
  private readonly chapters: readonly ChapterRef[];
  private readonly parts = new Map<string, Part>();

  /** `chapters` is empty when the series could not be read: nothing comes before or after. */
  constructor(chapters: readonly ChapterRef[]) {
    this.chapters = chapters;
  }

  part(url: string): Part | undefined {
    return this.parts.get(url);
  }

  keep(part: Part): void {
    this.parts.set(part.chapter.url, part);
  }

  /** A reading of `part` from `startPage`, knowing what comes before and after it. */
  session(part: Part, startPage = 0): ReaderSession {
    const at = this.chapters.findIndex((chapter) => chapter.url === part.chapter.url);
    return new ReaderSession({
      pageCount: part.pages.length,
      startPage,
      previous: at > 0 ? this.chapters[at - 1] ?? null : null,
      next: at >= 0 ? this.chapters[at + 1] ?? null : null,
    });
  }
}
