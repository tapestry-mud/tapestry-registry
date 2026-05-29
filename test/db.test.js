const { initDb } = require('../src/db');

let db;

beforeEach(() => {
  db = initDb(':memory:');
});

afterEach(() => {
  db.close();
});

test('creates accounts table', () => {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='accounts'`).get();
  expect(row).toBeTruthy();
});

test('creates packages table', () => {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='packages'`).get();
  expect(row).toBeTruthy();
});

test('creates versions table', () => {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='versions'`).get();
  expect(row).toBeTruthy();
});

test('enforces unique scope+name in packages', () => {
  db.prepare(`INSERT INTO packages (scope, name, owner_handle) VALUES ('tapestry', 'core', 'admin')`).run();
  expect(() => {
    db.prepare(`INSERT INTO packages (scope, name, owner_handle) VALUES ('tapestry', 'core', 'admin')`).run();
  }).toThrow(/UNIQUE/);
});

test('foreign key enforced on versions', () => {
  expect(() => {
    db.prepare(`INSERT INTO versions (package_id, version, manifest, tarball_path, tarball_size, integrity) VALUES (999, '1.0.0', '{}', '/tmp/x.tgz', 100, 'sha256-abc')`).run();
  }).toThrow(/FOREIGN KEY/);
});

test('creates engine_channels table', () => {
  const row = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='engine_channels'`).get();
  expect(row).toBeTruthy();
});

test('seeds nightly channel on init', () => {
  const row = db.prepare(`SELECT * FROM engine_channels WHERE channel = 'nightly'`).get();
  expect(row).toBeTruthy();
  expect(row.docker_tag).toBe('edge');
  expect(row.version).toBe('edge');
});

test('seeds stable channel on init', () => {
  const row = db.prepare(`SELECT * FROM engine_channels WHERE channel = 'stable'`).get();
  expect(row).toBeTruthy();
  expect(row.docker_tag).toBe('latest');
  expect(row.version).toBe('latest');
});

test('engine_channels channel is primary key (no duplicates)', () => {
  expect(() => {
    db.prepare(`INSERT INTO engine_channels (channel, docker_tag, version) VALUES ('nightly', 'x', 'x')`).run();
  }).toThrow(/UNIQUE/);
});

describe('auth-model tables', () => {
  let db;
  beforeEach(() => { db = initDb(':memory:'); });
  afterEach(() => { db.close(); });

  test('trusted_publishers table exists with expected columns', () => {
    const cols = db.pragma('table_info(trusted_publishers)').map(c => c.name);
    expect(cols).toEqual(expect.arrayContaining(
      ['id', 'scope', 'repo', 'ref', 'environment', 'created_by_handle', 'created_at']
    ));
  });

  test('refresh_tokens table exists with expected columns', () => {
    const cols = db.pragma('table_info(refresh_tokens)').map(c => c.name);
    expect(cols).toEqual(expect.arrayContaining(
      ['id', 'account_id', 'token_hash', 'expires_at', 'created_at', 'revoked_at']
    ));
  });

  test('seeds the tapestry -> tapestry-mud/tapestry-packs binding', () => {
    const row = db.prepare(
      `SELECT scope, repo, ref, environment, created_by_handle FROM trusted_publishers WHERE scope = 'tapestry'`
    ).get();
    expect(row).toMatchObject({
      scope: 'tapestry', repo: 'tapestry-mud/tapestry-packs',
      ref: null, environment: null, created_by_handle: 'system',
    });
  });

  test('seed is idempotent across re-init of the same db file', () => {
    const count = db.prepare(`SELECT COUNT(*) c FROM trusted_publishers WHERE scope = 'tapestry'`).get().c;
    expect(count).toBe(1);
  });
});
