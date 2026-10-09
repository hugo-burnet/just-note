// What the app accepts from a site: past these, an answer is refused rather than kept in memory.
export const MAX_HTML_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

// Raster formats only: an SVG is a document that could run scripts.
export const IMAGE_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

/** What the app presents itself as to the sites: a desktop browser, which they answer the way they answer people. */
export const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
