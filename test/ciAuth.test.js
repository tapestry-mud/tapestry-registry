'use strict';

const { generateKeyPairSync } = require('crypto');
const jwt = require('jsonwebtoken');
const { requireCIAuth, _resetCacheForTest } = require('../src/ciAuth');

const ISSUER = 'https://token.actions.githubusercontent.com';
const AUDIENCE = 'https://registry.tapestryengine.com';
const KID = 'test-kid';
const ALLOWED_REPO = 'tapestry-mud/tapestry';

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

function mintToken(payloadOverrides = {}, jwtOptions = {}) {
  const payload = {
    iss: ISSUER,
    aud: AUDIENCE,
    repository: ALLOWED_REPO,
    ...payloadOverrides,
  };
  return jwt.sign(payload, privateKeyPem, {
    algorithm: 'RS256',
    expiresIn: '1h',
    keyid: KID,
    ...jwtOptions,
  });
}

function makeReqRes(token) {
  const req = { headers: token ? { authorization: `Bearer ${token}` } : {} };
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const next = jest.fn();
  return { req, res, next };
}

describe('requireCIAuth', () => {
  test('calls next() for a valid OIDC token', async () => {
    const token = mintToken();
    const { req, res, next } = makeReqRes(token);
    await requireCIAuth(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.ciAuth).toBe(true);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 401 when Authorization header is missing', async () => {
    const { req, res, next } = makeReqRes(null);
    await requireCIAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'CI authentication required' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when token is signed with wrong key', async () => {
    const { privateKey: otherKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const otherPem = otherKey.export({ type: 'pkcs8', format: 'pem' });
    const token = jwt.sign(
      { iss: ISSUER, aud: AUDIENCE, repository: ALLOWED_REPO },
      otherPem,
      { algorithm: 'RS256', expiresIn: '1h', keyid: KID }
    );
    const { req, res, next } = makeReqRes(token);
    await requireCIAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ error: 'CI token verification failed' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 for an expired token', async () => {
    const token = jwt.sign(
      { iss: ISSUER, aud: AUDIENCE, repository: ALLOWED_REPO, exp: Math.floor(Date.now() / 1000) - 60 },
      privateKeyPem,
      { algorithm: 'RS256', keyid: KID }
    );
    const { req, res, next } = makeReqRes(token);
    await requireCIAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when issuer is wrong', async () => {
    const token = mintToken({ iss: 'https://evil.example.com' });
    const { req, res, next } = makeReqRes(token);
    await requireCIAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when audience is wrong', async () => {
    const token = mintToken({ aud: 'https://other-service.example.com' });
    const { req, res, next } = makeReqRes(token);
    await requireCIAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when repository is not in allowed list', async () => {
    const token = mintToken({ repository: 'some-other-org/some-repo' });
    const { req, res, next } = makeReqRes(token);
    await requireCIAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'repository not authorized' });
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 403 when OIDC_ALLOWED_REPOS is not set', async () => {
    delete process.env.OIDC_ALLOWED_REPOS;
    const token = mintToken();
    const { req, res, next } = makeReqRes(token);
    await requireCIAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
    process.env.OIDC_ALLOWED_REPOS = ALLOWED_REPO;
  });

  test('caches JWKS: fetch is only called once across multiple requests', async () => {
    const token = mintToken();
    const { req: req1, res: res1, next: next1 } = makeReqRes(token);
    const { req: req2, res: res2, next: next2 } = makeReqRes(token);
    await requireCIAuth(req1, res1, next1);
    await requireCIAuth(req2, res2, next2);
    const jwksFetchCalls = mockFetch.mock.calls.filter(([url]) =>
      String(url).includes('jwks')
    );
    expect(jwksFetchCalls.length).toBe(1);
    expect(next1).toHaveBeenCalled();
    expect(next2).toHaveBeenCalled();
  });
});
