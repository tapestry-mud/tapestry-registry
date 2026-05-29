const request = require('supertest');
const { createTestApp, cleanupTestApp } = require('./helpers');
const { verifyToken } = require('../src/auth');

let app, db, dataDir;
beforeEach(() => { ({ app, db, dataDir } = createTestApp()); });
afterEach(() => cleanupTestApp({ db, dataDir }));

describe('POST /v1/auth/register', () => {
  test('creates account and returns access+refresh', async () => {
    const res = await request(app).post('/v1/auth/register').send({
      handle: 'mallek',
      email: 'mallek@example.com',
      password: 'hunter2',
    });
    expect(res.status).toBe(201);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.refresh_token).toBeDefined();
  });

  test('rejects duplicate handle', async () => {
    const body = { handle: 'mallek', email: 'mallek@example.com', password: 'hunter2' };
    await request(app).post('/v1/auth/register').send(body);
    const res = await request(app).post('/v1/auth/register').send({ ...body, email: 'other@example.com' });
    expect(res.status).toBe(409);
  });

  test('rejects duplicate email', async () => {
    const body = { handle: 'mallek', email: 'mallek@example.com', password: 'hunter2' };
    await request(app).post('/v1/auth/register').send(body);
    const res = await request(app).post('/v1/auth/register').send({ ...body, handle: 'other' });
    expect(res.status).toBe(409);
  });

  test('rejects invalid handle characters', async () => {
    const res = await request(app).post('/v1/auth/register').send({
      handle: 'Bad Handle!',
      email: 'x@x.com',
      password: 'pass',
    });
    expect(res.status).toBe(400);
  });

  test('rejects missing fields', async () => {
    const res = await request(app).post('/v1/auth/register').send({ handle: 'mallek' });
    expect(res.status).toBe(400);
  });

  test.each(['tapestry', 'core', 'admin', 'system', 'official'])('rejects reserved handle "%s"', async (handle) => {
    const res = await request(app).post('/v1/auth/register').send({
      handle,
      email: `${handle}@example.com`,
      password: 'password',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/reserved/);
  });
});

describe('POST /v1/auth/login', () => {
  beforeEach(async () => {
    await request(app).post('/v1/auth/register').send({
      handle: 'mallek', email: 'mallek@example.com', password: 'hunter2',
    });
  });

  test('returns access+refresh on valid credentials', async () => {
    const res = await request(app).post('/v1/auth/login').send({
      email: 'mallek@example.com', password: 'hunter2',
    });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.refresh_token).toBeDefined();
  });

  test('login creates a refresh_tokens row and a human access token', async () => {
    const countRows = () => db.prepare(
      `SELECT COUNT(*) c FROM refresh_tokens rt JOIN accounts a ON a.id = rt.account_id WHERE a.handle = 'mallek'`
    ).get().c;
    const before = countRows();
    const res = await request(app).post('/v1/auth/login').send({
      email: 'mallek@example.com', password: 'hunter2',
    });
    const decoded = verifyToken(res.body.access_token);
    expect(decoded).toMatchObject({ sub: 'mallek', kind: 'human', scopes: ['mallek'], admin: false });
    expect(countRows()).toBe(before + 1);
  });

  test('rejects wrong password', async () => {
    const res = await request(app).post('/v1/auth/login').send({
      email: 'mallek@example.com', password: 'wrong',
    });
    expect(res.status).toBe(401);
  });

  test('rejects unknown email', async () => {
    const res = await request(app).post('/v1/auth/login').send({
      email: 'nobody@example.com', password: 'hunter2',
    });
    expect(res.status).toBe(401);
  });
});

async function loginRefresher() {
  await request(app).post('/v1/auth/register').send({
    handle: 'refresher', email: 'r@example.com', password: 'hunter2',
  });
  const res = await request(app).post('/v1/auth/login').send({ email: 'r@example.com', password: 'hunter2' });
  return res.body; // { access_token, refresh_token }
}

describe('POST /v1/auth/refresh', () => {
  test('rotates: returns a new access+refresh and revokes the old refresh', async () => {
    const s = await loginRefresher();
    const res = await request(app).post('/v1/auth/refresh').send({ refresh_token: s.refresh_token });
    expect(res.status).toBe(200);
    expect(res.body.access_token).toBeDefined();
    expect(res.body.refresh_token).toBeDefined();
    expect(res.body.refresh_token).not.toBe(s.refresh_token);
    expect(verifyToken(res.body.access_token).sub).toBe('refresher');
  });

  test('rejects an unknown refresh token', async () => {
    const res = await request(app).post('/v1/auth/refresh').send({ refresh_token: 'nope' });
    expect(res.status).toBe(401);
  });

  test('reuse of a rotated (revoked) token revokes the whole chain', async () => {
    const s = await loginRefresher();
    await request(app).post('/v1/auth/refresh').send({ refresh_token: s.refresh_token }); // rotate once
    // present the OLD (now revoked) token again -> theft
    const reuse = await request(app).post('/v1/auth/refresh').send({ refresh_token: s.refresh_token });
    expect(reuse.status).toBe(401);
    expect(reuse.body.error).toMatch(/reuse/i);
    // all of this account's refresh rows are now revoked
    const live = db.prepare(
      `SELECT COUNT(*) c FROM refresh_tokens rt JOIN accounts a ON a.id = rt.account_id
       WHERE a.handle = 'refresher' AND rt.revoked_at IS NULL`
    ).get().c;
    expect(live).toBe(0);
  });
});

describe('POST /v1/auth/logout', () => {
  test('revokes the presented refresh token', async () => {
    const s = await loginRefresher();
    const res = await request(app).post('/v1/auth/logout').send({ refresh_token: s.refresh_token });
    expect(res.status).toBe(200);
    const after = await request(app).post('/v1/auth/refresh').send({ refresh_token: s.refresh_token });
    expect(after.status).toBe(401);
  });

  test('logout is idempotent / safe for an unknown token', async () => {
    const res = await request(app).post('/v1/auth/logout').send({ refresh_token: 'whatever' });
    expect(res.status).toBe(200);
  });
});
