'use strict';

const request = require('supertest');
const { createTestApp, cleanupTestApp, seedAccount } = require('./helpers');

let app, db, dataDir;
beforeEach(() => {
  ({ app, db, dataDir } = createTestApp());
  seedAccount(db, { handle: 'admin', email: 'admin@example.com' });
  db.prepare(`UPDATE accounts SET is_admin = 1 WHERE handle = 'admin'`).run();
  seedAccount(db, { handle: 'user', email: 'user@example.com' });
});
afterEach(() => cleanupTestApp({ db, dataDir }));

async function loginAs(email) {
  const r = await request(app).post('/v1/auth/login').send({ email, password: 'password' });
  return r.body.token;
}

describe('GET /v1/presets/:name', () => {
  test('returns the starter preset seeded by db.js', async () => {
    const res = await request(app).get('/v1/presets/starter');
    expect(res.status).toBe(200);
    expect(res.body.name).toBe('starter');
    expect(res.body.version).toBeDefined();
    expect(res.body.engine_channel).toBe('stable');
    expect(typeof res.body.packs).toBe('object');
  });

  test('packs field is an object of pinned versions', async () => {
    const res = await request(app).get('/v1/presets/starter');
    expect(res.body.packs['@tapestry/core']).toBeDefined();
    expect(res.body.packs['@tapestry/example-pack']).toBeDefined();
  });

  test('returns 404 for unknown preset', async () => {
    const res = await request(app).get('/v1/presets/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /v1/admin/presets/:name', () => {
  const payload = {
    version: '0.0.2',
    engine_channel: 'stable',
    packs: { '@tapestry/core': '0.0.3', '@tapestry/example-pack': '0.0.2' },
  };

  test('requires authentication', async () => {
    const res = await request(app).patch('/v1/admin/presets/starter').send(payload);
    expect(res.status).toBe(401);
  });

  test('non-admin gets 403', async () => {
    const token = await loginAs('user@example.com');
    const res = await request(app)
      .patch('/v1/admin/presets/starter')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.status).toBe(403);
  });

  test('admin can update the preset', async () => {
    const token = await loginAs('admin@example.com');
    const res = await request(app)
      .patch('/v1/admin/presets/starter')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    expect(res.status).toBe(200);
    const row = db.prepare(`SELECT * FROM presets WHERE name = 'starter'`).get();
    expect(row.version).toBe('0.0.2');
    expect(JSON.parse(row.packs)['@tapestry/core']).toBe('0.0.3');
  });

  test('updated packs are returned by GET', async () => {
    const token = await loginAs('admin@example.com');
    await request(app)
      .patch('/v1/admin/presets/starter')
      .set('Authorization', `Bearer ${token}`)
      .send(payload);
    const res = await request(app).get('/v1/presets/starter');
    expect(res.body.packs['@tapestry/core']).toBe('0.0.3');
  });

  test('creates preset if it does not exist', async () => {
    const token = await loginAs('admin@example.com');
    const res = await request(app)
      .patch('/v1/admin/presets/expert')
      .set('Authorization', `Bearer ${token}`)
      .send({ version: '1.0.0', engine_channel: 'stable', packs: { '@tapestry/core': '1.0.0' } });
    expect(res.status).toBe(200);
    const fetched = await request(app).get('/v1/presets/expert');
    expect(fetched.status).toBe(200);
  });
});
