# tapestry-registry

Pack registry for the [Tapestry MUD engine](https://tapestryengine.com).

Hosted at `registry.tapestryengine.com`. The Tapestry CLI (`tapestry publish`, `tapestry install`, `tapestry search`) talks to this service. Pack authors publish here; game operators install from here. Browse what's available at [tapestryengine.com/packages.html](https://tapestryengine.com/packages.html).

---

## Self-Hosting

```bash
npm ci
npm test      # 103 tests across 11 suites
npm start     # listens on :3002
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3002` | HTTP port |
| `DATA_DIR` | `/var/tapestry-registry/data` | SQLite + tarball storage root |
| `DB_PATH` | `$DATA_DIR/registry.db` | SQLite file path |
| `CONFIG_PATH` | `/var/tapestry-registry/registry-config.yaml` | YAML config file |
| `JWT_SECRET` | (required) | Token signing secret |

### Docker

```bash
docker run -p 3002:3002 \
  -e JWT_SECRET=... \
  -v /data/registry:/var/tapestry-registry/data \
  ghcr.io/tapestry-mud/tapestry-registry
```

Pushing to `master` builds and pushes a new image to `ghcr.io/tapestry-mud/tapestry-registry:latest`. The production droplet pulls the pre-built image.

---

## API Reference

**Base URL:** `https://registry.tapestryengine.com`

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/auth/register` | - | Create an account; returns `{access_token, refresh_token}` |
| POST | `/v1/auth/login` | - | Password login; returns `{access_token, refresh_token}` |
| POST | `/v1/auth/refresh` | refresh token (body) | Rotate: returns a new `{access_token, refresh_token}`. Reusing a rotated token revokes the whole session chain. |
| POST | `/v1/auth/logout` | refresh token (body) | Revoke the presented refresh token |
| POST | `/v1/token` | GitHub OIDC id-token (Bearer) | CI exchange: verify id-token, match a `trusted_publishers` binding, return a 15-min CI `{access_token}` (no refresh) |

### Packs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/packages/:scope/:name` | - | Pack metadata |
| GET | `/v1/packages/:scope/:name/:ver.tgz` | - | Download tarball |
| POST | `/v1/publish` | access token | Publish a tarball; optional multipart `tag` field sets an extra dist-tag, e.g. `stable` |
| GET | `/v1/search?q=` | - | Search by keyword |
| GET | `/v1/index.json` | - | Full catalog |

### Dist-Tags

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/packages/:scope/:name/dist-tags` | - | List tags |
| PATCH | `/v1/packages/:scope/:name/dist-tags/:tag` | access token | Set a tag |

### Engine Channels

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/engine-channels` | - | List all channels |
| GET | `/v1/engine-channels/:channel` | - | Get channel details |
| PATCH | `/v1/admin/engine-channels/:channel` | Admin | Update a channel |

### Presets

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/presets` | - | List presets |
| GET | `/v1/presets/:name` | - | Get preset (includes pack list) |
| PATCH | `/v1/admin/presets/:name` | Admin | Update a preset |

### Trusted Publishers

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/v1/trusted-publishers` | access token | Create a `scope → repo` binding (scope-owner or admin) |
| GET | `/v1/trusted-publishers?scope=` | access token | List bindings (own scopes; all if admin) |
| DELETE | `/v1/trusted-publishers/:id` | access token | Delete a binding (scope-owner or admin) |

### Access tokens

All authed routes accept one credential: a registry-minted HS256 JWT (~15-min TTL) with claim
`{sub, kind: "human" | "ci", scopes, admin}`. `/publish` authorizes when the requested scope is in
`token.scopes` **or** `token.admin` is true.

**Security invariant:** `admin` is server-derived from `accounts.is_admin` at mint time and is never
client-supplied; CI tokens are always `admin:false`. No mint endpoint accepts an `admin` or `scopes`
parameter. A future change MUST NOT add such a passthrough.

Humans: log in for a short access token + a 30-day rotating refresh token (silent renewal via
`/v1/auth/refresh`). CI: exchange a GitHub Actions OIDC id-token at `/v1/token` for a CI access token,
authorized by a `trusted_publishers` binding. Revocation: delete a refresh row (human) or a binding (CI);
access tokens expire on their own within 15 minutes.

### Ops

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/metrics` | Prometheus metrics |

---

## Engine-Channel CI Auth (OIDC)

Engine-channel registration — nightly (`build.yml`) and stable (`promote.yml`) in the engine repo — authenticates via **GitHub Actions OIDC**, not a stored secret. The workflow requests an id-token and sends it as the bearer to `PATCH /v1/admin/engine-channels/{channel}`; the registry verifies it (`requireCIAuth` → `verifyOIDC`) against GitHub's JWKS and the `OIDC_ALLOWED_REPOS` allowlist. There is **no `REGISTRY_CI_TOKEN` and no `ci` account** — both were removed in the 2026-05-29 auth redesign.

To authorize a repository to register channels, add its `owner/repo` to the comma-separated `OIDC_ALLOWED_REPOS` env var on the registry container.

---

## Stack

Node.js 22, Express, SQLite (better-sqlite3), JWT (jsonwebtoken + bcryptjs), Prometheus (prom-client).

---

## License

[AGPL-3.0](LICENSE)
