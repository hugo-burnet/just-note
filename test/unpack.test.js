import assert from 'node:assert/strict';
import { test } from 'node:test';
import { unpack, unpackAll } from '../public/js/sources/unpack.js';
import { pack, runPacked } from './helpers/pack.js';

const SAMPLES = [
  'var a=1;var b="x y";',
  "var newImgs=['//cdn.example/a/1.jpg?token=abc','//cdn.example/a/2.jpg?token=def'];",
  'multi\nline "double" \'single\' back\\slash é text with 0x1f and $dollar, 10 11 12',
];

test('decodes what a JS engine would decode, at every radix we support', () => {
  for (const radix of [10, 36, 62]) {
    for (const sample of SAMPLES) {
      const packed = pack(sample, { radix });
      assert.equal(runPacked(packed), sample, 'the packer itself is sound');
      assert.equal(unpack(packed), sample, `radix ${radix}: ${sample}`);
    }
  }
});

test('finds every packed script in a page, in order', () => {
  const page = `<html><script>${pack('var first=1;')}</script><p>text</p><script>${pack('var second=2;')}</script></html>`;
  assert.deepEqual(unpackAll(page), ['var first=1;', 'var second=2;']);
});

test('returns nothing for text that is not packed', () => {
  assert.deepEqual(unpackAll('<html><script>var a = 1;</script></html>'), []);
  assert.equal(unpack('plain text'), null);
});

test('ignores radixes the standard encoder cannot produce', () => {
  const odd = "eval(function(p,a,c,k,e,d){}('0 1',100,2,'a|b'.split('|'),0,{}))";
  assert.deepEqual(unpackAll(odd), []);
});

test('never executes anything from the page', () => {
  globalThis.__pwned = false;
  unpack(pack('globalThis.__pwned = true;'));
  assert.equal(globalThis.__pwned, false);
  delete globalThis.__pwned;
});
