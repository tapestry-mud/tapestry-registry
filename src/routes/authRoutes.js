const express = require('express');
const {
  hashPassword, comparePassword, requireAuth,
  signAccessToken, generateRefreshToken, hashRefreshToken, REFRESH_TTL_DAYS,
} = require('../auth');

const RESERVED_HANDLES = ['tapestry', 'core', 'admin', 'system', 'official'];

function issueSession(db, account) {
  const access = signAccessToken({
    sub: account.handle,
    kind: 'human',
    scopes: [account.handle],
    admin: !!account.is_admin,
  });
  const refresh = generateRefreshToken();
  db.prepare(
    `INSERT INTO refresh_tokens (account_id, token_hash, expires_at)
     VALUES (?, ?, datetime('now', ?))`
  ).run(account.id, hashRefreshToken(refresh), `+${REFRESH_TTL_DAYS} days`);
  return { access_token: access, refresh_token: refresh };
}

function createAuthRoutes(db) {
  const router = express.Router();

  router.post('/register', async (req, res) => {
    const { handle, email, password } = req.body || {};
    if (!handle || !email || !password) {
      return res.status(400).json({ error: 'handle, email, and password are required' });
    }
    if (!/^[a-z0-9-]+$/.test(handle)) {
      return res.status(400).json({ error: 'handle must be lowercase alphanumeric with hyphens' });
    }
    if (RESERVED_HANDLES.includes(handle)) {
      return res.status(400).json({ error: `handle "${handle}" is reserved` });
    }
    try {
      const passwordHash = await hashPassword(password);
      const info = db.prepare(
        `INSERT INTO accounts (handle, email, password_hash) VALUES (?, ?, ?)`
      ).run(handle, email, passwordHash);
      const account = db.prepare(`SELECT id, handle, is_admin FROM accounts WHERE id = ?`).get(info.lastInsertRowid);
      res.status(201).json(issueSession(db, account));
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'handle or email already taken' });
      }
      res.status(500).json({ error: 'registration failed' });
    }
  });

  router.post('/login', async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }
    try {
      const account = db.prepare(`SELECT * FROM accounts WHERE email = ?`).get(email);
      if (!account || !(await comparePassword(password, account.password_hash))) {
        return res.status(401).json({ error: 'invalid credentials' });
      }
      res.json(issueSession(db, account));
    } catch (err) {
      res.status(500).json({ error: 'login failed' });
    }
  });

  router.post('/change-password', requireAuth, async (req, res) => {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    try {
      const account = db.prepare(`SELECT * FROM accounts WHERE handle = ?`).get(req.user.sub);
      if (!account || !(await comparePassword(currentPassword, account.password_hash))) {
        return res.status(401).json({ error: 'current password is incorrect' });
      }
      const newHash = await hashPassword(newPassword);
      db.prepare(`UPDATE accounts SET password_hash = ? WHERE handle = ?`).run(newHash, req.user.sub);
      res.json({ message: 'Password updated' });
    } catch (err) {
      res.status(500).json({ error: 'password update failed' });
    }
  });

  router.post('/refresh', (req, res) => {
    const { refresh_token: raw } = req.body || {};
    if (!raw) {
      return res.status(400).json({ error: 'refresh_token is required' });
    }
    const row = db.prepare(`SELECT * FROM refresh_tokens WHERE token_hash = ?`).get(hashRefreshToken(raw));
    if (!row) {
      return res.status(401).json({ error: 'invalid refresh token' });
    }
    if (row.revoked_at) {
      // Reuse of an already-revoked token => theft. Revoke the entire chain.
      db.prepare(
        `UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE account_id = ? AND revoked_at IS NULL`
      ).run(row.account_id);
      return res.status(401).json({ error: 'refresh token reuse detected; session revoked' });
    }
    const expired = db.prepare(`SELECT (expires_at <= datetime('now')) AS x FROM refresh_tokens WHERE id = ?`).get(row.id).x;
    if (expired) {
      return res.status(401).json({ error: 'refresh token expired' });
    }
    const account = db.prepare(`SELECT id, handle, is_admin FROM accounts WHERE id = ?`).get(row.account_id);
    if (!account) {
      return res.status(401).json({ error: 'invalid refresh token' });
    }
    // Rotate: revoke the presented row, then issue a fresh session.
    db.prepare(`UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE id = ?`).run(row.id);
    res.json(issueSession(db, account));
  });

  router.post('/logout', (req, res) => {
    const { refresh_token: raw } = req.body || {};
    if (raw) {
      db.prepare(
        `UPDATE refresh_tokens SET revoked_at = datetime('now') WHERE token_hash = ? AND revoked_at IS NULL`
      ).run(hashRefreshToken(raw));
    }
    res.json({ message: 'logged out' });
  });

  return router;
}

module.exports = { createAuthRoutes, issueSession };
