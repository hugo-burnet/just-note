import type { DomDocument, HtmlParser } from '../../engine/index.ts';

/** Parses with the browser's own parser: scripts do not run, images do not load. */
export class BrowserParser implements HtmlParser {
  parse(html: string): DomDocument {
    return new DOMParser().parseFromString(html, 'text/html');
  }
}
