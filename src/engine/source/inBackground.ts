import type { Transport } from '../ports.ts';

/**
 * The same transport, for reading that nobody waits for (new chapters being looked for): each request
 * says so, and a site that asks for a human check is left alone rather than shown to the user.
 */
export function inBackground(transport: Transport): Transport {
  const quiet: Transport = {
    text: (url, request = {}) => transport.text(url, { ...request, background: true }),
    imageSource: (url) => transport.imageSource(url),
  };
  const render = transport.render?.bind(transport);
  return render ? { ...quiet, render: (url, request) => render(url, { ...request, background: true }) } : quiet;
}
