'use strict';

const request = require('supertest');
const { generateKeyPairSync } = require('crypto');
const jwt = require('jsonwebtoken');
const { createTestApp, cleanupTestApp } = require('./helpers');
const { _resetCacheForTest } = require('../src/ciAuth');
const { verifyToken } = require('../src/auth');

const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'https://registry.tapestryengine.com';
const KID = 'test-kid';

let privateKeyPem, publicKeyJwk, app, db, dataDir;

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  publicKeyJwk = publicKey.export({ format: 'jwk' });
});

beforeEach(() => {
  ({ app, db, dataDir } = createTestApp());
  const mockFetch = jest.fn(async (url) => {
    if (String(url).includes('jwks')) {
      return { ok: true, status: 200, json: async () => ({ keys: [{ ...publicKeyJwk, kid: KID, use: 'sig', alg: 'RS256' }] }) };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  _resetCacheForTest(mockFetch);
});
afterEach(() => cleanupTestApp({ db, dataDir }));

function mintIdToken(overrides = {}) {
  return jwt.sign(
    { iss: ISSUER, aud: AUDIENCE, repository: 'tapestry-mud/tapestry-packs', ...overrides },
    privateKeyPem, { algorithm: 'RS256', expiresIn: '1h', keyid: KID }
  );
}

describe('POST /v1/token', () => {
  test('mints a CI access token for a bound scope/repo', async () => {
    const res = await request(app).post('/v1/token')
      .set('Authorization', `Bearer ${mintIdToken()}`)
      .send({ scope: 'tapestry' });
    expect(res.status).toBe(200);
    const decoded = verifyToken(res.body.access_token);
    expect(decoded).toMatchObject({ sub: 'tapestry', kind: 'ci', scopes: ['tapestry'], admin: false });
    expect(res.body.refresh_token).toBeUndefined();
  });

  test('rejects when no binding matches the scope', async () => {
    const res = await request(app).post('/v1/token')
      .set('Authorization', `Bearer ${mintIdToken()}`)
      .send({ scope: 'someoneelse' });
    expect(res.status).toBe(403);
  });

  test('rejects when the OIDC repository does not match the binding', async () => {
    const res = await request(app).post('/v1/token')
      .set('Authorization', `Bearer ${mintIdToken({ repository: 'evil/fork' })}`)
      .send({ scope: 'tapestry' });
    expect(res.status).toBe(403);
  });

  test('rejects a forged id-token (wrong signing key)', async () => {
    const { privateKey: other } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const bad = jwt.sign(
      { iss: ISSUER, aud: AUDIENCE, repository: 'tapestry-mud/tapestry-packs' },
      other.export({ type: 'pkcs8', format: 'pem' }), { algorithm: 'RS256', expiresIn: '1h', keyid: KID }
    );
    const res = await request(app).post('/v1/token').set('Authorization', `Bearer ${bad}`).send({ scope: 'tapestry' });
    expect(res.status).toBe(401);
  });

  test('rejects a missing Authorization header', async () => {
    const res = await request(app).post('/v1/token').send({ scope: 'tapestry' });
    expect(res.status).toBe(401);
  });

  test('enforces ref constraint when the binding has one', async () => {
    db.prepare(`UPDATE trusted_publishers SET ref = 'refs/heads/master' WHERE scope = 'tapestry'`).run();
    const ok = await request(app).post('/v1/token')
      .set('Authorization', `Bearer ${mintIdToken({ ref: 'refs/heads/master' })}`).send({ scope: 'tapestry' });
    expect(ok.status).toBe(200);
    const bad = await request(app).post('/v1/token')
      .set('Authorization', `Bearer ${mintIdToken({ ref: 'refs/heads/dev' })}`).send({ scope: 'tapestry' });
    expect(bad.status).toBe(403);
  });
});
