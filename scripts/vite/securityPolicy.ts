import type { Plugin } from 'vite';
import { META_POLICY } from '../../proxy/ContentPolicy.ts';

/** Puts the security policy in the page itself, for hosts that cannot send headers. Not in development: Vite's own client needs more. */
export function securityPolicy(): Plugin {
  return {
    name: 'just-read:security-policy',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler: () => [{ tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: META_POLICY }, injectTo: 'head-prepend' }],
    },
  };
}
