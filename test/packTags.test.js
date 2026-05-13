'use strict';

const request = require('supertest');
const bcrypt = require('bcryptjs');
const { createTestApp, cleanupTestApp, seedAccount, seedPackage } = require('./helpers');

let app, db, dataDir;
beforeEach(() => {
  ({ app, db, dataDir } = createTestApp());
  seedAccount(db, { handle: 'pkgowner', email: 'owner@example.com' });
  seedPackage(db, { scope: 'tapestry', name: 'core', version: '1.0.0', ownerHandle: 'pkgowner' });
});
afterEach(() => cleanupTestApp({ db, dataDir }));

async function loginAs(email) {
  const r = await request(app).post('/v1/auth/login').send({ email, password: 'password' });
  return r.body.token;
}

describe('GET /v1/packages/@:scope/:name/dist-tags', () => {
  test('returns empty object when no tags set', async () => {
    const res = await request(app).get('/v1/packages/@tapestry/core/dist-tags');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({});
  });

  test('returns set tags', async () => {
    db.prepare(`INSERT INTO pack_tags (scope, name, tag, version) VALUES ('tapestry', 'core', 'stable', '1.0.0')`).run();
    const res = await request(app).get('/v1/packages/@tapestry/core/dist-tags');
    expect(res.status).toBe(200);
    expect(res.body.stable).toBe('1.0.0');
  });

  test('returns 404 for unknown package', async () => {
    const res = await request(app).get('/v1/packages/@tapestry/nonexistent/dist-tags');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /v1/packages/@:scope/:name/dist-tags/:tag', () => {
  test('requires authentication', async () => {
    const res = await request(app)
      .patch('/v1/packages/@tapestry/core/dist-tags/stable')
      .send({ version: '1.0.0' });
    expect(res.status).toBe(401);
  });

  test('owner can set a tag', async () => {
    const token = await loginAs('owner@example.com');
    const res = await request(app)
      .patch('/v1/packages/@tapestry/core/dist-tags/stable')
      .set('Authorization', `Bearer ${token}`)
      .send({ version: '1.0.0' });
    expect(res.status).toBe(200);
    const row = db.prepare(`SELECT version FROM pack_tags WHERE scope='tapestry' AND name='core' AND tag='stable'`).get();
    expect(row.version).toBe('1.0.0');
  });

  test('non-owner gets 403', async () => {
    db.prepare(`INSERT INTO accounts (handle, email, password_hash) VALUES ('other', 'other@example.com', ?)`).run(bcrypt.hashSync('password', 1));
    const r = await request(app).post('/v1/auth/login').send({ email: 'other@example.com', password: 'password' });
    const res = await request(app)
      .patch('/v1/packages/@tapestry/core/dist-tags/stable')
      .set('Authorization', `Bearer ${r.body.token}`)
      .send({ version: '1.0.0' });
    expect(res.status).toBe(403);
  });

  test('admin can set tag on any package', async () => {
    db.prepare(`UPDATE accounts SET is_admin = 1 WHERE handle = 'pkgowner'`).run();
    const token = await loginAs('owner@example.com');
    const res = await request(app)
      .patch('/v1/packages/@tapestry/core/dist-tags/stable')
      .set('Authorization', `Bearer ${token}`)
      .send({ version: '1.0.0' });
    expect(res.status).toBe(200);
  });

  test('rejects version not in registry', async () => {
    const token = await loginAs('owner@example.com');
    const res = await request(app)
      .patch('/v1/packages/@tapestry/core/dist-tags/stable')
      .set('Authorization', `Bearer ${token}`)
      .send({ version: '9.9.9' });
    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/version 9.9.9 not found/i);
  });

  test('upserts existing tag', async () => {
    db.prepare(`INSERT INTO pack_tags (scope, name, tag, version) VALUES ('tapestry', 'core', 'stable', '0.9.0')`).run();
    const token = await loginAs('owner@example.com');
    await request(app)
      .patch('/v1/packages/@tapestry/core/dist-tags/stable')
      .set('Authorization', `Bearer ${token}`)
      .send({ version: '1.0.0' });
    const row = db.prepare(`SELECT version FROM pack_tags WHERE scope='tapestry' AND name='core' AND tag='stable'`).get();
    expect(row.version).toBe('1.0.0');
  });

  test('returns 404 for unknown package', async () => {
    const token = await loginAs('owner@example.com');
    const res = await request(app)
      .patch('/v1/packages/@tapestry/nonexistent/dist-tags/stable')
      .set('Authorization', `Bearer ${token}`)
      .send({ version: '1.0.0' });
    expect(res.status).toBe(404);
  });
});

describe('GET /v1/packages/@:scope/:name includes dist_tags', () => {
  test('dist_tags present and empty when no tags set', async () => {
    const res = await request(app).get('/v1/packages/@tapestry/core');
    expect(res.status).toBe(200);
    expect(res.body.dist_tags).toEqual({});
  });

  test('dist_tags includes set tags', async () => {
    db.prepare(`INSERT INTO pack_tags (scope, name, tag, version) VALUES ('tapestry', 'core', 'latest', '1.0.0')`).run();
    const res = await request(app).get('/v1/packages/@tapestry/core');
    expect(res.status).toBe(200);
    expect(res.body.dist_tags.latest).toBe('1.0.0');
  });
});
