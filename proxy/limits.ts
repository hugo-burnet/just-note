// What the proxy accepts from a site. The installed app, which reads the sites itself,
// applies the same limits (src/platform/native/).
export const MAX_HTML_BYTES = 5 * 1024 * 1024;
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;

// Raster formats only: an SVG served from our own origin could run scripts.
export const IMAGE_TYPES: ReadonlySet<string> = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);
