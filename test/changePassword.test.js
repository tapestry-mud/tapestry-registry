const request = require('supertest');
const { createTestApp, cleanupTestApp, seedAccount } = require('./helpers');

let app, db, dataDir;
beforeEach(() => { ({ app, db, dataDir } = createTestApp()); });
afterEach(() => cleanupTestApp({ db, dataDir }));

describe('POST /v1/auth/change-password', () => {
  let token;
  beforeEach(async () => {
    seedAccount(db);
    const res = await request(app).post('/v1/auth/login').send({
      email: 'test@example.com',
      password: 'password',
    });
    token = res.body.token;
  });

  test('changes password with valid current password', async () => {
    const res = await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'password', newPassword: 'newpass123' });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Password updated');
  });

  test('new password works for login after change', async () => {
    await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'password', newPassword: 'newpass123' });
    const loginRes = await request(app).post('/v1/auth/login').send({
      email: 'test@example.com',
      password: 'newpass123',
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.body.token).toBeDefined();
  });

  test('rejects wrong current password', async () => {
    const res = await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'wrong', newPassword: 'newpass123' });
    expect(res.status).toBe(401);
  });

  test('rejects missing newPassword', async () => {
    const res = await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'password' });
    expect(res.status).toBe(400);
  });

  test('rejects missing currentPassword', async () => {
    const res = await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ newPassword: 'newpass123' });
    expect(res.status).toBe(400);
  });

  test('rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/v1/auth/change-password')
      .send({ currentPassword: 'password', newPassword: 'newpass123' });
    expect(res.status).toBe(401);
  });

  test('returns 401 when account is deleted after token was issued', async () => {
    db.prepare(`DELETE FROM accounts WHERE email = 'test@example.com'`).run();
    const res = await request(app)
      .post('/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'password', newPassword: 'newpass123' });
    expect(res.status).toBe(401);
  });
});
