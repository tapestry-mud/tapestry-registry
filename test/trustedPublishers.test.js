const request = require('supertest');
const { createTestApp, cleanupTestApp, seedAccount, signAccess } = require('./helpers');

let app, db, dataDir;
beforeEach(() => { ({ app, db, dataDir } = createTestApp()); });
afterEach(() => cleanupTestApp({ db, dataDir }));

describe('POST /v1/trusted-publishers', () => {
  test('scope owner can create a binding', async () => {
    seedAccount(db, { handle: 'alice', email: 'a@x.com' });
    const res = await request(app).post('/v1/trusted-publishers')
      .set('Authorization', `Bearer ${signAccess({ sub: 'alice' })}`)
      .send({ scope: 'alice', repo: 'alice/packs' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ scope: 'alice', repo: 'alice/packs' });
  });

  test('non-owner non-admin is forbidden', async () => {
    seedAccount(db, { handle: 'bob', email: 'b@x.com' });
    const res = await request(app).post('/v1/trusted-publishers')
      .set('Authorization', `Bearer ${signAccess({ sub: 'bob' })}`)
      .send({ scope: 'alice', repo: 'bob/sneaky' });
    expect(res.status).toBe(403);
  });

  test('admin can create a binding for any scope', async () => {
    const res = await request(app).post('/v1/trusted-publishers')
      .set('Authorization', `Bearer ${signAccess({ sub: 'root', admin: true })}`)
      .send({ scope: 'someone', repo: 'org/repo' });
    expect(res.status).toBe(201);
  });

  test('requires authentication', async () => {
    const res = await request(app).post('/v1/trusted-publishers').send({ scope: 'x', repo: 'y/z' });
    expect(res.status).toBe(401);
  });

  test('rejects duplicate (scope, repo)', async () => {
    const auth = `Bearer ${signAccess({ sub: 'root', admin: true })}`;
    await request(app).post('/v1/trusted-publishers').set('Authorization', auth).send({ scope: 's', repo: 'r/r' });
    const dup = await request(app).post('/v1/trusted-publishers').set('Authorization', auth).send({ scope: 's', repo: 'r/r' });
    expect(dup.status).toBe(409);
  });
});

describe('GET /v1/trusted-publishers', () => {
  test('owner sees only their scope', async () => {
    const admin = `Bearer ${signAccess({ sub: 'root', admin: true })}`;
    await request(app).post('/v1/trusted-publishers').set('Authorization', admin).send({ scope: 'alice', repo: 'alice/p' });
    await request(app).post('/v1/trusted-publishers').set('Authorization', admin).send({ scope: 'bob', repo: 'bob/p' });
    const res = await request(app).get('/v1/trusted-publishers')
      .set('Authorization', `Bearer ${signAccess({ sub: 'alice' })}`);
    expect(res.status).toBe(200);
    expect(res.body.map(b => b.scope)).toEqual(['alice']);
  });

  test('admin sees all', async () => {
    const admin = `Bearer ${signAccess({ sub: 'root', admin: true })}`;
    await request(app).post('/v1/trusted-publishers').set('Authorization', admin).send({ scope: 'alice', repo: 'alice/p' });
    const res = await request(app).get('/v1/trusted-publishers').set('Authorization', admin);
    expect(res.body.length).toBeGreaterThanOrEqual(2); // includes the seeded 'tapestry' binding
  });
});

describe('DELETE /v1/trusted-publishers/:id', () => {
  test('owner can delete their binding', async () => {
    const auth = `Bearer ${signAccess({ sub: 'alice' })}`;
    seedAccount(db, { handle: 'alice', email: 'a@x.com' });
    const made = await request(app).post('/v1/trusted-publishers').set('Authorization', auth).send({ scope: 'alice', repo: 'alice/p' });
    const res = await request(app).delete(`/v1/trusted-publishers/${made.body.id}`).set('Authorization', auth);
    expect(res.status).toBe(200);
    const gone = db.prepare(`SELECT COUNT(*) c FROM trusted_publishers WHERE id = ?`).get(made.body.id).c;
    expect(gone).toBe(0);
  });

  test('non-owner cannot delete', async () => {
    const admin = `Bearer ${signAccess({ sub: 'root', admin: true })}`;
    const made = await request(app).post('/v1/trusted-publishers').set('Authorization', admin).send({ scope: 'alice', repo: 'alice/p' });
    const res = await request(app).delete(`/v1/trusted-publishers/${made.body.id}`)
      .set('Authorization', `Bearer ${signAccess({ sub: 'bob' })}`);
    expect(res.status).toBe(403);
  });
});
