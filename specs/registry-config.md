---
capability: registry-config
last-updated: 2026-06-13
---

# registry-config

## Overview

Engine channel management and game-preset management. Both sub-systems expose read-only
endpoints for clients and restrict writes to privileged callers: CI auth for engine
channels, admin user tokens for presets.

## Behavior

### Engine channels

- `GET /v1/engine-channels` returns all channel rows ordered by channel name
  (src/routes/engineChannelRoutes.js:9-12).
- `GET /v1/engine-channels/:channel` returns a single channel row or HTTP 404 if the
  name is not found (src/routes/engineChannelRoutes.js:14-20).
- `PATCH /v1/admin/engine-channels/:channel` requires `requireCIAuth`; user access tokens
  are not accepted for this route (src/routes/engineChannelRoutes.js:22).
- The PATCH body must include both `docker_tag` and `version`; a missing field returns
  HTTP 400 (src/routes/engineChannelRoutes.js:26-31).
- The update is an upsert: an existing channel is updated in place; a new channel name
  creates a new row; `updated_at` is set to the current UTC time on every write
  (src/routes/engineChannelRoutes.js:33-43).
- Two channels are seeded on database initialization: `nightly` with
  `docker_tag='edge', version='edge'` and `stable` with
  `docker_tag='latest', version='latest'` (src/db.js:47-50).

### Presets

- `GET /v1/presets` returns all preset rows with `name`, `version`, `engine_channel`, and
  `updated_at`; the `packs` field is omitted from the list response
  (src/routes/presetRoutes.js:9-12).
- `GET /v1/presets/:name` returns the full preset row including `packs` as a parsed JSON
  object (not a string); returns HTTP 404 if not found
  (src/routes/presetRoutes.js:16-25).
- `PATCH /v1/admin/presets/:name` requires `requireAuth` and additionally checks that the
  authenticated account has `is_admin = 1` in the database; CI tokens cannot write
  presets (src/routes/presetRoutes.js:29-32).
- The PATCH body requires `version`, `engine_channel`, and `packs`; a missing field
  returns HTTP 400 (src/routes/presetRoutes.js:34-36).
- The operation is an upsert (`INSERT OR REPLACE`); the `packs` value is serialized to
  JSON before storage and parsed back on read
  (src/routes/presetRoutes.js:38-42; src/routes/presetRoutes.js:24).
- `DELETE /v1/admin/presets/:name` requires the same admin check; deleting a
  nonexistent preset returns HTTP 404 (src/routes/presetRoutes.js:45-55).
- One preset is seeded on database initialization: `starter` at version `0.0.1` on the
  `stable` channel with packs `{ "@tapestry/core": "0.0.2", "@tapestry/example-pack": "0.0.2" }`
  (src/db.js:91-94).

## Rejected and Reverted

- None on record.

## Change Log

- None on record.
