---
capability: pack-storage-and-versions
last-updated: 2026-06-13
---

# pack-storage-and-versions

## Overview

Pack publishing, metadata retrieval, tarball delivery, version management, dist-tag
management, and unpublishing. Covers the full pack lifecycle from initial publish through
deletion, including manifest validation, SemVer enforcement, per-scope storage limits,
integrity hashing, and access control for private packs.

## Behavior

### Publishing

- `POST /v1/publish` accepts a multipart form with a `tarball` file field and a
  `metadata` JSON string field; both fields are required or the request returns HTTP 400
  (src/routes/publishRoutes.js:63-68).
- The tarball has a hard 50 MB ceiling enforced at the multer layer, independent of any
  per-scope limits (src/routes/publishRoutes.js:9-12).
- The `metadata` value must be valid JSON; a parse failure returns HTTP 400
  (src/routes/publishRoutes.js:72-76).
- The manifest must include all eight fields: `name`, `version`, `description`, `type`,
  `author`, `license`, `engine`, `validation`; any missing field returns HTTP 400
  (src/routes/publishRoutes.js:14; src/routes/publishRoutes.js:78-82).
- `version` must satisfy full SemVer syntax including optional pre-release and build
  metadata segments (src/routes/publishRoutes.js:15; src/routes/publishRoutes.js:84-86).
- `name` must be in `@scope/name` format; a missing `@` prefix or absent `/` returns
  HTTP 400 (src/routes/publishRoutes.js:17-23; src/routes/publishRoutes.js:88-93).
- The publishing token's `scopes` array must include the pack's scope, or the token must
  carry `admin:true`; mismatch returns HTTP 403
  (src/routes/publishRoutes.js:95-98).
- An optional `tag` field in the form body may name an additional dist-tag to apply on
  publish; it must match `/^[a-z0-9][a-z0-9._-]*$/i` or the request returns HTTP 400
  (src/routes/publishRoutes.js:100-104).

### Per-scope storage limits

- Default limits per scope: 2 MB per tarball, 20 versions per package, 50 MB total scope
  storage (src/config.js:6-10).
- A scope listed in the config `bypass` array has all limits skipped
  (src/config.js:33-35; src/routes/publishRoutes.js:28-30).
- Named overrides in the config `overrides` map are merged into the defaults for that
  scope (src/config.js:36-40).
- Limit checks run before any database write; a violation returns HTTP 400
  (src/routes/publishRoutes.js:107-110).
- The scope storage check sums all existing versions across all packages in the scope,
  not only the current package being published (src/routes/publishRoutes.js:38-46).

### Atomic write pattern

- The database INSERT for the new version row runs before any file is written; a conflict
  on `(package_id, version)` returns HTTP 409 and no file is written
  (src/routes/publishRoutes.js:124-134).
- After the DB INSERT succeeds, the tarball is written to a `.tmp` file and then renamed
  to the final `.tgz` path, preventing partial writes visible to readers
  (src/routes/publishRoutes.js:137-139).
- Tarballs are stored under `$DATA_DIR/packages/@scope/name/version.tgz`
  (src/routes/publishRoutes.js:114-115).
- The `packages` row is created with `INSERT OR IGNORE` on first publish; subsequent
  publishes of the same package reuse the existing row (src/routes/publishRoutes.js:121).

### Owner convention

- The `owner_handle` column on a `packages` row is always set to the scope string at
  publish time, not to the publishing account's handle; the code comment documents this
  as an intentional convention (src/routes/publishRoutes.js:119-121).
- Ownership checks on unpublish compare `req.user.sub` against `owner_handle`, so only a
  token whose subject equals the scope can unpublish without `?force=true`
  (src/routes/unpublishRoutes.js:20-21). For human tokens `sub` is the account handle; a
  human whose handle differs from the scope they published to fails this check.

### Integrity

- A SHA-256 digest of the tarball bytes is computed and stored with every version row and
  returned in the publish response; the format is `sha256-<base64>`
  (src/integrity.js:3-7; src/routes/publishRoutes.js:112; src/routes/publishRoutes.js:157).

