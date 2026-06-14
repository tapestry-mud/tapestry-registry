---
capability: api-surface
updated: 2026-06-13
---

# api-surface

## Overview

The Express application envelope: route mounting, CORS policy, per-endpoint rate-limit
tiers, the health and Prometheus metrics endpoints, structured HTTP logging, SQLite
database initialization and migrations, and the startup bootstrap sequence.

## Behavior

### Application factory

- `createApp({ db, dataDir, config, metrics })` in `src/server.js` is an Express app
  factory; all `/v1/` route groups are registered only when `db` is truthy
  (src/server.js:26; src/server.js:62-79).
- `src/index.js` bootstraps the process: it initializes the database, loads config, seeds
  metrics from the database, constructs the app, and starts the HTTP listener
  (src/index.js:15-23).
- Environment variable defaults: `DATA_DIR=/var/tapestry-registry/data`,
  `DB_PATH=$DATA_DIR/registry.db`,
  `CONFIG_PATH=/var/tapestry-registry/registry-config.yaml`, `PORT=3002`
  (src/index.js:8-11).

### CORS

- The CORS middleware hard-codes a single allowed origin, `https://tapestryengine.com`;
  `Access-Control-Allow-Methods` exposes only `GET` and `OPTIONS`
  (src/server.js:24; src/server.js:31-33).
- `OPTIONS` preflight requests receive HTTP 204 immediately, before any rate limiter or
  route handler (src/server.js:34-38).
- The `Access-Control-Allow-Headers` value is `Content-Type, Authorization`
  (src/server.js:33).

### Rate limiting

- A global limiter of 120 requests per minute per IP is applied before all routes
  (src/server.js:22; src/server.js:44).
- Tighter per-route limiters are applied before the relevant route handlers: login 5 per
  15 minutes, register 3 per hour, change-password 5 per 15 minutes, refresh 30 per 15
  minutes, CI token exchange 60 per minute, trusted-publisher writes 30 per minute,
  publish 20 per hour (src/server.js:15-21).
- All rate limiters set `skip: isTest` and are therefore bypassed when
  `NODE_ENV === 'test'` (src/server.js:14-22).

### Health and metrics endpoints

- `GET /health` returns `{ "status": "ok" }` with HTTP 200; it is registered before the
  db-conditional block and is always available regardless of database state
  (src/server.js:46-48).
- `GET /metrics` returns a Prometheus text exposition and is registered only when a
  `metrics` object is passed to `createApp` (src/server.js:50-59).
- Four custom metrics are exposed: `tapestry_downloads_total` (counter, labels
  scope/name/version), `tapestry_publishes_total` (counter, labels scope/name),
  `tapestry_storage_bytes` (gauge), `tapestry_active_packages` (gauge)
  (src/metrics.js:7-31).
- On startup, `tapestry_storage_bytes` and `tapestry_active_packages` are initialized
  from database aggregates before the server begins listening
  (src/metrics.js:36-42; src/index.js:18).

### HTTP logging

- `pino-http` structured request logging is applied as application-level middleware in
  all environments except `test` (src/server.js:41-43).

### Database initialization

- `initDb(dbPath)` opens or creates a SQLite file in WAL journal mode with foreign keys
  enforced (src/db.js:3-6).
- Eight tables are created with `CREATE TABLE IF NOT EXISTS`: `accounts`, `packages`,
  `versions`, `engine_channels`, `pack_tags`, `presets`, `trusted_publishers`,
  `refresh_tokens` (src/db.js:8-89).
- `versions.package_id` has a cascading delete foreign key referencing `packages.id`;
  `refresh_tokens.account_id` has a cascading delete foreign key referencing `accounts.id`
  (src/db.js:28-29; src/db.js:83-84).
- An additive migration adds `is_private INTEGER NOT NULL DEFAULT 0` to `packages` if the
  column is absent; this runs on every startup and is a no-op once the column exists
  (src/db.js:101-103).
- Seed rows are inserted with `INSERT OR IGNORE` so they apply only on first
  initialization: two engine channels (`nightly`, `stable`), one preset (`starter`), and
  one trusted-publisher binding for scope `tapestry`
  (src/db.js:47-50; src/db.js:91-99).

## Rejected and Reverted

- None on record.

## Change Log

- None on record.
