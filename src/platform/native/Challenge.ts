import type { NativeResponse } from './NativeHttp.ts';

// The page Cloudflare puts in front of a site it doubts: its title, and the script it loads to
// run the check. The title is in the language of the visitor, the script's address is not.
const MARKERS = /cdn-cgi\/challenge-platform|<title>\s*(?:Just a moment|Un instant)/i;

/**
 * Whether the answer is a "prove you are a browser" page instead of the site: the header
 * Cloudflare marks it with, or a refusal that carries the check's page. Only a WebView can pass it.
 */
export function isChallenge(response: NativeResponse): boolean {
  if (response.headers['cf-mitigated'] === 'challenge') return true;
  return (response.status === 403 || response.status === 503) && MARKERS.test(response.body.slice(0, 30_000));
}
