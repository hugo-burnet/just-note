// Shared by the service worker (which fills the caches) and the settings screen
// (which can empty them).
export const SHELL_CACHE = 'jr-shell-v2';
export const IMAGE_CACHE = 'jr-img';
export const PAGE_CACHE = 'jr-api';

/** What was downloaded while reading, as opposed to the app itself. */
export const CONTENT_CACHES: readonly string[] = [IMAGE_CACHE, PAGE_CACHE];
