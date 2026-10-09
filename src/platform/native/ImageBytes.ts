import { IMAGE_TYPES, MAX_IMAGE_BYTES } from '../../../proxy/limits.ts';
import { TransportError } from '../../engine/index.ts';

const ascii = (bytes: Uint8Array, from: number, text: string): boolean => [...text].every((letter, i) => bytes[from + i] === letter.charCodeAt(0));

/** What the first bytes of a file say it is, for a picture that came with no type; empty when they say nothing. */
export function sniff(bytes: Uint8Array): string {
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes[0] === 0x89 && ascii(bytes, 1, 'PNG')) return 'image/png';
  if (ascii(bytes, 0, 'GIF8')) return 'image/gif';
  if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) return 'image/webp';
  if (ascii(bytes, 4, 'ftypavi')) return 'image/avif';
  return '';
}

/**
 * A picture from the base64 the phone's network stack, or the WebView, hands across. Only the
 * raster formats the proxy lets through, and no more than it lets through. With `sniffing`, a
 * type that is missing or wrong is told from the bytes (a page that decrypted a picture
 * itself made the blob with no type); an answer from a site is believed or refused, not guessed at.
 */
export function imageFromBase64(data: string, declared: string, sniffing = false): Blob {
  if (data.length * 0.75 > MAX_IMAGE_BYTES) throw new TransportError('too_large', 'The source sent more data than allowed.');
  const binary = atob(data);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const type = IMAGE_TYPES.has(declared) || !sniffing ? declared : sniff(bytes);
  if (!IMAGE_TYPES.has(type)) throw new TransportError('not_an_image', 'The source did not return an image.');
  return new Blob([bytes], { type });
}
