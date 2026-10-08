import assert from 'node:assert/strict';
import { test } from 'node:test';
import { SourceError, TransportError } from '../../src/engine/index.ts';
import { ErrorPresenter } from '../../src/ui/errors/ErrorPresenter.ts';
import { I18n } from '../../src/ui/i18n/I18n.ts';

Object.assign(globalThis, { document: { documentElement: {} }, location: { hash: '#/series?u=x' } });
const i18n = new I18n();
i18n.setLanguage('en');
const presenter = new ErrorPresenter(i18n);

test('errors: each failure of the proxy or of a source has words of its own', () => {
  const cases: Array<[unknown, string]> = [
    [new TransportError('offline', 'x'), "You're offline"],
    [new TransportError('network', 'x'), "Can't reach the app's server"],
    [new TransportError('no_proxy', 'x'), "Can't reach the app's server"],
    [new TransportError('host_not_allowed', 'x', { host: 'evil.test' }), 'Blocked address'],
    [new TransportError('timeout', 'x'), 'The site took too long'],
    [new SourceError('blocked', 'x'), 'The site asked for a human check'],
    [new SourceError('no_chapters', 'x'), "Couldn't read this page"],
    [new SourceError('no_pages', 'x'), "Couldn't read this page"],
    [new SourceError('age_gated', 'x'), 'This one asks for an age check'],
    [new SourceError('unsupported', 'x'), "That link isn't supported"],
  ];
  for (const [error, title] of cases) assert.equal(presenter.describe(error).title, title);
});

test('errors: a proxy that does not answer is named, so that a wrong address is easy to spot', () => {
  const hint = presenter.describe(new TransportError('no_proxy', 'HTTP 404', { status: 404, proxy: 'https://you.github.io' })).hint;
  assert.match(hint, /the app asked https:\/\/you\.github\.io\)/);
  const report = JSON.parse(presenter.report(new TransportError('no_proxy', 'HTTP 404', { proxy: 'https://you.github.io' }))) as Record<string, unknown>;
  assert.equal(report.proxy, 'https://you.github.io');
});

test('errors: what the site answered decides between refused, not found and the rest', () => {
  const upstream = (status: number): TransportError => new TransportError('upstream_status', 'x', { upstreamStatus: status });
  assert.equal(presenter.describe(upstream(403)).title, 'The site refused the request');
  assert.equal(presenter.describe(upstream(503)).title, 'The site refused the request');
  assert.equal(presenter.describe(upstream(404)).title, 'Not found');
  assert.equal(presenter.describe(upstream(500)).title, 'The site answered 500');
});

test('errors: the unknown still gets a decent message', () => {
  assert.equal(presenter.describe(new Error('boom')).title, 'Something went wrong');
  assert.equal(presenter.describe('a string').title, 'Something went wrong');
});

test('errors: the details to send back say what failed and where', () => {
  const report = JSON.parse(presenter.report(new TransportError('upstream_status', 'HTTP 403', { upstreamStatus: 403, host: 'fanfox.net' }))) as Record<string, unknown>;
  assert.equal(report.code, 'upstream_status');
  assert.equal(report.upstreamStatus, 403);
  assert.equal(report.host, 'fanfox.net');
  assert.equal(report.page, '#/series?u=x');
  assert.equal(typeof report.at, 'string');
});
