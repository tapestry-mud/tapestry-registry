const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'test-secret' : null);
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET environment variable is required in production');
}
const BCRYPT_ROUNDS = process.env.NODE_ENV === 'test' ? 1 : 10;

const ACCESS_TTL_SECONDS = 15 * 60;
const REFRESH_TTL_DAYS = 30;

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

function signAccessToken({ sub, kind, scopes, admin }) {
  return jwt.sign(
    { sub, kind, scopes, admin: !!admin },
    JWT_SECRET,
    { expiresIn: ACCESS_TTL_SECONDS }
  );
}

function generateRefreshToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function hashRefreshToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

async function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'authorization required' });
  }
  try {
    req.user = verifyToken(header.slice(7));
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}

module.exports = {
  signToken, verifyToken, hashPassword, comparePassword, requireAuth,
  signAccessToken, generateRefreshToken, hashRefreshToken,
  ACCESS_TTL_SECONDS, REFRESH_TTL_DAYS,
};
