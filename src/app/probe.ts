// Browser-side probe for the panel's iframe (DESIGN.md Static projects).
// Pure functions with fetch injected, so node:test runs them unchanged.

export interface ZooConfig {
  name: string;
  stack: string;
  release: string;
  env: string;
  built_at: string;
  catalog_url: string | null;
  search_url: string | null;
  panel_origins: string[];
}

export interface CheckResult {
  id: string;
  label: string;
  ok: boolean;
  ms: number;
  detail?: string;
  error?: string;
  env: string[];
  hops: string[];
}

export interface Probe {
  name: string;
  stack: string;
  server: string;
  release: string;
  env: string;
  ok: boolean;
  ms: number;
  at: string;
  checks: CheckResult[];
  vars: Record<string, unknown>[];
}

type Fetch = (url: string, init: { signal: AbortSignal; mode: 'cors'; credentials: 'omit' }) => Promise<{ status: number; json(): Promise<unknown> }>;

interface CheckSpec {
  id: string;
  label: string;
  envName: 'CATALOG_URL' | 'SEARCH_URL';
  peer: string;
  path: string;
  validate: (body: unknown) => string;
}

export const PEER_TIMEOUT_MS = 8000;
export const PROBE_TIMEOUT_MS = 20000;

export function serverLabel(host: string): string {
  for (const label of host.split('.')) if (/^s[0-9]+$/.test(label)) return label;
  return 'local';
}

// Exact match against the build-time allowlist; never a prefix or a wildcard.
export function originAllowed(origin: string, allowed: readonly string[]): boolean {
  return origin !== '' && origin !== 'null' && allowed.includes(origin);
}

export function isProbeRequest(data: unknown): boolean {
  return typeof data === 'object' && data !== null && (data as { type?: unknown }).type === 'zoo-probe';
}

// Accepts {"items": [...]} or a bare array (catalog-api's shape is not fixed yet).
export function itemsOf(body: unknown): unknown[] | null {
  if (Array.isArray(body)) return body;
  const items = (body as { items?: unknown } | null)?.items;
  return Array.isArray(items) ? items : null;
}

export function hitsOf(body: unknown): unknown[] | null {
  const hits = (body as { hits?: unknown } | null)?.hits;
  return Array.isArray(hits) ? hits : null;
}

function expectList(what: string, list: unknown[] | null): string {
  if (!list) throw new Error(`unexpected body: no ${what} array`);
  return `${list.length} ${what}`;
}

function expectName(peer: string) {
  return (body: unknown): string => {
    const b = body as { name?: unknown; release?: unknown } | null;
    if (b?.name !== peer) throw new Error(`name is ${JSON.stringify(b?.name)}, want ${peer}`);
    return `release ${String(b.release ?? 'unknown')}`;
  };
}

export const CHECKS: CheckSpec[] = [
  { id: 'cors:catalog-api', label: 'Browser CORS GET catalog-api /api/items', envName: 'CATALOG_URL', peer: 'catalog-api', path: '/api/items', validate: (b) => expectList('items', itemsOf(b)) },
  { id: 'cors:search-svc', label: 'Browser CORS GET search-svc /api/search?q=zoo', envName: 'SEARCH_URL', peer: 'search-svc', path: '/api/search?q=zoo', validate: (b) => expectList('hits', hitsOf(b)) },
  { id: 'peer-health:catalog-api', label: 'Browser CORS GET catalog-api /_zoo/health', envName: 'CATALOG_URL', peer: 'catalog-api', path: '/_zoo/health', validate: expectName('catalog-api') },
  { id: 'peer-health:search-svc', label: 'Browser CORS GET search-svc /_zoo/health', envName: 'SEARCH_URL', peer: 'search-svc', path: '/_zoo/health', validate: expectName('search-svc') },
];

function baseUrl(config: ZooConfig, envName: CheckSpec['envName']): string | null {
  return envName === 'CATALOG_URL' ? config.catalog_url : config.search_url;
}

export async function runCheck(spec: CheckSpec, config: ZooConfig, self: string, fetchFn: Fetch, timeoutMs = PEER_TIMEOUT_MS): Promise<CheckResult> {
  const base = baseUrl(config, spec.envName);
  const result = { id: spec.id, label: spec.label, env: [spec.envName], hops: [self] };
  if (!base) return { ...result, ok: false, ms: 0, error: `${spec.envName} is not set` };
  result.hops.push(`${spec.peer}@${serverLabel(new URL(base).hostname)}`);
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const t0 = performance.now();
  try {
    const res = await fetchFn(base + spec.path, { signal: ac.signal, mode: 'cors', credentials: 'omit' });
    if (res.status !== 200) throw new Error(`status ${res.status}`);
    const detail = spec.validate(await res.json());
    return { ...result, ok: true, ms: Math.round(performance.now() - t0), detail };
  } catch (err) {
    const ms = Math.round(performance.now() - t0);
    // A CORS refusal surfaces as a bare TypeError: the browser hides the reason.
    const msg = ac.signal.aborted ? `timeout after ${timeoutMs} ms` : err instanceof TypeError ? `network or CORS error: ${err.message}` : String((err as Error).message ?? err);
    return { ...result, ok: false, ms, error: msg.slice(0, 300) };
  } finally {
    clearTimeout(timer);
  }
}

export function describeVars(config: ZooConfig): Record<string, unknown>[] {
  const url = (name: string, value: string | null, peer: string) => (value ? { name, value, role: 'url', peer } : { name, missing: true, role: 'url', peer });
  return [
    url('CATALOG_URL', config.catalog_url, 'catalog-api'),
    url('SEARCH_URL', config.search_url, 'search-svc'),
    config.panel_origins.length ? { name: 'ZOO_PANEL_ORIGIN', value: config.panel_origins.join(','), role: 'plain' } : { name: 'ZOO_PANEL_ORIGIN', missing: true, role: 'plain' },
  ];
}

export function assembleProbe(config: ZooConfig, server: string, checks: CheckResult[], at: Date, ms: number): Probe {
  return {
    name: config.name,
    stack: config.stack,
    server,
    release: config.release,
    env: config.env,
    ok: checks.length > 0 && checks.every((c) => c.ok),
    ms,
    at: at.toISOString().replace(/\.\d{3}Z$/, 'Z'),
    checks,
    vars: describeVars(config),
  };
}

// Checks run side by side, each capped at 8 s, so the whole stays under 20 s.
export async function runProbe(config: ZooConfig, host: string, fetchFn: Fetch, now = () => new Date()): Promise<Probe> {
  const server = serverLabel(host);
  const self = `${config.name}@${server}`;
  const at = now();
  const t0 = performance.now();
  const checks = await Promise.all(CHECKS.map((c) => runCheck(c, config, self, fetchFn)));
  return assembleProbe(config, server, checks, at, Math.round(performance.now() - t0));
}
