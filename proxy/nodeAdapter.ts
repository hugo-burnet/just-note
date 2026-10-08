import type { IncomingMessage, ServerResponse } from 'node:http';
import { Readable } from 'node:stream';
import type { ReadableStream as NodeReadableStream } from 'node:stream/web';

// Node's http objects <-> the Fetch API objects the proxy is written with.

// null for a request target we refuse: "//host/path" would be read as a
// protocol-relative URL and point somewhere else.
export function toRequest(req: IncomingMessage): Request | null {
  const target = req.url ?? '/';
  if (!target.startsWith('/') || target.startsWith('//')) return null;
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  return new Request(new URL(target, 'http://localhost'), { method: req.method, headers });
}

export async function sendResponse(res: ServerResponse, response: Response): Promise<void> {
  res.writeHead(response.status, Object.fromEntries(response.headers));
  if (!response.body) {
    res.end();
    return;
  }
  const stream = Readable.fromWeb(response.body as unknown as NodeReadableStream);
  stream.on('error', () => res.destroy());
  // Stop downloading from the source as soon as the client goes away.
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}
