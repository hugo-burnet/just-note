import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isChallenge } from '../../src/platform/native/Challenge.ts';

const answer = (status: number, body = '', headers: Record<string, string> = {}) => ({ status, headers, body });

test('challenge: the header Cloudflare marks a check with is enough', () => {
  assert.equal(isChallenge(answer(403, '', { 'cf-mitigated': 'challenge' })), true);
});

test('challenge: a refusal that carries the check\'s page is one, in any language', () => {
  const script = '<script>a.src = "/cdn-cgi/challenge-platform/h/g/orchestrate/chl_page/v1?ray=1"</script>';
  assert.equal(isChallenge(answer(403, `<html><head><title>x</title></head>${script}`)), true);
  assert.equal(isChallenge(answer(503, '<!DOCTYPE html><html><head><title>Just a moment...</title>')), true);
  assert.equal(isChallenge(answer(403, '<!DOCTYPE html><html><head><title>Un instant…</title>')), true);
});

test('challenge: a plain refusal, a missing page and the site itself are not', () => {
  assert.equal(isChallenge(answer(403, 'Forbidden')), false);
  assert.equal(isChallenge(answer(404, '<html>Not found')), false);
  // Sites behind Cloudflare load its detection script on their own pages: that is not a check.
  assert.equal(isChallenge(answer(200, '<script src="/cdn-cgi/challenge-platform/scripts/jsd/main.js"></script>')), false);
});
