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
npm test     # 68 tests across 8 suites
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

## API

- `GET /health` - health check
- `GET /metrics` - Prometheus metrics
- `POST /v1/auth/register` - create account
- `POST /v1/auth/login` - get JWT
- `GET /v1/index.json` - full package index
- `GET /v1/packages/:scope/:name` - package metadata
- `POST /v1/publish` - publish a tarball (JWT required)
- `GET /v1/search?q=` - search packages
