import { extractUrl } from '../links.ts';
import type { SourceTarget } from '../model.ts';
import type { Source } from './Source.ts';

export interface ResolvedLink extends SourceTarget {
  readonly source: Source;
}

/** The sites the app can read, and the one that understands a given link. */
export class SourceRegistry {
  private readonly sources: readonly Source[];

  constructor(sources: readonly Source[]) {
    this.sources = sources;
  }

  all(): readonly Source[] {
    return this.sources;
  }

  byId(id: string): Source | null {
    return this.sources.find((source) => source.id === id) ?? null;
  }

  /** Accepts whatever was pasted or shared: finds the link, then the source that knows it. */
  resolve(input: string | null | undefined): ResolvedLink | null {
    const url = extractUrl(input);
    if (!url) return null;
    for (const source of this.sources) {
      const target = source.resolve(url);
      if (target) return { ...target, source };
    }
    return null;
  }
}
