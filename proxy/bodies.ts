import { ProxyError } from './ProxyError.ts';

function charsetOf(res: Response): string {
  const match = /charset=([^;]+)/i.exec(res.headers.get('content-type') ?? '');
  return match?.[1] ? match[1].trim().replace(/^["']|["']$/g, '') : 'utf-8';
}

// Reads a text body, refusing anything above `max` bytes (declared or not).
export async function readText(res: Response, max: number): Promise<string> {
  if (Number(res.headers.get('content-length')) > max) throw ProxyError.tooLarge();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (res.body) {
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > max) {
        await reader.cancel();
        throw ProxyError.tooLarge();
      }
      chunks.push(value);
    }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return new TextDecoder(charsetOf(res)).decode(bytes);
  } catch {
    return new TextDecoder().decode(bytes);
  }
}

// Enforces the size cap on the bytes really streamed, whatever the headers said.
export function capStream(body: ReadableStream<Uint8Array>, max: number): ReadableStream<Uint8Array> {
  let seen = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        seen += chunk.byteLength;
        if (seen > max) controller.error(new Error('body too large'));
        else controller.enqueue(chunk);
      },
    }),
  );
}
