// The security policy of the app's page. A static host (GitHub Pages) cannot send
// headers, so the build also puts it in a <meta> tag (scripts/vite/securityPolicy.ts);
// the Node server sends it as a header too.
//
// The app never turns third-party text into markup, but it does parse it: nothing
// but its own files may run or style the page. Images and requests may go to any
// https address, because that is where the proxy lives (the user can point the app
// at their own), and to the machine itself, for a proxy started with `npm start`.
const LOOPBACK = 'http://127.0.0.1:* http://localhost:*';

const DIRECTIVES = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "font-src 'self'",
  `img-src 'self' https: ${LOOPBACK} data:`,
  `connect-src 'self' https: ${LOOPBACK}`,
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
];

/** For a <meta> tag, which browsers do not let carry frame-ancestors. */
export const META_POLICY = DIRECTIVES.join('; ');

export const HEADER_POLICY = [...DIRECTIVES, "frame-ancestors 'none'"].join('; ');
