import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildConfig, buildHealth, checkOrigin, serverLabel } from '../scripts/zoo-config.mjs';

test('checkOrigin accepts https and local http, normalizes', () => {
  assert.equal(checkOrigin('X', 'https://catalog-api.s2.zoo.sorv.dev/'), 'https://catalog-api.s2.zoo.sorv.dev');
  assert.equal(checkOrigin('X', 'http://localhost:5173'), 'http://localhost:5173');
  assert.equal(checkOrigin('X', 'http://127.0.0.1:8000'), 'http://127.0.0.1:8000');
});

test('checkOrigin refuses anything else', () => {
  for (const bad of ['http://catalog-api.s2.zoo.sorv.dev', 'ftp://x.dev', 'javascript:alert(1)', 'not a url', 'https://a.dev/path', 'https://a.dev/?q=1', 'https://a.dev/#x', 'https://u:p@a.dev', 'http://localhost.evil.dev']) {
    assert.throws(() => checkOrigin('CATALOG_URL', bad), /CATALOG_URL/, bad);
  }
});

test('buildConfig keeps missing URLs null and splits the panel allowlist', () => {
  const c = buildConfig({ SEARCH_URL: 'https://search-svc.s2.zoo.sorv.dev', ZOO_PANEL_ORIGIN: 'https://zoo-control.s1.zoo.sorv.dev, http://localhost:5173', OX_RELEASE: '0123456789abcdef', OX_ENV: 'production' }, '2026-10-09T10:00:00Z');
  assert.equal(c.catalog_url, null);
  assert.equal(c.search_url, 'https://search-svc.s2.zoo.sorv.dev');
  assert.deepEqual(c.panel_origins, ['https://zoo-control.s1.zoo.sorv.dev', 'http://localhost:5173']);
  assert.equal(c.release, '0123456789ab');
  assert.equal(c.env, 'production');
  assert.throws(() => buildConfig({ ZOO_PANEL_ORIGIN: 'https://ok.dev,*' }, 'x'), /ZOO_PANEL_ORIGIN/);
});

test('buildHealth follows the health shape without uptime', () => {
  const h = buildHealth({ PUBLIC_HOST: 'angular-static.s4.zoo.sorv.dev' }, '2026-10-09T10:00:00Z', '20.3.33');
  assert.deepEqual(h, { name: 'angular-static', stack: 'Angular 20 static', server: 's4', release: 'unknown', env: 'local', build: { built_at: '2026-10-09T10:00:00Z', runtime: 'angular 20.3.33' } });
  assert.equal(serverLabel(undefined), 'local');
});
