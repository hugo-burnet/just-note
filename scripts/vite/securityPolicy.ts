import type { Plugin } from 'vite';

// The security policy of the app's page, in a <meta> tag of the page itself.
//
// The app never turns a site's text into markup, but it does parse it: nothing but its own
// files may run or style the page. Images are its own files, or blob: addresses the app makes
// for the pictures it downloads itself (only script can make one, and no script but the app's
// own runs). Requests to the sites go through the phone's network stack, not through the page.
const DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  "img-src 'self' https: data: blob:",
  "connect-src 'self' https:",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
];

/** Puts the security policy in the page. Not in development: Vite's own client needs more. */
export function securityPolicy(): Plugin {
  return {
    name: 'just-read:security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: DIRECTIVES.join('; ') }, injectTo: 'head-prepend' }],
    },
  };
}