### Dist-tags on publish

- Every successful publish unconditionally upserts the `latest` dist-tag to the published
  version (src/routes/publishRoutes.js:141-144).
- If a non-`latest` `tag` was supplied in the request body, that tag is also upserted
  after `latest` is set (src/routes/publishRoutes.js:146-151).

### Private packs

- A pack is private when `manifest.private === true`; the value is stored as
  `is_private = 1` in the `packages` row (src/routes/publishRoutes.js:121).
- Private packs are accessible only to the package owner or an admin; all other callers
  receive HTTP 404 (not 403) for both metadata and tarball endpoints
  (src/routes/packageRoutes.js:18-22).
- Private packs are excluded from `GET /v1/index.json` and `GET /v1/search` results
  (src/routes/packageRoutes.js:33; src/routes/packageRoutes.js:117-118).

### Package metadata

- `GET /v1/packages/@:scope/:name` returns a JSON object with `name`, `owner`,
  `dist_tags`, `totalDownloads` (summed across all versions), and a `versions` array
  with parsed manifests (src/routes/packageRoutes.js:63-101).
- The `versions` array is ordered by `published_at DESC`
  (src/routes/packageRoutes.js:73-77).

### Tarball download

- `GET /v1/packages/@:scope/:name/:file` serves the tarball; the `:file` parameter must
  end with `.tgz` or the request returns HTTP 400
  (src/routes/packageRoutes.js:143-146).
- The resolved path is validated with `safePath` before any file system access; a path
  that would escape `DATA_DIR` returns HTTP 400
  (src/routes/packageRoutes.js:163-165; src/safePath.js:5-13).
- Each successful download increments `versions.downloads` by 1 and emits a
  `tapestry_downloads_total` Prometheus counter increment
  (src/routes/packageRoutes.js:171-174).
- The response `Content-Type` is `application/x-gzip`
  (src/routes/packageRoutes.js:176).

### Index and search

- `GET /v1/index.json` returns a catalog of all public packages with every version,
  integrity digests, and keywords sourced from `manifest.meta.keywords`
  (src/routes/packageRoutes.js:28-60).
- `GET /v1/search?q=` returns the latest version of public packages whose `name` or
  serialized manifest JSON contains the query string (case-insensitive substring match);
  an empty query string returns an empty results array
  (src/routes/packageRoutes.js:104-141).

### Dist-tags management

- `GET /v1/packages/@:scope/:name/dist-tags` returns the `{ tag: version }` map; returns
  HTTP 404 if the package does not exist (src/routes/packTagRoutes.js:9-19).
- `PATCH /v1/packages/@:scope/:name/dist-tags/:tag` (requireAuth) updates or creates a
  tag; the caller must be the package owner or an admin, and the target version must
  already exist in `versions`; a nonexistent version returns HTTP 422
  (src/routes/packTagRoutes.js:23-45).

### Unpublish

- `DELETE /v1/packages/@:scope/:name/:version` (requireAuth) deletes a single version row
  and its tarball file; if that was the last version, the `packages` row is also removed
  in the same transaction (src/routes/unpublishRoutes.js:12-51).
- Non-owner callers must supply `?force=true` and have `is_admin = 1`; force by a
  non-admin returns HTTP 403 (src/routes/unpublishRoutes.js:21-29).
- `DELETE /v1/packages/@:scope/:name` (requireAuth) removes all versions and the package
  row in a transaction; tarball files are then deleted individually and the package
  directory is removed if empty; the directory path is validated with `safePath`
  (src/routes/unpublishRoutes.js:53-99; src/safePath.js:5-13).
- Tarball file deletion failures after the DB transaction log a warning but do not fail
  the request (src/routes/unpublishRoutes.js:45-48; src/routes/unpublishRoutes.js:76-80).

## Rejected and Reverted

- None on record.

## Change Log

- None on record.
