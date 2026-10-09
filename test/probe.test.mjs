import assert from 'node:assert/strict';
import { test } from 'node:test';
import { hitsOf, isProbeRequest, itemsOf, originAllowed, runCheck, runProbe, CHECKS } from '../src/app/probe.ts';

const config = {
  name: 'angular-static', stack: 'Angular 20 static', release: 'abc', env: 'production', built_at: 'x',
  catalog_url: 'https://catalog-api.s2.zoo.sorv.dev', search_url: 'https://search-svc.s2.zoo.sorv.dev',
  panel_origins: ['https://zoo-control.s1.zoo.sorv.dev'],
};
const reply = (status, body) => Promise.resolve({ status, json: () => Promise.resolve(body) });
const good = (url) => {
  if (url.endsWith('/api/items')) return reply(200, { items: [{ sku: 'ZOO-1' }] });
  if (url.endsWith('/api/search?q=zoo')) return reply(200, { hits: [] });
  return reply(200, { name: url.includes('catalog') ? 'catalog-api' : 'search-svc', release: 'r1' });
};

test('origin check is exact', () => {
  const allowed = config.panel_origins;
  assert.equal(originAllowed('https://zoo-control.s1.zoo.sorv.dev', allowed), true);
  for (const o of ['https://zoo-control.s1.zoo.sorv.dev.evil.dev', 'http://zoo-control.s1.zoo.sorv.dev', 'null', '', '*']) assert.equal(originAllowed(o, allowed), false, o);
  assert.equal(isProbeRequest({ type: 'zoo-probe' }), true);
  for (const d of [null, 'zoo-probe', { type: 'other' }]) assert.equal(isProbeRequest(d), false);
});

test('body shapes', () => {
  assert.deepEqual(itemsOf([1]), [1]);
  assert.deepEqual(itemsOf({ items: [2] }), [2]);
  assert.equal(itemsOf({}), null);
  assert.deepEqual(hitsOf({ hits: [] }), []);
  assert.equal(hitsOf(null), null);
});

test('probe passes with good peers and has the DESIGN.md shape', async () => {
  const p = await runProbe(config, 'angular-static.s4.zoo.sorv.dev', good, () => new Date('2026-10-09T10:20:00.123Z'));
  assert.equal(p.ok, true);
  assert.equal(p.server, 's4');
  assert.equal(p.at, '2026-10-09T10:20:00Z');
  assert.deepEqual(p.checks.map((c) => c.id), ['cors:catalog-api', 'cors:search-svc', 'peer-health:catalog-api', 'peer-health:search-svc']);
  assert.deepEqual(p.checks[0].hops, ['angular-static@s4', 'catalog-api@s2']);
  assert.deepEqual(p.checks[1].env, ['SEARCH_URL']);
  assert.deepEqual(p.vars, [
    { name: 'CATALOG_URL', value: config.catalog_url, role: 'url', peer: 'catalog-api' },
    { name: 'SEARCH_URL', value: config.search_url, role: 'url', peer: 'search-svc' },
    { name: 'ZOO_PANEL_ORIGIN', value: 'https://zoo-control.s1.zoo.sorv.dev', role: 'plain' },
  ]);
});

test('failures: wrong name, bad status, CORS block, missing var, timeout', async () => {
  const p = await runProbe({ ...config, search_url: null }, 'localhost', (url) => {
    if (url.endsWith('/api/items')) return Promise.reject(new TypeError('Failed to fetch'));
    return reply(200, { name: 'someone-else' });
  });
  assert.equal(p.ok, false);
  const by = Object.fromEntries(p.checks.map((c) => [c.id, c]));
  assert.match(by['cors:catalog-api'].error, /network or CORS error/);
  assert.equal(by['cors:search-svc'].error, 'SEARCH_URL is not set');
  assert.match(by['peer-health:catalog-api'].error, /want catalog-api/);
  assert.deepEqual(p.vars[1], { name: 'SEARCH_URL', missing: true, role: 'url', peer: 'search-svc' });
  assert.equal((await runCheck(CHECKS[0], config, 'x@s4', () => reply(500, {}))).error, 'status 500');
  const hang = (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted'))));
  const t = await runCheck(CHECKS[0], config, 'x@s4', hang, 30);
  assert.equal(t.error, 'timeout after 30 ms');
});
