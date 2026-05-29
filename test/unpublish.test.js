const request = require('supertest');
const fs = require('fs');
const path = require('path');
const { createTestApp, cleanupTestApp, seedAccount, seedPackage } = require('./helpers');

let app, db, dataDir, token;
beforeEach(async () => {
  ({ app, db, dataDir } = createTestApp());
  seedAccount(db, { handle: 'owner', email: 'owner@example.com' });
  const res = await request(app).post('/v1/auth/login').send({
    email: 'owner@example.com',
    password: 'password',
  });
  token = res.body.access_token;
});
afterEach(() => cleanupTestApp({ db, dataDir }));

// Wraps seedPackage and also writes a real tarball file so delete tests can verify disk cleanup.
function seedVersionInDataDir(db, dataDir, {
  scope = 'owner',
  name = 'mypkg',
  version = '1.0.0',
  ownerHandle = 'owner',
} = {}) {
  const tgzDir = path.join(dataDir, 'packages', `@${scope}`, name);
  fs.mkdirSync(tgzDir, { recursive: true });
  const tgzPath = path.join(tgzDir, `${version}.tgz`);
  fs.writeFileSync(tgzPath, 'fake tarball content');

  // Use seedPackage for the DB rows, then update tarball_path to the real file location.
  const { packageId } = seedPackage(db, { scope, name, version, ownerHandle });
  db.prepare(`UPDATE versions SET tarball_path = ?, tarball_size = 100, integrity = 'sha256-test' WHERE package_id = ? AND version = ?`).run(tgzPath, packageId, version);

  const pkg = db.prepare(`SELECT id FROM packages WHERE scope = ? AND name = ?`).get(scope, name);
  return { pkg, tgzPath };
}

describe('DELETE /v1/packages/@:scope/:name/:version', () => {
  test('deletes the version row and its tarball', async () => {
    const { tgzPath } = seedVersionInDataDir(db, dataDir);

    const res = await request(app)
      .delete('/v1/packages/@owner/mypkg/1.0.0')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Unpublished @owner/mypkg@1.0.0');
    expect(fs.existsSync(tgzPath)).toBe(false);
    const ver = db.prepare(`SELECT * FROM versions WHERE version = '1.0.0'`).get();
    expect(ver).toBeUndefined();
  });

  test('deletes package row when last version is removed', async () => {
    seedVersionInDataDir(db, dataDir);

    await request(app)
      .delete('/v1/packages/@owner/mypkg/1.0.0')
      .set('Authorization', `Bearer ${token}`);

    const pkg = db.prepare(`SELECT * FROM packages WHERE scope = 'owner' AND name = 'mypkg'`).get();
    expect(pkg).toBeUndefined();
  });

  test('keeps package row when other versions remain', async () => {
    seedVersionInDataDir(db, dataDir, { version: '1.0.0' });
    seedVersionInDataDir(db, dataDir, { version: '2.0.0' });

    await request(app)
      .delete('/v1/packages/@owner/mypkg/1.0.0')
      .set('Authorization', `Bearer ${token}`);

    const pkg = db.prepare(`SELECT * FROM packages WHERE scope = 'owner' AND name = 'mypkg'`).get();
    expect(pkg).toBeDefined();
    const remaining = db.prepare(`SELECT * FROM versions WHERE version = '2.0.0'`).get();
    expect(remaining).toBeDefined();
  });

  test('returns 404 when package does not exist', async () => {
    const res = await request(app)
      .delete('/v1/packages/@owner/nosuchpkg/1.0.0')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('returns 404 when version does not exist', async () => {
    seedVersionInDataDir(db, dataDir);

    const res = await request(app)
      .delete('/v1/packages/@owner/mypkg/9.9.9')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('returns 403 when not the owner', async () => {
    seedVersionInDataDir(db, dataDir);
    seedAccount(db, { handle: 'other', email: 'other@example.com' });
    const otherLogin = await request(app).post('/v1/auth/login').send({
      email: 'other@example.com',
      password: 'password',
    });

    const res = await request(app)
      .delete('/v1/packages/@owner/mypkg/1.0.0')
      .set('Authorization', `Bearer ${otherLogin.body.access_token}`);
    expect(res.status).toBe(403);
  });

  test('does not fail when tarball file is already missing', async () => {
    const { tgzPath } = seedVersionInDataDir(db, dataDir);
    fs.unlinkSync(tgzPath);

    const res = await request(app)
      .delete('/v1/packages/@owner/mypkg/1.0.0')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('rejects unauthenticated request', async () => {
    seedVersionInDataDir(db, dataDir);
    const res = await request(app).delete('/v1/packages/@owner/mypkg/1.0.0');
    expect(res.status).toBe(401);
  });
});

describe('DELETE /v1/packages/@:scope/:name', () => {
  test('deletes all versions and their tarballs', async () => {
    const { tgzPath: tgz1 } = seedVersionInDataDir(db, dataDir, { version: '1.0.0' });
    const { tgzPath: tgz2 } = seedVersionInDataDir(db, dataDir, { version: '2.0.0' });

    const res = await request(app)
      .delete('/v1/packages/@owner/mypkg')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Unpublished all versions of @owner/mypkg');
    expect(fs.existsSync(tgz1)).toBe(false);
    expect(fs.existsSync(tgz2)).toBe(false);
    const pkg = db.prepare(`SELECT * FROM packages WHERE scope = 'owner' AND name = 'mypkg'`).get();
    expect(pkg).toBeUndefined();
  });

  test('returns 404 when package does not exist', async () => {
    const res = await request(app)
      .delete('/v1/packages/@owner/nosuchpkg')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('returns 403 when not the owner', async () => {
    seedVersionInDataDir(db, dataDir);
    seedAccount(db, { handle: 'other', email: 'other@example.com' });
    const otherLogin = await request(app).post('/v1/auth/login').send({
      email: 'other@example.com',
      password: 'password',
    });

    const res = await request(app)
      .delete('/v1/packages/@owner/mypkg')
      .set('Authorization', `Bearer ${otherLogin.body.access_token}`);
    expect(res.status).toBe(403);
  });
});

describe('Admin --force bypass', () => {
  let adminToken;
  beforeEach(async () => {
    seedAccount(db, { handle: 'adminuser', email: 'admin@example.com' });
    db.prepare(`UPDATE accounts SET is_admin = 1 WHERE handle = 'adminuser'`).run();
    const res = await request(app).post('/v1/auth/login').send({
      email: 'admin@example.com',
      password: 'password',
    });
    adminToken = res.body.access_token;
  });

  test('admin with force=true can delete a version they do not own', async () => {
    seedVersionInDataDir(db, dataDir);

    const res = await request(app)
      .delete('/v1/packages/@owner/mypkg/1.0.0?force=true')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test('admin with force=true can delete all versions of a package they do not own', async () => {
    seedVersionInDataDir(db, dataDir);

    const res = await request(app)
      .delete('/v1/packages/@owner/mypkg?force=true')
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
  });

  test('non-admin with force=true is still rejected', async () => {
    seedVersionInDataDir(db, dataDir);
    seedAccount(db, { handle: 'regular', email: 'regular@example.com' });
    const regularLogin = await request(app).post('/v1/auth/login').send({
      email: 'regular@example.com',
      password: 'password',
    });

    const res = await request(app)
      .delete('/v1/packages/@owner/mypkg/1.0.0?force=true')
      .set('Authorization', `Bearer ${regularLogin.body.access_token}`);
    expect(res.status).toBe(403);
  });
});
