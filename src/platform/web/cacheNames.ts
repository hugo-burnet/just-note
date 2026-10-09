// Shared by the service worker (which fills the caches) and the settings screen
// (which can empty them).

/** The files of the app: each build has a cache named after this prefix and its own hash. */
export const SHELL_PREFIX = 'jr-shell-';
export const IMAGE_CACHE = 'jr-img';
export const PAGE_CACHE = 'jr-api';

/** What was downloaded while reading, as opposed to the app itself. */
export const CONTENT_CACHES: readonly string[] = [IMAGE_CACHE, PAGE_CACHE];

/** How much of it is kept: past these, the oldest go first. The installed app keeps the same amount as the service worker. */
export const MAX_IMAGES = 400;
export const MAX_PAGES = 80;
export const MAX_IMAGE_BYTES = 128 * 1024 * 1024;
export const MAX_PAGE_BYTES = 16 * 1024 * 1024;
