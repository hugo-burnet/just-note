// Shared by the service worker (which fills the caches) and the settings screen
// (which can empty them).

/** The files of the app: each build has a cache named after this prefix and its own hash. */
export const SHELL_PREFIX = 'jr-shell-';
export const IMAGE_CACHE = 'jr-img';
export const PAGE_CACHE = 'jr-api';

/** What was downloaded while reading, as opposed to the app itself. */
export const CONTENT_CACHES: readonly string[] = [IMAGE_CACHE, PAGE_CACHE];
