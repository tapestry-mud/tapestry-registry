'use strict';

const GITHUB_OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const JWKS_URL = `${GITHUB_OIDC_ISSUER}/.well-known/jwks.json`;

let _jwks = null;
let _jwtVerify = null;
let _fetchOverride = null;

async function _init() {
  if (_jwks && _jwtVerify) { return; }
  const { createRemoteJWKSet, customFetch, jwtVerify } = await import('jose');
  const opts = {};
  if (_fetchOverride) {
    opts[customFetch] = _fetchOverride;
  }
  _jwks = createRemoteJWKSet(new URL(JWKS_URL), opts);
  _jwtVerify = jwtVerify;
}

function _resetCacheForTest(fetchFn) {
  _jwks = null;
  _jwtVerify = null;
  _fetchOverride = fetchFn || null;
}

function _getAllowedRepos() {
  const raw = process.env.OIDC_ALLOWED_REPOS || '';
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

async function requireCIAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'CI authentication required' });
  }
  const token = authHeader.slice(7);

  let payload;
  try {
    await _init();
    ({ payload } = await _jwtVerify(token, _jwks, {
      issuer: GITHUB_OIDC_ISSUER,
      audience: 'https://registry.tapestryengine.com',
    }));
  } catch {
    return res.status(401).json({ error: 'CI token verification failed' });
  }

  const allowedRepos = _getAllowedRepos();
  if (allowedRepos.length === 0 || !allowedRepos.includes(payload.repository)) {
    return res.status(403).json({ error: 'repository not authorized' });
  }

  req.ciAuth = true;
  next();
}

module.exports = { requireCIAuth, _resetCacheForTest };
