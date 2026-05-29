const Database = require('better-sqlite3');

function initDb(dbPath = ':memory:') {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      handle        TEXT    UNIQUE NOT NULL,
      email         TEXT    UNIQUE NOT NULL,
      password_hash TEXT    NOT NULL,
      is_admin      INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS packages (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      scope        TEXT    NOT NULL,
      name         TEXT    NOT NULL,
      owner_handle TEXT    NOT NULL,
      created_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(scope, name)
    );

    CREATE TABLE IF NOT EXISTS versions (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      package_id   INTEGER NOT NULL REFERENCES packages(id) ON DELETE CASCADE,
      version      TEXT    NOT NULL,
      manifest     TEXT    NOT NULL,
      tarball_path TEXT    NOT NULL,
      tarball_size INTEGER NOT NULL,
      integrity    TEXT    NOT NULL,
      downloads    INTEGER NOT NULL DEFAULT 0,
      published_at TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(package_id, version)
    );

    CREATE TABLE IF NOT EXISTS engine_channels (
      channel     TEXT PRIMARY KEY,
      docker_tag  TEXT NOT NULL,
      version     TEXT NOT NULL,
      updated_at  DATETIME DEFAULT (datetime('now'))
    );

    INSERT OR IGNORE INTO engine_channels (channel, docker_tag, version)
      VALUES ('nightly', 'edge', 'edge');

    INSERT OR IGNORE INTO engine_channels (channel, docker_tag, version)
      VALUES ('stable', 'latest', 'latest');

    CREATE TABLE IF NOT EXISTS pack_tags (
      scope      TEXT NOT NULL,
      name       TEXT NOT NULL,
      tag        TEXT NOT NULL,
      version    TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (scope, name, tag)
    );

    CREATE TABLE IF NOT EXISTS presets (
      name           TEXT PRIMARY KEY,
      version        TEXT NOT NULL,
      engine_channel TEXT NOT NULL,
      packs          TEXT NOT NULL,
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS trusted_publishers (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      scope             TEXT    NOT NULL,
      repo              TEXT    NOT NULL,
      ref               TEXT,
      environment       TEXT,
      created_by_handle TEXT    NOT NULL,
      created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(scope, repo)
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      account_id  INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      token_hash  TEXT    NOT NULL,
      expires_at  TEXT    NOT NULL,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      revoked_at  TEXT
    );
  `);

  db.prepare(
    `INSERT OR IGNORE INTO presets (name, version, engine_channel, packs)
     VALUES ('starter', '0.0.1', 'stable', ?)`
  ).run(JSON.stringify({ '@tapestry/core': '0.0.2', '@tapestry/example-pack': '0.0.2' }));

  db.prepare(
    `INSERT OR IGNORE INTO trusted_publishers (scope, repo, ref, environment, created_by_handle)
     VALUES ('tapestry', 'tapestry-mud/tapestry-packs', NULL, NULL, 'system')`
  ).run();

  const hasPrivateCol = db.pragma('table_info(packages)').some(c => c.name === 'is_private');
  if (!hasPrivateCol) {
    db.exec('ALTER TABLE packages ADD COLUMN is_private INTEGER NOT NULL DEFAULT 0');
  }

  return db;
}

module.exports = { initDb };
