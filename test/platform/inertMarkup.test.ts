import assert from 'node:assert/strict';
import { test } from 'node:test';
import { inertMarkup } from '../../src/platform/web/inertMarkup.ts';

test('foreign style attributes are retained as inert data, including mixed case and unquoted values', () => {
  assert.equal(inertMarkup('<div STYLE = "display:none" style=color:red>text</div>'), '<div data-jr-original-style = "display:none" data-jr-original-style=color:red>text</div>');
});

test('quoted attributes containing greater-than signs or style-like text stay intact', () => {
  const html = '<a title="a > b style=bold" href="https://site.test/?style=x" style=hidden>link</a>';
  assert.equal(inertMarkup(html), html.replace('style=hidden', 'data-jr-original-style=hidden'));
});

test('scripts, comments and raw text keep image data without interpreting their apparent markup', () => {
  const html = '<script type="application/json">{"image":"<div style=red>","url":"https://cdn.test/1.png"}</script><!-- <div style=red> --><textarea><div style=red></textarea><title> style=bold </title>';
  assert.equal(inertMarkup(html), html);
});

test('foreign stylesheets are discarded without changing adjacent chapter content', () => {
  assert.equal(inertMarkup('<STYLE media="screen">body{color:red}</STYLE><p>chapter</p>'), '<p>chapter</p>');
});
