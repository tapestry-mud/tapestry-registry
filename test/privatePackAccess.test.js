'use strict';

const request = require('supertest');
const path = require('path');
const fs = require('fs');
const { createTestApp, cleanupTestApp, seedAccount, seedPackage } = require('./helpers');

let app, db, dataDir;
beforeEach(() => {
  ({ app, db, dataDir } = createTestApp());
  seedAccount(db, { handle: 'owner', email: 'owner@example.com' });
  seedAccount(db, { handle: 'other', email: 'other@example.com' });
  seedPackage(db, {
    scope: 'owner', name: 'secret-pack', version: '1.0.0',
    ownerHandle: 'owner', isPrivate: true,
  });
  const tgzDir = path.join(dataDir, 'packages', '@owner', 'secret-pack');
  fs.mkdirSync(tgzDir, { recursive: true });
  fs.writeFileSync(path.join(tgzDir, '1.0.0.tgz'), 'secret-tarball');
});
afterEach(() => cleanupTestApp({ db, dataDir }));

async function loginAs(email) {
  const r = await request(app).post('/v1/auth/login').send({ email, password: 'password' });
  return r.body.token;
}

describe('private pack metadata - GET /v1/packages/@:scope/:name', () => {
  test('returns 404 to unauthenticated request', async () => {
    const res = await request(app).get('/v1/packages/@owner/secret-pack');
    expect(res.status).toBe(404);
  });

  test('returns 404 to authenticated non-owner', async () => {
    const token = await loginAs('other@example.com');
    const res = await request(app)
      .get('/v1/packages/@owner/secret-pack')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('returns 200 to owner', async () => {
    const token = await loginAs('owner@example.com');
    const res = await request(app)
      .get('/v1/packages/@owner/secret-pack')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });

  test('returns 200 to admin', async () => {
    seedAccount(db, { handle: 'admin', email: 'admin@example.com' });
    db.prepare(`UPDATE accounts SET is_admin = 1 WHERE handle = 'admin'`).run();
    const token = await loginAs('admin@example.com');
    const res = await request(app)
      .get('/v1/packages/@owner/secret-pack')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('private pack tarball - GET /v1/packages/@:scope/:name/:version.tgz', () => {
  test('returns 404 to unauthenticated request', async () => {
    const res = await request(app).get('/v1/packages/@owner/secret-pack/1.0.0.tgz');
    expect(res.status).toBe(404);
  });

  test('returns 404 to non-owner', async () => {
    const token = await loginAs('other@example.com');
    const res = await request(app)
      .get('/v1/packages/@owner/secret-pack/1.0.0.tgz')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });

  test('returns 200 to owner', async () => {
    const token = await loginAs('owner@example.com');
    const res = await request(app)
      .get('/v1/packages/@owner/secret-pack/1.0.0.tgz')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
  });
});

describe('private packs excluded from public endpoints', () => {
  test('excluded from GET /v1/index.json', async () => {
    const res = await request(app).get('/v1/index.json');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body.packages)).not.toContain('@owner/secret-pack');
  });

  test('excluded from GET /v1/search', async () => {
    const res = await request(app).get('/v1/search?q=secret');
    expect(res.status).toBe(200);
    expect(res.body.results.map(r => r.name)).not.toContain('@owner/secret-pack');
  });
});
