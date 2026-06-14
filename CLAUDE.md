# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm ci                                    # install
npm test                                  # run all tests (68 tests, 8 suites)
npm test -- test/auth.test.js            # run a single suite
npm start                                 # start server on :3002
```

Never use `npx jest` directly. The test script uses `--experimental-vm-modules` because `jose` (used in `src/ciAuth.js`) is ESM-only. Running jest without that flag produces false OIDC verification failures.

## Directory layout

```
src/
  index.js        # entry point, wires db/config/metrics, binds :3002
  server.js       # Express app factory (createApp); all route mounting here
  db.js           # SQLite schema init via better-sqlite3
  auth.js         # JWT sign/verify, bcrypt, requireAuth middleware
  ciAuth.js       # GitHub Actions OIDC verification for trusted publishing
  config.js       # registry-config.yaml loader and per-scope limit lookup
  metrics.js      # prom-client counters and gauges
  integrity.js    # tarball sha512 digest helpers
  safePath.js     # path traversal guard for tarball storage
  routes/         # one file per route group (auth, publish, package, etc.)
test/             # Jest suites using supertest against in-memory SQLite
specs/            # canonical behavior documentation (see below)
registry-config.yaml  # storage limits and bypass list example
```

## Architecture

Single Express server backed by SQLite (better-sqlite3, WAL mode). `src/index.js` boots it; `src/server.js` is a `createApp({ db, dataDir, config, metrics })` factory so tests can construct a clean app without touching disk.

Auth uses two token kinds: short-lived JWTs (15 min, signed with `JWT_SECRET`) for API calls, and opaque refresh tokens (30 days, stored as SHA-256 hashes in SQLite). CI publishing bypasses this with GitHub Actions OIDC tokens verified against `https://token.actions.githubusercontent.com`; the allowed repos list comes from `OIDC_ALLOWED_REPOS` env var.

Tarballs land on disk under `DATA_DIR`. Metadata (manifest, integrity hash, size, download count) lives in SQLite. `registry-config.yaml` controls per-scope storage limits with a bypass list for privileged scopes; `src/config.js` merges it with defaults at startup.

Rate limiting is applied per route group in `server.js` and skipped automatically when `NODE_ENV=test`.

Required env vars in production: `JWT_SECRET`, `OIDC_ALLOWED_REPOS`. Optional: `DATA_DIR`, `DB_PATH`, `CONFIG_PATH`, `PORT` (defaults to 3002).

## System behavior

`specs/` is the canonical source of truth for how each system behaves. Read the relevant spec before changing behavior. The index and spec format contract are in `specs/README.md`.

## npm trusted publishing

Requires npm >= 11.5.1 and a `repository.url` field in `package.json`. The current `package.json` has neither; add both before attempting a provenance publish.
