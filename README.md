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

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/auth/register` | Create an account |
| POST | `/v1/auth/login` | Get a JWT |

### Packs

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/packages/:scope/:name` | - | Pack metadata |
| GET | `/v1/packages/:scope/:name/:ver.tgz` | - | Download tarball |
| POST | `/v1/publish` | JWT | Publish a tarball |
| GET | `/v1/search?q=` | - | Search by keyword |
| GET | `/v1/index.json` | - | Full catalog |

### Dist-Tags

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/v1/packages/:scope/:name/dist-tags` | - | List tags |
| PATCH | `/v1/packages/:scope/:name/dist-tags/:tag` | JWT | Set a tag |

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

### Ops

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| GET | `/metrics` | Prometheus metrics |

---

## CI Token

The `ci` account (handle: `ci`, admin) is used by [tapestry-public](https://github.com/tapestry-mud/tapestry-public) CI to register engine channels after each Docker push. Its JWT is stored as `REGISTRY_CI_TOKEN` in GitHub Actions secrets.

To rotate (e.g., when the 1-year JWT expires):

```bash
docker exec tapestry-registry sh -c \
  'JWT_SECRET=<secret> DB_PATH=/data/registry.db node /app/scripts/bootstrap-ci-account.js'
```

Copy the printed token and update the `REGISTRY_CI_TOKEN` secret in tapestry-public.

---

## Stack

Node.js 22, Express, SQLite (better-sqlite3), JWT (jsonwebtoken + bcryptjs), Prometheus (prom-client).

---

## License

[AGPL-3.0](LICENSE)
