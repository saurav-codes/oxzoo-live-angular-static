import { ZooConfig } from './probe';

let cached: Promise<ZooConfig> | null = null;

// Written at build time by scripts/zoo-config.mjs; same origin, so no CORS.
export function loadConfig(): Promise<ZooConfig> {
  cached ??= fetch('/zoo-config.json', { cache: 'no-store' }).then((r) => {
    if (!r.ok) throw new Error(`zoo-config.json: status ${r.status}`);
    return r.json() as Promise<ZooConfig>;
  });
  return cached;
}
