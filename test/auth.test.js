const {
  signToken, verifyToken, hashPassword, comparePassword, requireAuth,
  signAccessToken, generateRefreshToken, hashRefreshToken,
} = require('../src/auth');
const express = require('express');
const request = require('supertest');

describe('signAccessToken', () => {
  test('embeds the normalized claim and a ~15m expiry', () => {
    const token = signAccessToken({ sub: 'mallek', kind: 'human', scopes: ['mallek'], admin: false });
    const decoded = verifyToken(token);
    expect(decoded).toMatchObject({ sub: 'mallek', kind: 'human', scopes: ['mallek'], admin: false });
    const ttl = decoded.exp - decoded.iat;
    expect(ttl).toBe(15 * 60);
  });

  test('carries admin:true when passed (server-derived by caller)', () => {
    const token = signAccessToken({ sub: 'mallek', kind: 'human', scopes: ['mallek'], admin: true });
    expect(verifyToken(token).admin).toBe(true);
  });
});

describe('refresh token helpers', () => {
  test('generateRefreshToken returns a long opaque base64url string', () => {
    const t = generateRefreshToken();
    expect(typeof t).toBe('string');
    expect(t.length).toBeGreaterThanOrEqual(43); // 32 bytes base64url
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  test('generateRefreshToken is unique per call', () => {
    expect(generateRefreshToken()).not.toBe(generateRefreshToken());
  });

  test('hashRefreshToken is deterministic sha256 hex and not the raw value', () => {
    const raw = generateRefreshToken();
    const h = hashRefreshToken(raw);
    expect(h).toMatch(/^[a-f0-9]{64}$/);
    expect(h).toBe(hashRefreshToken(raw));
    expect(h).not.toBe(raw);
  });
});

test('signToken / verifyToken round-trip', () => {
  const token = signToken({ handle: 'mallek', email: 'mallek@example.com' });
  const payload = verifyToken(token);
  expect(payload.handle).toBe('mallek');
  expect(payload.email).toBe('mallek@example.com');
});

test('verifyToken throws on tampered token', () => {
  const token = signToken({ handle: 'mallek' });
  expect(() => verifyToken(token + 'tampered')).toThrow();
});

test('hashPassword / comparePassword round-trip', async () => {
  const hash = await hashPassword('hunter2');
  expect(await comparePassword('hunter2', hash)).toBe(true);
  expect(await comparePassword('wrong', hash)).toBe(false);
});

describe('requireAuth middleware', () => {
  let app;
  beforeEach(() => {
    app = express();
    app.get('/protected', requireAuth, (req, res) => {
      res.json({ handle: req.user.handle });
    });
  });

  test('rejects request with no Authorization header', async () => {
    const res = await request(app).get('/protected');
    expect(res.status).toBe(401);
  });

  test('rejects request with invalid token', async () => {
    const res = await request(app).get('/protected').set('Authorization', 'Bearer not-a-token');
    expect(res.status).toBe(401);
  });

  test('accepts request with valid token', async () => {
    const token = signToken({ handle: 'mallek', email: 'mallek@example.com' });
    const res = await request(app).get('/protected').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.handle).toBe('mallek');
  });
});
