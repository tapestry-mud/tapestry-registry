---
capability: auth
last-updated: 2026-06-13
---

# auth

## Overview

User account management, JWT-based session tokens, rotating refresh tokens, and the GitHub
OIDC trusted-publisher flow used by CI pipelines to obtain scoped access tokens. Provides
the `requireAuth` and `requireCIAuth` middleware consumed by every protected route in the
registry.

## Behavior

### Account registration

- `POST /v1/auth/register` accepts `handle`, `email`, and `password` in the request body;
  all three are required or the request returns HTTP 400
  (src/routes/authRoutes.js:28-31).
- Handles must match `/^[a-z0-9-]+$/` (lowercase alphanumeric and hyphens only); the five
  reserved handles `tapestry`, `core`, `admin`, `system`, `official` are rejected with
  HTTP 400 (src/routes/authRoutes.js:7; src/routes/authRoutes.js:32-37).
- A successful registration returns HTTP 201 with `{ access_token, refresh_token }` and
  stores the bcrypt-hashed password in the `accounts` table
  (src/routes/authRoutes.js:39-44; src/db.js:9-16).
- A duplicate handle or email returns HTTP 409 (src/routes/authRoutes.js:46-48).

### Login

- `POST /v1/auth/login` accepts `email` and `password`; a missing field returns HTTP 400
  and a credential mismatch returns HTTP 401 (src/routes/authRoutes.js:53-66).
- The response body is `{ access_token, refresh_token }`, identical in structure to
  registration (src/routes/authRoutes.js:63).

### Access tokens

- Access tokens are JWTs signed with `JWT_SECRET`; the payload carries `sub` (account
  handle), `kind` (`human` for user sessions, `ci` for CI tokens), `scopes` (array of
  scope strings), and `admin` (boolean) (src/auth.js:14-19).
- The access token TTL is 15 minutes (src/auth.js:11).
- `JWT_SECRET` is required in production; the process throws at startup if it is absent
  and `NODE_ENV` is not `test` (src/auth.js:5-7).
- For human sessions, `scopes` is set to `[account.handle]` -- the user can publish only
  to the scope that matches their handle (src/routes/authRoutes.js:9-15).

### Refresh tokens and rotation

- Refresh tokens are 32 cryptographically random bytes encoded as base64url; they are
  stored in `refresh_tokens` as a SHA-256 hex digest -- never in plaintext
  (src/auth.js:22-28; src/db.js:81-88).
- The refresh token TTL is 30 days (src/auth.js:12; src/routes/authRoutes.js:19).
- `POST /v1/auth/refresh` validates the presented token, checks expiry, revokes the
  presented row, and issues a fresh `{ access_token, refresh_token }` pair (token
  rotation) (src/routes/authRoutes.js:87-113).
- If a token that was already revoked is presented at `/refresh`, all active refresh
  tokens for that account are immediately revoked; the response is HTTP 401 with
  `{ error: 'refresh token reuse detected; session revoked' }`
  (src/routes/authRoutes.js:96-101).
- Expiry is checked after the revocation check; an expired but not-yet-revoked token
  returns HTTP 401 with `{ error: 'refresh token expired' }`
  (src/routes/authRoutes.js:103-106).

### Change password and logout

- `POST /v1/auth/change-password` requires a valid access token (`requireAuth`) plus
  `currentPassword` and `newPassword` in the body; an incorrect current password returns
  HTTP 401 (src/routes/authRoutes.js:69-85).
- `POST /v1/auth/logout` revokes the supplied `refresh_token` if present; the endpoint
  always returns HTTP 200 regardless of whether the token existed
  (src/routes/authRoutes.js:116-124).

### requireAuth middleware

- Routes protected by `requireAuth` require an `Authorization: Bearer <token>` header; a
  missing or malformed header returns HTTP 401
  (src/auth.js:42-48).
- An expired or otherwise invalid JWT returns HTTP 401 with
  `{ error: 'invalid or expired token' }` (src/auth.js:49-52).
- On success, the verified JWT payload is attached to `req.user` (src/auth.js:48).

### GitHub OIDC CI auth

- `requireCIAuth` verifies tokens issued by `https://token.actions.githubusercontent.com`
  against GitHub's JWKS endpoint; the expected audience is
  `https://registry.tapestryengine.com` (src/ciAuth.js:3-4; src/ciAuth.js:34-38).
- The set of allowed GitHub repositories is controlled by the `OIDC_ALLOWED_REPOS`
  environment variable (comma-separated); if the variable is empty or unset, every CI
  auth attempt fails with HTTP 403 (src/ciAuth.js:27-29; src/ciAuth.js:52-55).
- A request whose `repository` claim is not in the allowed list returns HTTP 403
  with `{ error: 'repository not authorized' }` (src/ciAuth.js:53-55).
- On success, `req.ciAuth` is set to `true` (src/ciAuth.js:56).

### CI token exchange

- `POST /v1/token` accepts a GitHub OIDC id-token in `Authorization: Bearer` and a
  `scope` field in the body; the id-token is verified by `verifyOIDC`
  (src/routes/tokenRoutes.js:8-23).
- The `(scope, repository)` pair is looked up in `trusted_publishers`; no matching row
  returns HTTP 403 (src/routes/tokenRoutes.js:25-29).
- If the binding records a `ref` value, it must match the OIDC payload's `ref`; likewise
  for `environment`; a mismatch returns HTTP 403 (src/routes/tokenRoutes.js:30-35).
- A successful exchange returns `{ access_token }` with `kind:'ci'`, `admin:false`, and
  `scopes` limited to the single bound scope; no refresh token is issued
  (src/routes/tokenRoutes.js:37-39).

### Trusted publisher management

- `POST /v1/trusted-publishers` (requireAuth) creates a binding of `scope` and `repo`;
  the caller must be the scope owner (`sub` equals scope) or an admin; a missing `scope`
  or `repo` field returns HTTP 400 (src/routes/trustedPublisherRoutes.js:7-28).
- `GET /v1/trusted-publishers` (requireAuth) returns bindings for the caller's own scope;
  admins may omit the scope filter to see all bindings or pass `?scope=` to filter
  (src/routes/trustedPublisherRoutes.js:30-40).
- `DELETE /v1/trusted-publishers/:id` (requireAuth) requires scope ownership or admin;
  returns HTTP 404 if the binding does not exist
  (src/routes/trustedPublisherRoutes.js:43-53).
- A duplicate `(scope, repo)` pair on creation returns HTTP 409
  (src/routes/trustedPublisherRoutes.js:23-25).
- One binding is seeded on database initialization: scope `tapestry`, repo
  `tapestry-mud/tapestry-packs`, no ref or environment constraint
  (src/db.js:96-99).

## Rejected and Reverted

- None on record.

## Change Log

- None on record.
