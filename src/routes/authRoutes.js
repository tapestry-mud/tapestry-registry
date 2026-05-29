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

  return router;
}

module.exports = { createAuthRoutes, issueSession };
