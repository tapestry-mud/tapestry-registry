const express = require('express');
const { hashPassword, comparePassword, signToken, requireAuth } = require('../auth');

const RESERVED_HANDLES = ['tapestry', 'core', 'admin', 'system', 'official'];

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
      db.prepare(`INSERT INTO accounts (handle, email, password_hash) VALUES (?, ?, ?)`).run(handle, email, passwordHash);
      res.status(201).json({ token: signToken({ handle, email }) });
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
      res.json({ token: signToken({ handle: account.handle, email: account.email }) });
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
      const account = db.prepare(`SELECT * FROM accounts WHERE handle = ?`).get(req.user.handle);
      if (!(await comparePassword(currentPassword, account.password_hash))) {
        return res.status(401).json({ error: 'current password is incorrect' });
      }
      const newHash = await hashPassword(newPassword);
      db.prepare(`UPDATE accounts SET password_hash = ? WHERE handle = ?`).run(newHash, req.user.handle);
      res.json({ message: 'Password updated' });
    } catch (err) {
      res.status(500).json({ error: 'password update failed' });
    }
  });

  return router;
}

module.exports = { createAuthRoutes };
