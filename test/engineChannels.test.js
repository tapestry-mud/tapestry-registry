'use strict';

const request = require('supertest');
const { generateKeyPairSync } = require('crypto');
const jwt = require('jsonwebtoken');
const { createTestApp, cleanupTestApp } = require('./helpers');
const { _resetCacheForTest } = require('../src/ciAuth');

const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'https://registry.tapestryengine.com';
const KID = 'test-kid';
const ALLOWED_REPO = 'tapestry-mud/tapestry';

let app, db, dataDir;
let privateKeyPem;
let publicKeyJwk;
let mockFetch;

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privateKeyPem = privateKey.export({ type: 'pkcs8', format: 'pem' });
  publicKeyJwk = publicKey.export({ format: 'jwk' });
  process.env.OIDC_ALLOWED_REPOS = ALLOWED_REPO;
});

afterAll(() => {
  delete process.env.OIDC_ALLOWED_REPOS;
});

beforeEach(() => {
  ({ app, db, dataDir } = createTestApp());
  mockFetch = jest.fn(async (url) => {
    if (String(url).includes('jwks')) {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          keys: [{ ...publicKeyJwk, kid: KID, use: 'sig', alg: 'RS256' }],
        }),
      };
    }
    throw new Error(`Unexpected fetch: ${url}`);
  });
  _resetCacheForTest(mockFetch);
});

afterEach(() => {
  cleanupTestApp({ db, dataDir });
});

function mintCIToken(payloadOverrides = {}, jwtOptions = {}) {
  return jwt.sign(
    { iss: ISSUER, aud: AUDIENCE, repository: ALLOWED_REPO, ...payloadOverrides },
    privateKeyPem,
    { algorithm: 'RS256', expiresIn: '1h', keyid: KID, ...jwtOptions }
  );
}

describe('GET /v1/engine-channels', () => {
  test('returns the seeded channels', async () => {
    const res = await request(app).get('/v1/engine-channels');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThanOrEqual(2);
    const channels = res.body.map((r) => r.channel);
    expect(channels).toContain('nightly');
    expect(channels).toContain('stable');
  });

  test('each row has channel, docker_tag, version, updated_at', async () => {
    const res = await request(app).get('/v1/engine-channels');
    const nightly = res.body.find((r) => r.channel === 'nightly');
    expect(nightly).toMatchObject({ channel: 'nightly', docker_tag: 'edge', version: 'edge' });
    expect(nightly.updated_at).toBeTruthy();
  });
});

describe('GET /v1/engine-channels/:channel', () => {
  test('returns a single channel row', async () => {
    const res = await request(app).get('/v1/engine-channels/nightly');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ channel: 'nightly', docker_tag: 'edge', version: 'edge' });
  });

  test('returns 404 for unknown channel', async () => {
    const res = await request(app).get('/v1/engine-channels/unknown');
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/not found/i);
  });
});

describe('PATCH /v1/admin/engine-channels/:channel', () => {
  test('CI token can upsert an existing channel', async () => {
    const token = mintCIToken();
    const res = await request(app)
      .patch('/v1/admin/engine-channels/nightly')
      .set('Authorization', `Bearer ${token}`)
      .send({ docker_tag: '1.0.0', version: '1.0.0' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ channel: 'nightly', docker_tag: '1.0.0', version: '1.0.0' });
  });

  test('CI token can create a new channel row', async () => {
    const token = mintCIToken();
    const res = await request(app)
      .patch('/v1/admin/engine-channels/0.0.5')
      .set('Authorization', `Bearer ${token}`)
      .send({ docker_tag: '0.0.5', version: '0.0.5' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ channel: '0.0.5', docker_tag: '0.0.5', version: '0.0.5' });
  });

  test('returns 401 without token', async () => {
    const res = await request(app)
      .patch('/v1/admin/engine-channels/nightly')
      .send({ docker_tag: 'edge', version: 'edge' });
    expect(res.status).toBe(401);
  });

  test('returns 401 for an expired CI token', async () => {
    const token = jwt.sign(
      { iss: ISSUER, aud: AUDIENCE, repository: ALLOWED_REPO, exp: Math.floor(Date.now() / 1000) - 60 },
      privateKeyPem,
      { algorithm: 'RS256', keyid: KID }
    );
    const res = await request(app)
      .patch('/v1/admin/engine-channels/nightly')
      .set('Authorization', `Bearer ${token}`)
      .send({ docker_tag: 'edge', version: 'edge' });
    expect(res.status).toBe(401);
  });

  test('returns 403 for unauthorized repository', async () => {
    const token = mintCIToken({ repository: 'attacker/evil-repo' });
    const res = await request(app)
      .patch('/v1/admin/engine-channels/nightly')
      .set('Authorization', `Bearer ${token}`)
      .send({ docker_tag: 'edge', version: 'edge' });
    expect(res.status).toBe(403);
  });

  test('returns 400 when docker_tag is missing', async () => {
    const token = mintCIToken();
    const res = await request(app)
      .patch('/v1/admin/engine-channels/nightly')
      .set('Authorization', `Bearer ${token}`)
      .send({ version: 'edge' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/docker_tag/);
  });

  test('returns 400 when version is missing', async () => {
    const token = mintCIToken();
    const res = await request(app)
      .patch('/v1/admin/engine-channels/nightly')
      .set('Authorization', `Bearer ${token}`)
      .send({ docker_tag: 'edge' });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/version/);
  });
});
