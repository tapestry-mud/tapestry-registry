# tapestry-registry

Package registry server for the [Tapestry MUD engine](https://github.com/tapestry-mud/tapestry-public).
Hosts packs published via `tapestry publish`.

## Stack

- Node.js 22, Express
- SQLite (better-sqlite3)
- JWT authentication (jsonwebtoken + bcryptjs)
- Prometheus metrics (prom-client)
- Docker / docker-compose

## Running locally

```bash
npm ci
npm test     # 103 tests across 11 suites
npm start    # listens on :3002
```

## Environment variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3002` | HTTP port |
| `DATA_DIR` | `/var/tapestry-registry/data` | SQLite + tarball storage root |
| `DB_PATH` | `$DATA_DIR/registry.db` | SQLite file location |
| `CONFIG_PATH` | `/var/tapestry-registry/registry-config.yaml` | YAML config file |
| `JWT_SECRET` | (required in prod) | Token signing secret |

## Deployment

Push to `master`. GitHub Actions runs tests, then SCPs source files to the droplet
and runs `docker compose up -d --build`. The `.env` file lives on the droplet
and is never touched by CI.

## CI account

The `ci@tapestryengine.com` account (handle: `ci`, is_admin: 1) is the automation identity used by
`tapestry-public` CI to update engine channel mappings after every Docker push. Its token is stored
as `REGISTRY_CI_TOKEN` in tapestry-public's GitHub Actions secrets.

To rotate the token (e.g., when the 1-year JWT expires), run on the droplet:

```bash
docker exec tapestry-registry sh -c \
  'JWT_SECRET=<secret> DB_PATH=/data/registry.db node /app/scripts/bootstrap-ci-account.js'
```

Copy the printed token and update the `REGISTRY_CI_TOKEN` secret in tapestry-public.

## API

- `GET /health` - health check
- `GET /metrics` - Prometheus metrics
- `POST /v1/auth/register` - create account
- `POST /v1/auth/login` - get JWT
- `GET /v1/index.json` - full package index
- `GET /v1/packages/:scope/:name` - package metadata
- `POST /v1/publish` - publish a tarball (JWT required)
- `GET /v1/search?q=` - search packages
- `GET /v1/engine-channels` - list engine channel mappings (nightly, stable, semver)
- `GET /v1/engine-channels/:channel` - get a single channel mapping
- `PATCH /v1/admin/engine-channels/:channel` - upsert a channel mapping (admin JWT required)
