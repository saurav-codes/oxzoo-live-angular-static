// Prebuild: bakes build-time variables into public/zoo-config.json and writes
// public/_zoo/health.json (DESIGN.md Static projects). Bad values stop the build.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const NAME = 'angular-static';
export const STACK = 'Angular 20 static';
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1']);

// An origin is https, or http on localhost/127.0.0.1, with no path, query,
// fragment, or credentials. Returns the normalized origin or throws.
export function checkOrigin(name, raw) {
  let u;
  try {
    u = new URL(raw);
  } catch {
    throw new Error(`${name}: not a URL: ${JSON.stringify(raw)}`);
  }
  const local = u.protocol === 'http:' && LOCAL_HOSTS.has(u.hostname);
  if (u.protocol !== 'https:' && !local) throw new Error(`${name}: must be https (or http://localhost): ${raw}`);
  if (u.username || u.password) throw new Error(`${name}: must not carry credentials`);
  if ((u.pathname !== '/' && u.pathname !== '') || u.search || u.hash) {
    throw new Error(`${name}: must be an origin with no path, query, or fragment: ${raw}`);
  }
  return u.origin;
}

export function serverLabel(host) {
  for (const label of (host ?? '').split('.')) if (/^s[0-9]+$/.test(label)) return label;
  return 'local';
}

// A missing URL stays null so the selftest reports "X is not set".
export function buildConfig(env, builtAt) {
  const url = (k) => (env[k] ? checkOrigin(k, env[k].trim()) : null);
  const origins = (env.ZOO_PANEL_ORIGIN ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean)
    .map((o) => checkOrigin('ZOO_PANEL_ORIGIN', o));
  return {
    name: NAME,
    stack: STACK,
    release: env.OX_RELEASE ? env.OX_RELEASE.slice(0, 12) : 'unknown',
    env: env.OX_ENV || 'local',
    built_at: builtAt,
    catalog_url: url('CATALOG_URL'),
    search_url: url('SEARCH_URL'),
    panel_origins: origins,
  };
}

export function buildHealth(env, builtAt, angularVersion) {
  return {
    name: NAME,
    stack: STACK,
    server: serverLabel(env.PUBLIC_HOST),
    release: env.OX_RELEASE ? env.OX_RELEASE.slice(0, 12) : 'unknown',
    env: env.OX_ENV || 'local',
    build: { built_at: builtAt, runtime: `angular ${angularVersion}` },
  };
}

function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const builtAt = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  const angular = JSON.parse(readFileSync(join(root, 'node_modules/@angular/core/package.json'), 'utf8')).version;
  const config = buildConfig(process.env, builtAt);
  mkdirSync(join(root, 'public/_zoo'), { recursive: true });
  writeFileSync(join(root, 'public/zoo-config.json'), JSON.stringify(config, null, 2) + '\n');
  writeFileSync(join(root, 'public/_zoo/health.json'), JSON.stringify(buildHealth(process.env, builtAt, angular), null, 2) + '\n');
  const missing = ['CATALOG_URL', 'SEARCH_URL', 'ZOO_PANEL_ORIGIN'].filter((k) => !process.env[k]);
  console.log(`zoo-config: wrote public/zoo-config.json and public/_zoo/health.json${missing.length ? ` (not set: ${missing.join(', ')})` : ''}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    console.error(`zoo-config: ${err.message}`);
    process.exit(1);
  }
}
