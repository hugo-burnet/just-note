// The caches of the WebView's Cache API: filled as the app reads (NativeTransport), emptied from the
// settings screen.

export const IMAGE_CACHE = 'jr-img';
export const PAGE_CACHE = 'jr-api';

/** The chapters downloaded to be read offline: kept until the user lets them go, never trimmed, and not emptied with the rest. */
export const SAVED_CACHE = 'jr-saved';

/** What was downloaded while reading, as opposed to the app itself. */
export const CONTENT_CACHES: readonly string[] = [IMAGE_CACHE, PAGE_CACHE];

/** How much of it is kept: past these, the oldest go first. */
export const MAX_IMAGES = 400;
export const MAX_PAGES = 80;
export const MAX_IMAGE_BYTES = 128 * 1024 * 1024;
export const MAX_PAGE_BYTES = 16 * 1024 * 1024;
