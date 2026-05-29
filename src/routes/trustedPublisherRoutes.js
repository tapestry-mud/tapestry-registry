const express = require('express');
const { requireAuth } = require('../auth');

function createTrustedPublisherRoutes(db) {
  const router = express.Router();

  router.post('/trusted-publishers', requireAuth, (req, res) => {
    const { scope, repo, ref = null, environment = null } = req.body || {};
    if (!scope || !repo) {
      return res.status(400).json({ error: 'scope and repo are required' });
    }
    if (req.user.sub !== scope && !req.user.admin) {
      return res.status(403).json({ error: `not authorized to manage scope @${scope}` });
    }
    try {
      const info = db.prepare(
        `INSERT INTO trusted_publishers (scope, repo, ref, environment, created_by_handle)
         VALUES (?, ?, ?, ?, ?)`
      ).run(scope, repo, ref, environment, req.user.sub);
      const row = db.prepare(`SELECT * FROM trusted_publishers WHERE id = ?`).get(info.lastInsertRowid);
      res.status(201).json(row);
    } catch (err) {
      if (err.message.includes('UNIQUE constraint failed')) {
        return res.status(409).json({ error: 'binding already exists for this scope and repo' });
      }
      res.status(500).json({ error: 'failed to create binding' });
    }
  });

  router.get('/trusted-publishers', requireAuth, (req, res) => {
    const { scope } = req.query;
    let rows;
    if (req.user.admin) {
      rows = scope
        ? db.prepare(`SELECT * FROM trusted_publishers WHERE scope = ? ORDER BY id`).all(scope)
        : db.prepare(`SELECT * FROM trusted_publishers ORDER BY id`).all();
    } else {
      rows = db.prepare(`SELECT * FROM trusted_publishers WHERE scope = ? ORDER BY id`).all(req.user.sub);
    }
    res.json(rows);
  });

  router.delete('/trusted-publishers/:id', requireAuth, (req, res) => {
    const row = db.prepare(`SELECT * FROM trusted_publishers WHERE id = ?`).get(req.params.id);
    if (!row) {
      return res.status(404).json({ error: 'binding not found' });
    }
    if (req.user.sub !== row.scope && !req.user.admin) {
      return res.status(403).json({ error: 'not authorized to delete this binding' });
    }
    db.prepare(`DELETE FROM trusted_publishers WHERE id = ?`).run(req.params.id);
    res.json({ message: 'binding deleted' });
  });

  return router;
}

module.exports = { createTrustedPublisherRoutes };
