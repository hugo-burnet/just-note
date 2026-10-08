import assert from 'node:assert/strict';
import { test } from 'node:test';
import { HostPolicy } from '../../proxy/HostPolicy.ts';

const policy = new HostPolicy();

test('matching is by whole domain label', () => {
  assert.equal(policy.siteFor('fanfox.net')?.id, 'fanfox');
  assert.equal(policy.siteFor('M.FanFox.net')?.id, 'fanfox');
  assert.equal(policy.siteFor('fmcdn.mfcdn.net')?.id, 'fanfox');
  assert.equal(policy.siteFor('www.webtoons.com')?.id, 'webtoon');
  assert.equal(policy.siteFor('webtoon-phinf.pstatic.net')?.id, 'webtoon');
  assert.equal(policy.siteFor('evilfanfox.net'), null);
  assert.equal(policy.siteFor('fanfox.net.evil.com'), null);
  assert.equal(policy.siteFor('pstatic.net.evil.com'), null);
  assert.equal(policy.siteFor('net'), null);
});

test('parse validates an address and returns its site', () => {
  const target = policy.parse('http://www.webtoons.com/en/fantasy/x/list?title_no=1');
  assert.equal(target.url.protocol, 'https:');
  assert.equal(target.site.referer, 'https://www.webtoons.com/');
  for (const bad of [null, '', 'nonsense', 'ftp://fanfox.net/', 'https://u:p@fanfox.net/', 'https://fanfox.net:8443/']) {
    assert.throws(() => policy.parse(bad), { code: 'bad_url' }, String(bad));
  }
  assert.throws(() => policy.parse('https://example.com/'), { code: 'host_not_allowed', extra: { host: 'example.com' } });
});

test('extra hosts go to the site they name, or to the first one', () => {
  const extended = policy.withExtraHosts('cdn.example.com, webtoon:img.example.net');
  assert.equal(extended.siteFor('cdn.example.com')?.id, 'fanfox');
  assert.equal(extended.siteFor('a.img.example.net')?.id, 'webtoon');
  assert.equal(policy.siteFor('cdn.example.com'), null, 'the original policy is not changed');
});

test('extra hosts must look like real domains of a known site', () => {
  const extended = policy.withExtraHosts('com, bad host, ,nosuchsite:cdn.example.org, cdn.example.com:8443, IMG.Example.net');
  assert.equal(extended.siteFor('img.example.net')?.id, 'fanfox');
  for (const refused of ['example.com', 'cdn.example.org', 'other.com']) assert.equal(extended.siteFor(refused), null, refused);
  assert.equal(policy.withExtraHosts(undefined), policy);
  assert.equal(policy.withExtraHosts(''), policy);
});
