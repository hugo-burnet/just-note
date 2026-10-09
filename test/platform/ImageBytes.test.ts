import assert from 'node:assert/strict';
import { test } from 'node:test';
import { TransportError } from '../../src/engine/index.ts';
import { imageFromBase64, sniff } from '../../src/platform/native/ImageBytes.ts';

const bytes = (...values: Array<number | string>): Uint8Array => Uint8Array.from(values.flatMap((value) => (typeof value === 'string' ? [...value].map((letter) => letter.charCodeAt(0)) : [value])));
const base64 = (data: Uint8Array): string => Buffer.from(data).toString('base64');

const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 'JFIF');
const PNG = bytes(0x89, 'PNG', 0x0d, 0x0a, 0x1a, 0x0a);
const GIF = bytes('GIF89a', 1, 0, 1, 0);
const WEBP = bytes('RIFF', 0x24, 0, 0, 0, 'WEBPVP8 ');
const AVIF = bytes(0, 0, 0, 0x1c, 'ftypavif', 0, 0, 0, 0);

test('sniff: the first bytes tell a picture from what it is not', () => {
  assert.equal(sniff(JPEG), 'image/jpeg');
  assert.equal(sniff(PNG), 'image/png');
  assert.equal(sniff(GIF), 'image/gif');
  assert.equal(sniff(WEBP), 'image/webp');
  assert.equal(sniff(AVIF), 'image/avif');
  assert.equal(sniff(bytes('<html><body>')), '');
  assert.equal(sniff(bytes('<svg xmlns="http://www.w3.org/2000/svg"/>')), '');
  assert.equal(sniff(new Uint8Array()), '');
});

test('imageFromBase64: a picture is what its type says, when the type is one of the raster formats', async () => {
  const blob = imageFromBase64(base64(JPEG), 'image/jpeg');
  assert.equal(blob.type, 'image/jpeg');
  assert.deepEqual([...new Uint8Array(await blob.arrayBuffer())], [...JPEG]);
});

test('imageFromBase64: an answer from a site is believed or refused, never guessed at', () => {
  for (const declared of ['text/html', '', 'image/svg+xml']) {
    assert.throws(() => imageFromBase64(base64(JPEG), declared), (error: unknown) => error instanceof TransportError && error.code === 'not_an_image', declared);
  }
});

test('imageFromBase64: a picture a page made itself, with no type, is told from its bytes', () => {
  assert.equal(imageFromBase64(base64(PNG), '', true).type, 'image/png');
  assert.equal(imageFromBase64(base64(WEBP), 'application/octet-stream', true).type, 'image/webp');
  // A type that is right is kept, and bytes that are no picture stay refused.
  assert.equal(imageFromBase64(base64(JPEG), 'image/jpeg', true).type, 'image/jpeg');
  assert.throws(() => imageFromBase64(base64(bytes('<html>')), '', true), (error: unknown) => error instanceof TransportError && error.code === 'not_an_image');
});

test('imageFromBase64: more than the limit is refused before it is decoded', () => {
  const huge = 'A'.repeat(41 * 1024 * 1024);
  assert.throws(() => imageFromBase64(huge, 'image/jpeg'), (error: unknown) => error instanceof TransportError && error.code === 'too_large');
});
