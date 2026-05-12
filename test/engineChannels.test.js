const request = require('supertest');
const { createTestApp, cleanupTestApp } = require('./helpers');

let app, db, dataDir;

beforeEach(() => {
  ({ app, db, dataDir } = createTestApp());
});

afterEach(() => cleanupTestApp({ db, dataDir }));

describe('GET /engine-channels', () => {
  test('returns the seeded channels', async () => {
    const res = await request(app).get('/engine-channels');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    const channels = res.body.map(r => r.channel);
    expect(channels).toContain('nightly');
    expect(channels).toContain('stable');
  });

  test('each row has channel, docker_tag, version, updated_at', async () => {
    const res = await request(app).get('/engine-channels');
    const nightly = res.body.find(r => r.channel === 'nightly');
    expect(nightly).toMatchObject({
      channel: 'nightly',
      docker_tag: 'edge',
      version: 'edge',
    });
    expect(nightly.updated_at).toBeTruthy();
  });
});

describe('GET /engine-channels/:channel', () => {
  test('returns a single channel row', async () => {
    const res = await request(app).get('/engine-channels/nightly');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      channel: 'nightly',
      docker_tag: 'edge',
      version: 'edge',
    });
  });

  test('returns 404 for unknown channel', async () => {
    const res = await request(app).get('/engine-channels/unknown');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

const bcrypt = require('bcryptjs');
const { signToken } = require('../src/auth');

function seedAdmin(db) {
  const hash = bcrypt.hashSync('password', 1);
  db.prepare(`INSERT INTO accounts (handle, email, password_hash, is_admin) VALUES (?, ?, ?, 1)`)
    .run('admin', 'admin@example.com', hash);
  return signToken({ handle: 'admin', email: 'admin@example.com' });
}

function seedUser(db) {
  const hash = bcrypt.hashSync('password', 1);
  db.prepare(`INSERT INTO accounts (handle, email, password_hash, is_admin) VALUES (?, ?, ?, 0)`)
    .run('regularuser', 'user@example.com', hash);
  return signToken({ handle: 'regularuser', email: 'user@example.com' });
}

describe('PATCH /admin/engine-channels/:channel', () => {
  test('admin can upsert an existing channel', async () => {
    const token = seedAdmin(db);
    const res = await request(app)
      .patch('/admin/engine-channels/nightly')
      .set('Authorization', `Bearer ${token}`)
      .send({ docker_tag: '1.0.0', version: '1.0.0' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ channel: 'nightly', docker_tag: '1.0.0', version: '1.0.0' });
  });

  test('admin can create a new channel row', async () => {
    const token = seedAdmin(db);
    const res = await request(app)
      .patch('/admin/engine-channels/0.0.5')
      .set('Authorization', `Bearer ${token}`)
      .send({ docker_tag: '0.0.5', version: '0.0.5' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ channel: '0.0.5', docker_tag: '0.0.5', version: '0.0.5' });
  });

  test('returns 401 without token', async () => {
    const res = await request(app)
      .patch('/admin/engine-channels/nightly')
      .send({ docker_tag: 'edge', version: 'edge' });
    expect(res.status).toBe(401);
  });

  test('returns 403 for non-admin user', async () => {
    const token = seedUser(db);
    const res = await request(app)
      .patch('/admin/engine-channels/nightly')
      .set('Authorization', `Bearer ${token}`)
      .send({ docker_tag: 'edge', version: 'edge' });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/admin/i);
  });

  test('returns 400 when docker_tag is missing', async () => {
    const token = seedAdmin(db);
    const res = await request(app)
      .patch('/admin/engine-channels/nightly')
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 'edge' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/docker_tag/);
  });

  test('returns 400 when version is missing', async () => {
    const token = seedAdmin(db);
    const res = await request(app)
      .patch('/admin/engine-channels/nightly')
      .set('Authorization', `Bearer ${token}`)
      .send({ docker_tag: 'edge' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/version/);
  });
});
