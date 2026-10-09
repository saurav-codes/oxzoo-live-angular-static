# angular-static

Deployed with [ox](https://deploywithox.com): deploy a repo to your own server with one command, no Docker. [Docs](https://deploywithox.com/docs) · [Guide for this stack](https://deploywithox.com/docs/guides/angular)

**Live demo:** https://angular-static.s4.zoo.sorv.dev

> **Role in the zoo:** project `angular-static` of [oxzoo-live](https://github.com/saurav-codes/oxzoo-live-control/blob/main/zoo/README.md#projects), deployed with [ox](https://deploywithox.com) on server s4 at https://angular-static.s4.zoo.sorv.dev. The contract it follows is [DESIGN.md](https://github.com/saurav-codes/oxzoo-live-control/blob/main/zoo/DESIGN.md).

Angular 20 standalone app (zoneless, signals) built to static files and served by
Caddy straight from the release. Server s4, proof level P3, probe kind `iframe`.

## What it proves

- ox deploys an Angular static site zero-config: no `ox.toml`. `angular.json`
  gives `[static] dir = "dist/angular-static/browser"` with the SPA fallback, so
  `/selftest` serves `index.html`.
- Build-time variables reach the build: `npm run build` runs `prebuild`
  (`scripts/zoo-config.mjs`), which validates `CATALOG_URL`, `SEARCH_URL` and
  `ZOO_PANEL_ORIGIN` (https, or http on localhost/127.0.0.1, origin only) and
  writes `public/zoo-config.json` and `public/_zoo/health.json`. A bad value fails
  the build; a missing one stays `null` and the self test reports `X is not set`.
- Browser CORS to s2: the catalog page lists catalog-api items with a browser
  `fetch`. `/selftest` runs four CORS calls (catalog-api `/api/items`, search-svc
  `/api/search?q=zoo`, both peers' `/_zoo/health`), 8 s each, side by side, and
  builds the DESIGN.md probe JSON with hops `angular-static@s4` -> peer.
- postMessage only to an allowlisted parent: on `{type: "zoo-probe"}` from
  `window.parent`, the page checks `event.origin` against the build-time
  `ZOO_PANEL_ORIGIN` list (exact match) and replies
  `{type: "zoo-probe-result", probe}` to `event.origin` only. Opened directly, it
  runs once and shows the result.

Static health: `GET /_zoo/health.json` (a file, so no uptime and no CORS
headers; the panel reads the probe through the iframe instead).

Peer shapes assumed until catalog-api and search-svc exist: `/api/items` returns
`{"items": [...]}` or a bare array, `/api/search` returns `{"hits": [...]}`, and
`/_zoo/health` returns `name` equal to the peer.

## ox features exercised

zero-config detection (angular.json, package-lock.json, `engines.node`),
`[static]` with SPA fallback, build-time variables, `.env.example` needed keys.

## Variables

| Key | Source | Role |
| --- | --- | --- |
| `CATALOG_URL` | yours, build time | url (`https://catalog-api.s2.zoo.sorv.dev`) |
| `SEARCH_URL` | yours, build time | url (`https://search-svc.s2.zoo.sorv.dev`) |
| `ZOO_PANEL_ORIGIN` | yours, build time | plain (`https://zoo-control.s1.zoo.sorv.dev`) |
| `OX_RELEASE`, `OX_ENV`, `PUBLIC_HOST` | provided, read at build | release, env, server label |

Changing any of them needs a rebuild, which a variable save does on its own.

For the peers: catalog-api's and search-svc's `CORS_ORIGINS` must list
`https://angular-static.s4.zoo.sorv.dev`. Their `/_zoo/health` follows
`ZOO_PANEL_ORIGIN`, so the `peer-health:*` checks pass only if that list holds
the angular-static origin too.

## Tests

```console
$ npm ci
$ npm test          # node:test: config validation, origin check, probe assembly
$ npm run build     # prebuild + ng build into dist/angular-static/browser
```

Recorded: `npm test` 8 pass, 0 fail. `npm run build` with production values
writes `dist/angular-static/browser/zoo-config.json` and `_zoo/health.json`.
Not checked in a browser yet: the iframe postMessage round trip against the real panel.

## ox check

```console
$ /tmp/oxz/ox check .
ox check . (manifest: none)

  static.dir                 dist/angular-static/browser                          detected:angular.json
  build.install              npm ci                                               detected:package-lock.json
  build.commands[0]          npm run build                                        detected:package.json
  tools.node                 24                                                   detected:package.json

  Provided by ox: PORT, HOST, OX_ENV, OX_PROJECT, OX_RELEASE, OX_DATA_DIR, PUBLIC_URL, PUBLIC_HOST
  Set on the dashboard before the first deploy: CATALOG_URL, SEARCH_URL, ZOO_PANEL_ORIGIN

Ready to deploy.
```

`static.spa` is `true` in `ox check --json` but has no row in the text output.
