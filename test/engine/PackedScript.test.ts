import assert from 'node:assert/strict';
import { test } from 'node:test';
import { PackedScript } from '../../src/engine/source/PackedScript.ts';
import { pack, runPacked } from './pack.ts';

const SAMPLES = [
  'var a=1;var b="x y";',
  "var newImgs=['//cdn.example/a/1.jpg?token=abc','//cdn.example/a/2.jpg?token=def'];",
  'multi\nline "double" \'single\' back\\slash é text with 0x1f and $dollar, 10 11 12',
];

test('decodes what a JS engine would decode, at every radix supported', () => {
  for (const radix of [10, 36, 62]) {
    for (const sample of SAMPLES) {
      const packed = pack(sample, { radix });
      assert.equal(runPacked(packed), sample, 'the packer itself is sound');
      assert.equal(PackedScript.decode(packed), sample, `radix ${radix}: ${sample}`);
    }
  }
});

test('finds every packed script in a page, in order', () => {
  const page = `<html><script>${pack('var first=1;')}</script><p>text</p><script>${pack('var second=2;')}</script></html>`;
  assert.deepEqual(PackedScript.decodeAll(page), ['var first=1;', 'var second=2;']);
});

test('returns nothing for text that is not packed', () => {
  assert.deepEqual(PackedScript.decodeAll('<html><script>var a = 1;</script></html>'), []);
  assert.equal(PackedScript.decode('plain text'), null);
});

test('ignores radixes the standard encoder cannot produce', () => {
  const odd = "eval(function(p,a,c,k,e,d){}('0 1',100,2,'a|b'.split('|'),0,{}))";
  assert.deepEqual(PackedScript.decodeAll(odd), []);
});

test('never executes anything from the page', () => {
  const holder = globalThis as unknown as { __pwned?: boolean };
  holder.__pwned = false;
  PackedScript.decode(pack('globalThis.__pwned = true;'));
  assert.equal(holder.__pwned, false);
  delete holder.__pwned;
});
